/**
 * Page Planning - Visualisation du calendrier de consultations
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  Users,
  RefreshCw,
  Bell
} from 'lucide-react';
import {
  getDayAppointments,
  getWeekAppointments,
  getMonthSummary,
  calculateAge,
  formatTime,
  formatDate,
  type PlanningAppointment
} from '../services/planningService';
import { playNotificationSound } from '../utils/sounds';
import './Planning.css';

type ViewMode = 'day' | 'week' | 'month';

interface WaitingPatient {
  customerId: number;
  arrivedAt: Date;
}

// Agenda ID par défaut (Grégory)
const DEFAULT_AGENDA_ID = 1525;

export function Planning() {
  const navigate = useNavigate();
  
  // État
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<PlanningAppointment[]>([]);
  const [weekAppointments, setWeekAppointments] = useState<Map<string, PlanningAppointment[]>>(new Map());
  const [monthSummary, setMonthSummary] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [waitingRoom, setWaitingRoom] = useState<WaitingPatient[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<PlanningAppointment | null>(null);
  
  // Charger les données selon le mode de vue
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (viewMode === 'day') {
        const data = await getDayAppointments(DEFAULT_AGENDA_ID, currentDate);
        setAppointments(data);
      } else if (viewMode === 'week') {
        // Trouver le lundi de la semaine
        const monday = new Date(currentDate);
        monday.setDate(monday.getDate() - monday.getDay() + 1);
        const data = await getWeekAppointments(DEFAULT_AGENDA_ID, monday);
        setWeekAppointments(data);
      } else if (viewMode === 'month') {
        const data = await getMonthSummary(
          DEFAULT_AGENDA_ID,
          currentDate.getFullYear(),
          currentDate.getMonth()
        );
        setMonthSummary(data);
      }
    } catch (error) {
      console.error('Erreur chargement planning:', error);
    } finally {
      setLoading(false);
    }
  }, [viewMode, currentDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigation dates
  const goToday = () => setCurrentDate(new Date());
  
  const goPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const goNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  // Simuler l'arrivée d'un patient (en attendant le WebSocket)
  const simulatePatientArrival = (customerId: number) => {
    if (!waitingRoom.find(p => p.customerId === customerId)) {
      setWaitingRoom(prev => [...prev, { customerId, arrivedAt: new Date() }]);
      playNotificationSound();
    }
  };

  // Vérifier si un patient est en salle d'attente
  const isWaiting = (customerId: number) => {
    return waitingRoom.some(p => p.customerId === customerId);
  };

  // Générer les heures pour la vue journée (7h-20h)
  const hours = Array.from({ length: 14 }, (_, i) => i + 7);

  // Calculer la position verticale d'un RDV
  const getAppointmentStyle = (appt: PlanningAppointment) => {
    const start = new Date(appt.start_at);
    const end = new Date(appt.end_at);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const top = (startHour - 7) * 60; // 60px par heure
    const height = (endHour - startHour) * 60;
    return { top: `${top}px`, height: `${height}px` };
  };

  // Jours de la semaine pour la vue semaine
  const getWeekDays = () => {
    const monday = new Date(currentDate);
    monday.setDate(monday.getDate() - monday.getDay() + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      return day;
    });
  };

  // Jours du mois pour la vue mensuelle
  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: (Date | null)[] = [];
    
    // Jours vides avant le 1er
    const firstDayOfWeek = firstDay.getDay() || 7; // 1 = lundi
    for (let i = 1; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Jours du mois
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    
    return days;
  };

  return (
    <div className="planning-page">
      {/* Header */}
      <header className="planning-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <h1>Mon Planning</h1>
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
          <span className="current-date">
            {viewMode === 'month' 
              ? currentDate.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
              : formatDate(currentDate)
            }
          </span>
        </div>

        <div className="header-right">
          <div className="view-toggle">
            <button 
              className={viewMode === 'day' ? 'active' : ''} 
              onClick={() => setViewMode('day')}
            >
              Jour
            </button>
            <button 
              className={viewMode === 'week' ? 'active' : ''} 
              onClick={() => setViewMode('week')}
            >
              Semaine
            </button>
            <button 
              className={viewMode === 'month' ? 'active' : ''} 
              onClick={() => setViewMode('month')}
            >
              Mois
            </button>
          </div>
          <button className="btn-refresh" onClick={loadData} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </header>

      <div className="planning-content">
        {/* Salle d'attente */}
        {waitingRoom.length > 0 && (
          <div className="waiting-room-banner">
            <Bell size={18} className="bell-icon" />
            <span>{waitingRoom.length} patient{waitingRoom.length > 1 ? 's' : ''} en salle d'attente</span>
          </div>
        )}

        {/* Vue Jour */}
        {viewMode === 'day' && (
          <div className="day-view">
            <div className="time-grid">
              {hours.map(hour => (
                <div key={hour} className="time-slot">
                  <span className="time-label">{hour}:00</span>
                  <div className="time-line" />
                </div>
              ))}
              
              {/* RDV */}
              <div className="appointments-layer">
                {appointments.map(appt => (
                  <div
                    key={appt.id}
                    className={`appointment-card ${isWaiting(appt.customer_id) ? 'waiting' : ''} ${selectedAppointment?.id === appt.id ? 'selected' : ''}`}
                    style={getAppointmentStyle(appt)}
                    onClick={() => setSelectedAppointment(appt)}
                  >
                    <div className="appt-time">
                      {formatTime(appt.start_at)} - {formatTime(appt.end_at)}
                    </div>
                    <div className="appt-patient">
                      <span className="patient-lastname">{appt.patient_lastname?.toUpperCase()}</span>{' '}
                      <span className="patient-firstname">{appt.patient_firstname}</span>
                    </div>
                    {isWaiting(appt.customer_id) && (
                      <div className="waiting-badge">
                        <Users size={12} /> En attente
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Ligne de l'heure actuelle */}
              {currentDate.toDateString() === new Date().toDateString() && (
                <div 
                  className="current-time-line"
                  style={{ 
                    top: `${(new Date().getHours() + new Date().getMinutes() / 60 - 7) * 60}px` 
                  }}
                >
                  <div className="current-time-dot" />
                  <div className="current-time-text">
                    {new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </div>

            {/* Détail du RDV sélectionné */}
            {selectedAppointment && (
              <div className="appointment-detail">
                <h3>Détails du rendez-vous</h3>
                <div className="detail-row">
                  <Clock size={16} />
                  <span>{formatTime(selectedAppointment.start_at)} - {formatTime(selectedAppointment.end_at)}</span>
                </div>
                <div className="detail-row">
                  <User size={16} />
                  <span>
                    {selectedAppointment.patient_firstname} {selectedAppointment.patient_lastname}
                    {selectedAppointment.patient_birthdate && (
                      <span className="age"> ({calculateAge(selectedAppointment.patient_birthdate)} ans)</span>
                    )}
                  </span>
                </div>
                {selectedAppointment.patient_mobile && (
                  <div className="detail-row">
                    <Phone size={16} />
                    <a href={`tel:${selectedAppointment.patient_mobile}`}>
                      {selectedAppointment.patient_mobile}
                    </a>
                  </div>
                )}
                {selectedAppointment.patient_city && (
                  <div className="detail-row">
                    <MapPin size={16} />
                    <span>{selectedAppointment.patient_city}</span>
                  </div>
                )}
                <div className="detail-row type">
                  <Calendar size={16} />
                  <span>{selectedAppointment.title}</span>
                </div>
                
                <div className="detail-actions">
                  {!isWaiting(selectedAppointment.customer_id) ? (
                    <button 
                      className="btn-waiting"
                      onClick={() => simulatePatientArrival(selectedAppointment.customer_id)}
                    >
                      <Users size={16} />
                      Marquer en salle d'attente
                    </button>
                  ) : (
                    <button 
                      className="btn-start"
                      onClick={() => navigate(`/pro/consultation/${selectedAppointment.id}`)}
                    >
                      Démarrer la consultation
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vue Semaine */}
        {viewMode === 'week' && (
          <div className="week-view">
            <div className="week-header">
              <div className="week-time-header"></div>
              {getWeekDays().map(day => (
                <div 
                  key={day.toISOString()} 
                  className={`week-day-header ${day.toDateString() === new Date().toDateString() ? 'today' : ''}`}
                >
                  <span className="day-name">
                    {day.toLocaleDateString('fr-CH', { weekday: 'short' })}
                  </span>
                  <span className="day-number">{day.getDate()}</span>
                </div>
              ))}
            </div>
            <div className="week-grid-container">
              <div className="week-time-column">
                {hours.map(hour => (
                  <div key={hour} className="week-time-slot">
                    <span>{hour}:00</span>
                  </div>
                ))}
              </div>
              <div className="week-grid">
                {getWeekDays().map(day => {
                  const dayKey = day.toISOString().split('T')[0];
                  const dayAppointments = weekAppointments.get(dayKey) || [];
                  return (
                    <div 
                      key={day.toISOString()} 
                      className={`week-day-column ${day.toDateString() === new Date().toDateString() ? 'today' : ''}`}
                    >
                      {/* Lignes horaires */}
                      {hours.map(hour => (
                        <div key={hour} className="week-hour-line" />
                      ))}
                      {/* RDV positionnés */}
                      {dayAppointments.map(appt => {
                        const start = new Date(appt.start_at);
                        const end = new Date(appt.end_at);
                        const startHour = start.getHours() + start.getMinutes() / 60;
                        const endHour = end.getHours() + end.getMinutes() / 60;
                        const top = (startHour - 7) * 50;
                        const height = (endHour - startHour) * 50;
                        return (
                          <div 
                            key={appt.id} 
                            className={`week-appointment ${isWaiting(appt.customer_id) ? 'waiting' : ''}`}
                            style={{ top: `${top}px`, height: `${Math.max(height, 20)}px` }}
                            onClick={() => {
                              setCurrentDate(day);
                              setViewMode('day');
                              setSelectedAppointment(appt);
                            }}
                            title={`${formatTime(appt.start_at)} - ${appt.patient_lastname?.toUpperCase()} ${appt.patient_firstname}`}
                          >
                            <span className="time">{formatTime(appt.start_at)}</span>
                            <span className="name">{appt.patient_lastname?.toUpperCase()} {appt.patient_firstname?.charAt(0)}.</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Vue Mois */}
        {viewMode === 'month' && (
          <div className="month-view">
            <div className="month-header">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                <div key={day} className="month-day-header">{day}</div>
              ))}
            </div>
            <div className="month-grid">
              {getMonthDays().map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="month-day empty" />;
                }
                const dayKey = day.toISOString().split('T')[0];
                const count = monthSummary.get(dayKey) || 0;
                const isToday = day.toDateString() === new Date().toDateString();
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`month-day ${isToday ? 'today' : ''} ${count > 0 ? 'has-appointments' : ''}`}
                    onClick={() => {
                      setCurrentDate(day);
                      setViewMode('day');
                    }}
                  >
                    <span className="day-number">{day.getDate()}</span>
                    {count > 0 && (
                      <span className="appointment-count">{count} RDV</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

