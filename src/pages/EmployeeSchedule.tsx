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
  Info
} from 'lucide-react';
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

export function EmployeeSchedule() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedule, setSchedule] = useState<WorkSlot[]>(DEMO_SCHEDULE);
  const [stats, setStats] = useState<ActivityStats>(DEMO_STATS);
  const [requests, setRequests] = useState<PendingRequest[]>(DEMO_REQUESTS);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<WorkSlot | null>(null);

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
          <div className="sidebar-section">
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

