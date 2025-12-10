/**
 * Page Mes Horaires - Planning de travail & taux d'activité
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle,
  XCircle,
  Coffee,
  Sun,
  Moon,
  Palmtree,
  ArrowLeftRight,
  Info,
  Sparkles,
  Heart,
  MessageSquare,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { query } from '../services/mariadb';
import './EmployeeSchedule.css';

type ViewMode = 'day' | 'week' | 'month';

interface WorkSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  type: 'work' | 'break' | 'leave' | 'sick' | 'training';
  status: 'confirmed' | 'pending' | 'modified';
  hours: number;
  note?: string;
}

interface ActivityStats {
  contractHours: number; // Heures contractuelles par semaine
  plannedHours: number;
  workedHours: number;
  balance: number; // + ou - par rapport au contrat
  vacationDaysLeft: number;
  vacationDaysUsed: number;
}

interface PendingRequest {
  id: number;
  type: 'swap' | 'modification' | 'leave';
  date: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

interface SchedulingPreferences {
  // Préférences horaires
  preferred_time_slots: ('morning' | 'afternoon' | 'evening')[];
  preferred_days: string[]; // 'lundi', 'mardi', etc.
  avoided_days: string[];
  // Contraintes récurrentes
  recurring_constraints: string; // Texte libre
  // Impératifs connus à l'avance
  future_constraints: string; // Texte libre
  // Notes générales pour l'IA
  notes_for_ai: string;
  // Métadonnées
  last_updated?: string;
}

interface SeniorityScore {
  score: number; // 0-100
  level: 'new' | 'growing' | 'established' | 'senior';
  patientDemand: number; // Nombre moyen de demandes/semaine
  avgWaitTime: number; // Temps d'attente moyen en jours
  lastCalculated?: string;
}

// Données de démonstration
const DEMO_STATS: ActivityStats = {
  contractHours: 42,
  plannedHours: 168,
  workedHours: 162,
  balance: -6,
  vacationDaysLeft: 8,
  vacationDaysUsed: 17
};

const DEMO_SCHEDULE: WorkSlot[] = [
  // Lundi
  { id: 1, date: '2025-12-09', startTime: '08:00', endTime: '12:30', type: 'work', status: 'confirmed', hours: 4.5 },
  { id: 2, date: '2025-12-09', startTime: '12:30', endTime: '13:30', type: 'break', status: 'confirmed', hours: 0 },
  { id: 3, date: '2025-12-09', startTime: '13:30', endTime: '18:00', type: 'work', status: 'confirmed', hours: 4.5 },
  // Mardi
  { id: 4, date: '2025-12-10', startTime: '08:00', endTime: '12:30', type: 'work', status: 'confirmed', hours: 4.5 },
  { id: 5, date: '2025-12-10', startTime: '13:30', endTime: '18:00', type: 'work', status: 'confirmed', hours: 4.5 },
  // Mercredi
  { id: 6, date: '2025-12-11', startTime: '08:00', endTime: '12:30', type: 'work', status: 'confirmed', hours: 4.5 },
  { id: 7, date: '2025-12-11', startTime: '13:30', endTime: '16:00', type: 'work', status: 'modified', hours: 2.5, note: 'Fin anticipée (formation)' },
  // Jeudi
  { id: 8, date: '2025-12-12', startTime: '09:00', endTime: '12:30', type: 'work', status: 'pending', hours: 3.5, note: 'Demande de modification' },
  { id: 9, date: '2025-12-12', startTime: '13:30', endTime: '18:00', type: 'work', status: 'confirmed', hours: 4.5 },
  // Vendredi
  { id: 10, date: '2025-12-13', startTime: '08:00', endTime: '12:00', type: 'work', status: 'confirmed', hours: 4 },
  // Samedi - congé
  { id: 11, date: '2025-12-14', startTime: '08:00', endTime: '18:00', type: 'leave', status: 'confirmed', hours: 0, note: 'Congé personnel' },
];

const DEMO_REQUESTS: PendingRequest[] = [
  {
    id: 1,
    type: 'modification',
    date: '2025-12-12',
    description: 'Décalage horaire matin (9h au lieu de 8h)',
    status: 'pending',
    submittedAt: '2025-12-08'
  },
  {
    id: 2,
    type: 'swap',
    date: '2025-12-18',
    description: 'Échange avec Pascal Pagano',
    status: 'approved',
    submittedAt: '2025-12-05'
  }
];

interface EmployeeScheduleProps {
  user?: { id: number; employee_id?: number } | null;
}

export function EmployeeSchedule({ user }: EmployeeScheduleProps = {}) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedule, setSchedule] = useState<WorkSlot[]>(DEMO_SCHEDULE);
  const [stats, setStats] = useState<ActivityStats>(DEMO_STATS);
  const [requests, setRequests] = useState<PendingRequest[]>(DEMO_REQUESTS);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<WorkSlot | null>(null);
  
  // Préférences horaires pour l'IA
  const [showPreferences, setShowPreferences] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [preferences, setPreferences] = useState<SchedulingPreferences>({
    preferred_time_slots: [],
    preferred_days: [],
    avoided_days: [],
    recurring_constraints: '',
    future_constraints: '',
    notes_for_ai: ''
  });
  
  // Score de séniorité/demande patient
  const [seniorityScore, setSeniorityScore] = useState<SeniorityScore>({
    score: 25, // Valeur par défaut pour nouveaux
    level: 'new',
    patientDemand: 0,
    avgWaitTime: 0
  });

  const employeeId = user?.employee_id || user?.id;
  const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

  // Charger les préférences au démarrage
  useEffect(() => {
    if (employeeId) {
      loadPreferences();
    }
  }, [employeeId]);

  const loadPreferences = async () => {
    if (!employeeId) return;
    try {
      const result = await query<any>(
        `SELECT 
           JSON_EXTRACT(profile_json, '$.scheduling_preferences') as prefs,
           JSON_EXTRACT(profile_json, '$.seniority_score') as seniority,
           JSON_EXTRACT(profile_json, '$.hrStatus.date_entree') as date_entree
         FROM employees WHERE employee_id = ?`,
        [employeeId]
      );
      if (result.success && result.data?.[0]) {
        const row = result.data[0];
        
        // Charger préférences
        if (row.prefs) {
          const prefs = typeof row.prefs === 'string' 
            ? JSON.parse(row.prefs) 
            : row.prefs;
          if (prefs) {
            setPreferences(prev => ({ ...prev, ...prefs }));
          }
        }
        
        // Charger ou calculer score séniorité
        if (row.seniority) {
          const seniority = typeof row.seniority === 'string'
            ? JSON.parse(row.seniority)
            : row.seniority;
          if (seniority) {
            setSeniorityScore(seniority);
          }
        } else if (row.date_entree) {
          // Calculer un score basique basé sur l'ancienneté
          const dateEntree = new Date(row.date_entree.replace(/"/g, ''));
          const monthsWorked = Math.floor((Date.now() - dateEntree.getTime()) / (1000 * 60 * 60 * 24 * 30));
          const calculatedScore = Math.min(100, Math.max(5, monthsWorked * 2));
          
          let level: SeniorityScore['level'] = 'new';
          if (calculatedScore >= 75) level = 'senior';
          else if (calculatedScore >= 50) level = 'established';
          else if (calculatedScore >= 25) level = 'growing';
          
          setSeniorityScore({
            score: calculatedScore,
            level,
            patientDemand: 0,
            avgWaitTime: 0
          });
        }
      }
    } catch (e) {
      console.error('Erreur chargement préférences:', e);
    }
  };

  const savePreferences = async () => {
    if (!employeeId) return;
    setSavingPrefs(true);
    try {
      const prefsToSave = {
        ...preferences,
        last_updated: new Date().toISOString()
      };
      
      await query(
        `UPDATE employees 
         SET profile_json = JSON_SET(profile_json, '$.scheduling_preferences', CAST(? AS JSON))
         WHERE employee_id = ?`,
        [JSON.stringify(prefsToSave), employeeId]
      );
      
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 3000);
    } catch (e) {
      console.error('Erreur sauvegarde préférences:', e);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSavingPrefs(false);
    }
  };

  const toggleTimeSlot = (slot: 'morning' | 'afternoon' | 'evening') => {
    setPreferences(prev => ({
      ...prev,
      preferred_time_slots: prev.preferred_time_slots.includes(slot)
        ? prev.preferred_time_slots.filter(s => s !== slot)
        : [...prev.preferred_time_slots, slot]
    }));
  };

  const togglePreferredDay = (day: string) => {
    setPreferences(prev => ({
      ...prev,
      preferred_days: prev.preferred_days.includes(day)
        ? prev.preferred_days.filter(d => d !== day)
        : [...prev.preferred_days, day],
      // Retirer des jours évités si on le met en préféré
      avoided_days: prev.avoided_days.filter(d => d !== day)
    }));
  };

  const toggleAvoidedDay = (day: string) => {
    setPreferences(prev => ({
      ...prev,
      avoided_days: prev.avoided_days.includes(day)
        ? prev.avoided_days.filter(d => d !== day)
        : [...prev.avoided_days, day],
      // Retirer des jours préférés si on le met en évité
      preferred_days: prev.preferred_days.filter(d => d !== day)
    }));
  };

  // Navigation
  const goToday = () => setCurrentDate(new Date());
  
  const goPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  // Obtenir les jours de la semaine
  const getWeekDays = () => {
    const monday = new Date(currentDate);
    monday.setDate(monday.getDate() - monday.getDay() + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      return day;
    });
  };

  // Obtenir les créneaux d'un jour
  const getSlotsForDay = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return schedule.filter(s => s.date === dateStr);
  };

  // Calculer les heures du jour
  const getDayHours = (date: Date) => {
    const slots = getSlotsForDay(date);
    return slots.reduce((acc, s) => acc + s.hours, 0);
  };

  // Calculer les heures de la semaine
  const getWeekHours = () => {
    const days = getWeekDays();
    return days.reduce((acc, day) => acc + getDayHours(day), 0);
  };

  // Formater la date
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Obtenir l'icône de type
  const getSlotIcon = (type: WorkSlot['type']) => {
    switch (type) {
      case 'work': return <Clock size={14} />;
      case 'break': return <Coffee size={14} />;
      case 'leave': return <Palmtree size={14} />;
      case 'sick': return <AlertCircle size={14} />;
      case 'training': return <Info size={14} />;
    }
  };

  // Obtenir la couleur de statut
  const getStatusColor = (status: WorkSlot['status']) => {
    switch (status) {
      case 'confirmed': return 'status-confirmed';
      case 'pending': return 'status-pending';
      case 'modified': return 'status-modified';
    }
  };

  // Heures de travail (6h-20h)
  const hours = Array.from({ length: 15 }, (_, i) => i + 6);

  return (
    <div className="employee-schedule-page">
      {/* Header */}
      <header className="schedule-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Mes Horaires</h1>
            <p className="subtitle">Planning de travail & taux d'activité</p>
          </div>
        </div>

        <div className="header-center">
          <button className="btn-nav" onClick={goPrevious}>
            <ChevronLeft size={20} />
          </button>
          <button className="btn-today" onClick={goToday}>
            Aujourd'hui
          </button>
          <button className="btn-nav" onClick={goNext}>
            <ChevronRight size={20} />
          </button>
          <span className="current-period">
            {viewMode === 'month' 
              ? currentDate.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
              : viewMode === 'week'
              ? `Semaine du ${getWeekDays()[0].getDate()} au ${getWeekDays()[6].getDate()} ${currentDate.toLocaleDateString('fr-CH', { month: 'long' })}`
              : formatDate(currentDate)
            }
          </span>
        </div>

        <div className="header-right">
          <div className="view-toggle">
            <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>
              Jour
            </button>
            <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>
              Semaine
            </button>
            <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>
              Mois
            </button>
          </div>
          <button className="btn-request">
            <Plus size={18} />
            <span>Demande</span>
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Clock size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.contractHours}h</span>
            <span className="stat-label">Contrat / sem.</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Calendar size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{getWeekHours()}h</span>
            <span className="stat-label">Cette semaine</span>
          </div>
        </div>

        <div className={`stat-card ${stats.balance >= 0 ? 'positive' : 'negative'}`}>
          <div className={`stat-icon ${stats.balance >= 0 ? 'green' : 'red'}`}>
            {stats.balance >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.balance >= 0 ? '+' : ''}{stats.balance}h</span>
            <span className="stat-label">Solde heures</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <Palmtree size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.vacationDaysLeft}j</span>
            <span className="stat-label">Congés restants</span>
          </div>
        </div>

        <div className="stat-card progress-card">
          <div className="progress-header">
            <span>Progression mensuelle</span>
            <span className="progress-value">{Math.round((stats.workedHours / stats.plannedHours) * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(stats.workedHours / stats.plannedHours) * 100}%` }}
            />
          </div>
          <div className="progress-labels">
            <span>{stats.workedHours}h effectuées</span>
            <span>{stats.plannedHours}h prévues</span>
          </div>
        </div>
      </div>

      <div className="schedule-content">
        {/* Main Calendar */}
        <div className="schedule-main">
          {/* Vue Semaine */}
          {viewMode === 'week' && (
            <div className="week-schedule">
              <div className="week-header">
                <div className="time-column-header"></div>
                {getWeekDays().map(day => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const dayHours = getDayHours(day);
                  return (
                    <div key={day.toISOString()} className={`day-header ${isToday ? 'today' : ''}`}>
                      <span className="day-name">{day.toLocaleDateString('fr-CH', { weekday: 'short' })}</span>
                      <span className="day-number">{day.getDate()}</span>
                      <span className="day-hours">{dayHours}h</span>
                    </div>
                  );
                })}
              </div>

              <div className="week-body">
                <div className="time-column">
                  {hours.map(hour => (
                    <div key={hour} className="time-slot">
                      {hour}:00
                    </div>
                  ))}
                </div>

                {getWeekDays().map(day => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const slots = getSlotsForDay(day);
                  
                  return (
                    <div key={day.toISOString()} className={`day-column ${isToday ? 'today' : ''}`}>
                      {hours.map(hour => (
                        <div key={hour} className="hour-cell" />
                      ))}
                      
                      {/* Créneaux */}
                      {slots.map(slot => {
                        const startHour = parseInt(slot.startTime.split(':')[0]);
                        const startMin = parseInt(slot.startTime.split(':')[1]);
                        const endHour = parseInt(slot.endTime.split(':')[0]);
                        const endMin = parseInt(slot.endTime.split(':')[1]);
                        
                        const top = (startHour - 6 + startMin / 60) * 50;
                        const height = ((endHour - startHour) + (endMin - startMin) / 60) * 50;
                        
                        return (
                          <div
                            key={slot.id}
                            className={`schedule-slot ${slot.type} ${getStatusColor(slot.status)}`}
                            style={{ top: `${top}px`, height: `${height}px` }}
                            onClick={() => setSelectedSlot(slot)}
                          >
                            <div className="slot-header">
                              {getSlotIcon(slot.type)}
                              <span>{slot.startTime} - {slot.endTime}</span>
                            </div>
                            {slot.hours > 0 && <span className="slot-hours">{slot.hours}h</span>}
                            {slot.note && <span className="slot-note">{slot.note}</span>}
                          </div>
                        );
                      })}

                      {/* Ligne heure actuelle */}
                      {isToday && (
                        <div 
                          className="current-time-line"
                          style={{ 
                            top: `${(new Date().getHours() - 6 + new Date().getMinutes() / 60) * 50}px` 
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vue Jour */}
          {viewMode === 'day' && (
            <div className="day-schedule">
              <div className="day-detail-header">
                <h2>{formatDate(currentDate)}</h2>
                <div className="day-summary">
                  <span className="total-hours">{getDayHours(currentDate)}h de travail</span>
                </div>
              </div>
              
              <div className="day-timeline">
                {getSlotsForDay(currentDate).map(slot => (
                  <div 
                    key={slot.id} 
                    className={`timeline-slot ${slot.type} ${getStatusColor(slot.status)}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    <div className="timeline-time">
                      <span className="start">{slot.startTime}</span>
                      <span className="end">{slot.endTime}</span>
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-type">
                        {getSlotIcon(slot.type)}
                        <span>
                          {slot.type === 'work' && 'Travail'}
                          {slot.type === 'break' && 'Pause'}
                          {slot.type === 'leave' && 'Congé'}
                          {slot.type === 'sick' && 'Maladie'}
                          {slot.type === 'training' && 'Formation'}
                        </span>
                      </div>
                      {slot.hours > 0 && <span className="timeline-hours">{slot.hours}h</span>}
                      {slot.note && <p className="timeline-note">{slot.note}</p>}
                      <div className={`timeline-status ${slot.status}`}>
                        {slot.status === 'confirmed' && <><CheckCircle size={14} /> Confirmé</>}
                        {slot.status === 'pending' && <><AlertCircle size={14} /> En attente</>}
                        {slot.status === 'modified' && <><Info size={14} /> Modifié</>}
                      </div>
                    </div>
                  </div>
                ))}
                
                {getSlotsForDay(currentDate).length === 0 && (
                  <div className="no-schedule">
                    <Palmtree size={48} />
                    <p>Aucun horaire prévu ce jour</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vue Mois */}
          {viewMode === 'month' && (
            <div className="month-schedule">
              <div className="month-header">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                  <div key={day} className="month-day-header">{day}</div>
                ))}
              </div>
              <div className="month-grid">
                {(() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const days: (Date | null)[] = [];
                  
                  const firstDayOfWeek = firstDay.getDay() || 7;
                  for (let i = 1; i < firstDayOfWeek; i++) days.push(null);
                  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
                  
                  return days.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="month-cell empty" />;
                    
                    const isToday = day.toDateString() === new Date().toDateString();
                    const dayHours = getDayHours(day);
                    const slots = getSlotsForDay(day);
                    const hasLeave = slots.some(s => s.type === 'leave');
                    const hasPending = slots.some(s => s.status === 'pending');
                    
                    return (
                      <div
                        key={day.toISOString()}
                        className={`month-cell ${isToday ? 'today' : ''} ${hasLeave ? 'has-leave' : ''}`}
                        onClick={() => {
                          setCurrentDate(day);
                          setViewMode('day');
                        }}
                      >
                        <span className="cell-date">{day.getDate()}</span>
                        {dayHours > 0 && <span className="cell-hours">{dayHours}h</span>}
                        {hasLeave && <span className="cell-leave">🏖️</span>}
                        {hasPending && <span className="cell-pending">⏳</span>}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="schedule-sidebar">
          {/* Légende */}
          <div className="sidebar-section legend-section">
            <h3>Légende</h3>
            <div className="legend-list">
              <div className="legend-item">
                <span className="legend-color work"></span>
                <span>Travail</span>
              </div>
              <div className="legend-item">
                <span className="legend-color break"></span>
                <span>Pause</span>
              </div>
              <div className="legend-item">
                <span className="legend-color leave"></span>
                <span>Congé</span>
              </div>
              <div className="legend-item status-confirmed">
                <CheckCircle size={14} />
                <span>Confirmé</span>
              </div>
              <div className="legend-item status-pending">
                <AlertCircle size={14} />
                <span>En attente</span>
              </div>
              <div className="legend-item status-modified">
                <Info size={14} />
                <span>Modifié</span>
              </div>
            </div>
          </div>

          {/* Demandes en cours */}
          <div className="sidebar-section">
            <h3>Mes demandes</h3>
            <div className="requests-list">
              {requests.map(req => (
                <div key={req.id} className={`request-card ${req.status}`}>
                  <div className="request-icon">
                    {req.type === 'swap' && <ArrowLeftRight size={16} />}
                    {req.type === 'modification' && <Clock size={16} />}
                    {req.type === 'leave' && <Palmtree size={16} />}
                  </div>
                  <div className="request-content">
                    <p className="request-desc">{req.description}</p>
                    <span className="request-date">{req.date}</span>
                  </div>
                  <div className={`request-status ${req.status}`}>
                    {req.status === 'pending' && <AlertCircle size={14} />}
                    {req.status === 'approved' && <CheckCircle size={14} />}
                    {req.status === 'rejected' && <XCircle size={14} />}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-new-request">
              <Plus size={16} />
              Nouvelle demande
            </button>
          </div>

          {/* Préférences pour l'IA */}
          <div className="sidebar-section preferences-section">
            <button 
              className="preferences-toggle"
              onClick={() => setShowPreferences(!showPreferences)}
            >
              <div className="toggle-left">
                <Sparkles size={18} className="sparkle-icon" />
                <h3>Mes préférences</h3>
              </div>
              {showPreferences ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            <p className="preferences-hint">
              🤖 Ces informations aident l'IA à créer un planning qui vous convient
            </p>

            {/* Jauge de séniorité - toujours visible */}
            <div className="seniority-gauge-container">
              <div className="seniority-header">
                <span className="seniority-title">Votre positionnement</span>
                <span className="seniority-info" title="Basé sur l'ancienneté et les statistiques de demandes patients (bientôt)">ⓘ</span>
              </div>
              
              <div className="seniority-scale">
                <div className="scale-labels">
                  <div className="scale-label left">
                    <span className="label-icon">🌱</span>
                    <span className="label-text">Nouveau</span>
                    <span className="label-desc">Je m'adapte au planning</span>
                  </div>
                  <div className="scale-label right">
                    <span className="label-icon">⭐</span>
                    <span className="label-text">Sénior</span>
                    <span className="label-desc">Les patients s'adaptent</span>
                  </div>
                </div>
                
                <div className="scale-bar">
                  <div className="scale-track">
                    <div 
                      className="scale-fill"
                      style={{ width: `${seniorityScore.score}%` }}
                    />
                    <div 
                      className="scale-marker"
                      style={{ left: `${seniorityScore.score}%` }}
                    >
                      <div className="marker-dot" />
                      <div className="marker-label">
                        {seniorityScore.level === 'new' && 'En construction'}
                        {seniorityScore.level === 'growing' && 'En progression'}
                        {seniorityScore.level === 'established' && 'Établi'}
                        {seniorityScore.level === 'senior' && 'Référent'}
                      </div>
                    </div>
                  </div>
                  <div className="scale-ticks">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                </div>
              </div>
              
              <p className="seniority-message">
                {seniorityScore.level === 'new' && (
                  <>💡 En tant que nouveau praticien, votre planning sera optimisé pour maximiser votre visibilité et construire votre patientèle.</>
                )}
                {seniorityScore.level === 'growing' && (
                  <>📈 Votre patientèle se développe ! Vos préférences sont prises en compte tout en maintenant une bonne accessibilité.</>
                )}
                {seniorityScore.level === 'established' && (
                  <>✨ Vous avez une patientèle fidèle. Vos préférences horaires ont plus de poids dans la planification.</>
                )}
                {seniorityScore.level === 'senior' && (
                  <>🌟 Praticien de référence ! Les patients s'organisent selon vos disponibilités.</>
                )}
              </p>
            </div>

            {showPreferences && (
              <div className="preferences-content">
                {/* Créneaux préférés */}
                <div className="pref-group">
                  <label>Je préfère travailler :</label>
                  <div className="time-slots">
                    <button
                      className={`time-slot-btn ${preferences.preferred_time_slots.includes('morning') ? 'selected' : ''}`}
                      onClick={() => toggleTimeSlot('morning')}
                    >
                      <Sun size={16} />
                      Matin
                    </button>
                    <button
                      className={`time-slot-btn ${preferences.preferred_time_slots.includes('afternoon') ? 'selected' : ''}`}
                      onClick={() => toggleTimeSlot('afternoon')}
                    >
                      <Coffee size={16} />
                      Après-midi
                    </button>
                    <button
                      className={`time-slot-btn ${preferences.preferred_time_slots.includes('evening') ? 'selected' : ''}`}
                      onClick={() => toggleTimeSlot('evening')}
                    >
                      <Moon size={16} />
                      Soirée
                    </button>
                  </div>
                </div>

                {/* Jours préférés / évités */}
                <div className="pref-group">
                  <label>Jours de la semaine :</label>
                  <div className="days-grid">
                    {DAYS.map(day => (
                      <div key={day} className="day-pref">
                        <span className="day-name">{day.slice(0, 3)}</span>
                        <div className="day-buttons">
                          <button
                            className={`day-btn prefer ${preferences.preferred_days.includes(day) ? 'active' : ''}`}
                            onClick={() => togglePreferredDay(day)}
                            title="Je préfère"
                          >
                            <Heart size={12} />
                          </button>
                          <button
                            className={`day-btn avoid ${preferences.avoided_days.includes(day) ? 'active' : ''}`}
                            onClick={() => toggleAvoidedDay(day)}
                            title="À éviter"
                          >
                            <XCircle size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="legend-mini">
                    <span><Heart size={10} className="text-green" /> Préféré</span>
                    <span><XCircle size={10} className="text-red" /> À éviter</span>
                  </div>
                </div>

                {/* Contraintes récurrentes */}
                <div className="pref-group">
                  <label>
                    <Clock size={14} />
                    Contraintes récurrentes
                  </label>
                  <textarea
                    value={preferences.recurring_constraints}
                    onChange={e => setPreferences(prev => ({ ...prev, recurring_constraints: e.target.value }))}
                    placeholder="Ex: Pas le mercredi après-midi (garde d'enfant), jamais après 18h..."
                    rows={3}
                  />
                </div>

                {/* Impératifs futurs */}
                <div className="pref-group">
                  <label>
                    <Calendar size={14} />
                    Impératifs connus à l'avance
                  </label>
                  <textarea
                    value={preferences.future_constraints}
                    onChange={e => setPreferences(prev => ({ ...prev, future_constraints: e.target.value }))}
                    placeholder="Ex: Rendez-vous médical le 15/01, formation du 20 au 22/02..."
                    rows={3}
                  />
                </div>

                {/* Notes libres */}
                <div className="pref-group">
                  <label>
                    <MessageSquare size={14} />
                    Autres souhaits pour la planification
                  </label>
                  <textarea
                    value={preferences.notes_for_ai}
                    onChange={e => setPreferences(prev => ({ ...prev, notes_for_ai: e.target.value }))}
                    placeholder="Tout ce qui peut aider à créer un planning idéal pour vous..."
                    rows={4}
                  />
                </div>

                {/* Bouton sauvegarder */}
                <button 
                  className={`btn-save-prefs ${prefsSaved ? 'saved' : ''}`}
                  onClick={savePreferences}
                  disabled={savingPrefs}
                >
                  {savingPrefs ? (
                    <><Loader2 size={16} className="spin" /> Sauvegarde...</>
                  ) : prefsSaved ? (
                    <><CheckCircle size={16} /> Préférences enregistrées !</>
                  ) : (
                    <><Save size={16} /> Enregistrer mes préférences</>
                  )}
                </button>

                {preferences.last_updated && (
                  <p className="last-updated">
                    Dernière mise à jour : {new Date(preferences.last_updated).toLocaleDateString('fr-CH', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Infos période */}
          <div className="sidebar-section period-info">
            <h3>Ce mois-ci</h3>
            <div className="period-stats">
              <div className="period-stat">
                <Sun size={16} />
                <span>18 jours travaillés</span>
              </div>
              <div className="period-stat">
                <Moon size={16} />
                <span>2 soirées</span>
              </div>
              <div className="period-stat">
                <Coffee size={16} />
                <span>3 samedis</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

