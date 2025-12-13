/**
 * Espace de travail Ostéopathe - Synapse.poge
 * 
 * - Planning du jour avec statuts patients
 * - Salle d'attente avec notifications sonores
 * - Accès rapide aux fiches patients
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  BellRing,
  Volume2,
  VolumeX,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  FileText,
  Play,
  CheckCircle,
  Wifi,
  WifiOff,
  Banknote,
  UserCheck,
  Hourglass,
  CalendarDays
} from 'lucide-react';
import { useWebSocket } from '../services/websocketService';
import { 
  getAppointmentsByDate,
  getCustomerById,
  type DayAppointment
} from '../services/workspaceAgendaService';
import { getEmployeeProfile } from '../services/profileService';
import { 
  getStatusesByAgenda,
  startConsultation as dbStartConsultation,
  endConsultation as dbEndConsultation,
  updatePatientZone,
  getPatientZones,
  type AppointmentStatus,
  type PatientZone
} from '../services/appointmentStatusService';
import type { TeamMember } from '../types';
import type { PatientStatus } from '../types/synapse';
import { playNotificationSound, initAudioContext } from '../utils/sounds';
import { CabinetFloorPlan, type ZoneType, type PatientLocation } from '../components/CabinetFloorPlan';
import { getAppointmentsByDate as getAllAppointments } from '../services/workspaceAgendaService';
import { markPatientArrived } from '../services/appointmentStatusService';
import { MapPin } from 'lucide-react';
import './WorkspaceOsteo.css';

// Extension du type DayAppointment avec status WebSocket
interface ScheduleSlot extends DayAppointment {
  status: PatientStatus;
}

interface WorkspaceOsteoProps {
  user: TeamMember;
}

export function WorkspaceOsteo({ user }: WorkspaceOsteoProps) {
  const navigate = useNavigate();
  
  // WebSocket
  const employeeId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  const { 
    isConnected, 
    waitingRoom, 
    startConsultation, 
    endConsultation 
  } = useWebSocket('osteo', employeeId, `${user.prenom} ${user.nom}`);
  
  // État
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastNotification, setLastNotification] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<{
    appointment: ScheduleSlot;
    customer: { firstName: string; lastName: string; birthdate: string | null; phone: string | null; notes: string | null } | null;
  } | null>(null);
  const [activeConsultation, setActiveConsultation] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [agendaId, setAgendaId] = useState<number | null>(null);
  
  // Vue plan du cabinet
  const [viewMode, setViewMode] = useState<'planning' | 'plan'>('planning');
  const [allAppointments, setAllAppointments] = useState<DayAppointment[]>([]);
  const [patientLocations, setPatientLocations] = useState<PatientLocation[]>([]);
  
  // Prix moyen par consultation (à configurer)
  const PRIX_CONSULTATION = 130; // CHF
  
  // Charger l'agenda_id de l'employé depuis son profil
  useEffect(() => {
    async function loadAgendaId() {
      try {
        const profile = await getEmployeeProfile(employeeId);
        if (profile?.externalIds?.id_externe_agenda) {
          const id = parseInt(profile.externalIds.id_externe_agenda, 10);
          if (!isNaN(id)) {
            setAgendaId(id);
            console.log('[WorkspaceOsteo] Agenda ID chargé:', id);
          }
        }
      } catch (error) {
        console.error('[WorkspaceOsteo] Erreur chargement agenda_id:', error);
      }
    }
    loadAgendaId();
  }, [employeeId]);
  
  // Formater la date pour la DB
  const formatDateForDB = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Charger le planning depuis la DB
  const loadSchedule = useCallback(async () => {
    if (agendaId === null) {
      // Attendre que l'agenda_id soit chargé
      return;
    }
    
    setIsLoading(true);
    try {
      const dateStr = formatDateForDB(selectedDate);
      
      // Récupérer les RDV depuis la DB pour la date sélectionnée ET l'ostéo
      const appointments = await getAppointmentsByDate(selectedDate, agendaId);
      
      // Récupérer les statuts depuis la table appointment_status
      const dbStatuses = await getStatusesByAgenda(agendaId, dateStr);
      
      // Convertir en ScheduleSlot avec statut DB ou WebSocket
      const slots: ScheduleSlot[] = appointments.map(apt => {
        // D'abord vérifier le statut en DB
        const dbStatus = dbStatuses.find(s => s.appointment_id === apt.appointmentId);
        
        // Puis vérifier si le patient est en salle d'attente (via WebSocket temps réel)
        const waitingPatient = waitingRoom.find(w => w.appointmentId === apt.appointmentId);
        
        // Priorité : WebSocket > DB > défaut
        let status: PatientStatus = apt.status;
        let hasArrived = apt.hasArrived;
        
        if (dbStatus) {
          status = dbStatus.status as PatientStatus;
          hasArrived = dbStatus.status !== 'scheduled';
        }
        
        if (waitingPatient) {
          status = waitingPatient.status;
          hasArrived = true;
        }
        
        return {
          ...apt,
          status,
          hasArrived
        };
      });
      
      setSchedule(slots);
    } catch (error) {
      console.error('Erreur chargement planning:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, agendaId, waitingRoom]);
  
  // Charger au démarrage et quand la date ou l'agenda change
  useEffect(() => {
    if (agendaId !== null) {
      loadSchedule();
    }
  }, [selectedDate, agendaId, loadSchedule]);
  
  // Charger tous les RDV et zones pour la vue plan (tous les ostéos)
  useEffect(() => {
    if (viewMode === 'plan') {
      const loadAllAppointments = async () => {
        try {
          const dateStr = formatDateForDB(selectedDate);
          
          // Charger les RDV
          const appointments = await getAllAppointments(selectedDate);
          setAllAppointments(appointments);
          
          // Charger les zones depuis la DB
          const zones = await getPatientZones(dateStr);
          const locations: PatientLocation[] = zones.map(z => ({
            odId: z.appointmentId,
            zone: z.zone as ZoneType
          }));
          setPatientLocations(locations);
          console.log('[WorkspaceOsteo] Zones chargées:', locations.length);
        } catch (error) {
          console.error('[WorkspaceOsteo] Erreur chargement RDV plan:', error);
        }
      };
      loadAllAppointments();
    }
  }, [viewMode, selectedDate]);
  
  // Gestion du déplacement de patient sur le plan
  const handlePatientMove = async (appointmentId: number, fromZone: ZoneType, toZone: ZoneType) => {
    // Mettre à jour l'état local immédiatement
    setPatientLocations(prev => {
      const existing = prev.find(p => p.odId === appointmentId);
      if (existing) {
        return prev.map(p => p.odId === appointmentId ? { ...p, zone: toZone } : p);
      }
      return [...prev, { odId: appointmentId, zone: toZone }];
    });

    // Trouver le RDV pour avoir l'agenda_id
    const apt = allAppointments.find(a => a.appointmentId === appointmentId);
    if (!apt) return;

    // Sauvegarder la zone dans la DB
    try {
      await updatePatientZone(appointmentId, formatDateForDB(selectedDate), apt.agendaId, toZone as PatientZone, employeeId);
      console.log(`[WorkspaceOsteo] Zone sauvegardée: ${toZone}`);
    } catch (error) {
      console.error('[WorkspaceOsteo] Erreur sauvegarde zone:', error);
    }
  };
  
  // Navigation de date
  const goToPreviousDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  };
  
  const goToNextDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  };
  
  const goToToday = () => {
    setSelectedDate(new Date());
  };
  
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  
  const formatSelectedDate = () => {
    if (isToday) {
      return "Aujourd'hui";
    }
    return selectedDate.toLocaleDateString('fr-CH', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };
  
  // Mettre à jour le planning quand la salle d'attente change
  useEffect(() => {
    setSchedule(prev => prev.map(slot => {
      const waitingPatient = waitingRoom.find(w => w.appointmentId === slot.appointmentId);
      if (waitingPatient) {
        return {
          ...slot,
          status: waitingPatient.status,
          hasArrived: true
        };
      }
      return slot;
    }));
  }, [waitingRoom]);
  
  // Notification sonore quand un patient arrive en salle d'attente
  useEffect(() => {
    const myWaitingPatients = waitingRoom.filter(
      p => p.assignedTo === employeeId && p.status === 'waiting'
    );
    
    if (myWaitingPatients.length > 0) {
      const latestPatient = myWaitingPatients[myWaitingPatients.length - 1];
      
      // Jouer le son si c'est un nouveau patient
      if (latestPatient.appointmentId.toString() !== lastNotification && soundEnabled) {
        playNotificationSound();
        setLastNotification(latestPatient.appointmentId.toString());
      }
    }
  }, [waitingRoom, employeeId, soundEnabled, lastNotification]);
  
  
  // Ouvrir la fiche patient
  const openPatientCard = async (slot: ScheduleSlot) => {
    const customer = await getCustomerById(slot.customerId);
    setSelectedPatient({ 
      appointment: slot, 
      customer: customer ? {
        firstName: customer.firstName,
        lastName: customer.lastName,
        birthdate: customer.birthdate,
        phone: customer.phone,
        notes: customer.notes
      } : null
    });
  };
  
  // Démarrer une consultation
  const handleStartConsultation = async (appointmentId: number) => {
    // Mettre à jour via WebSocket (temps réel)
    startConsultation(appointmentId);
    setActiveConsultation(appointmentId);
    
    // Mettre à jour en DB
    const dateStr = formatDateForDB(selectedDate);
    if (agendaId) {
      await dbStartConsultation(appointmentId, dateStr, agendaId, employeeId);
    }
    
    // Mettre à jour le statut local
    setSchedule(prev => prev.map(slot => 
      slot.appointmentId === appointmentId 
        ? { ...slot, status: 'in_progress' as PatientStatus }
        : slot
    ));
  };
  
  // Terminer une consultation
  const handleEndConsultation = async (appointmentId: number) => {
    // Mettre à jour via WebSocket
    endConsultation(appointmentId);
    setActiveConsultation(null);
    
    // Mettre à jour en DB
    const dateStr = formatDateForDB(selectedDate);
    await dbEndConsultation(appointmentId, dateStr, employeeId);
    
    // Mettre à jour le statut local
    setSchedule(prev => prev.map(slot => 
      slot.appointmentId === appointmentId 
        ? { ...slot, status: 'completed' as PatientStatus }
        : slot
    ));
  };
  
  // Heure actuelle pour le timeline
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Statistiques de la journée
  const dayStats = useMemo(() => {
    // Patients à venir (pas encore vus, heure de RDV dans le futur ou en attente)
    const upcoming = schedule.filter(s => 
      s.status === 'scheduled' || s.status === 'arrived'
    );
    
    // Patients en salle d'attente
    const waiting = schedule.filter(s => s.status === 'waiting');
    
    // Patients en consultation
    const inProgress = schedule.filter(s => s.status === 'in_progress');
    
    // Consultations terminées
    const completed = schedule.filter(s => s.status === 'completed');
    
    // CA du jour (consultations terminées * prix)
    const caJour = completed.length * PRIX_CONSULTATION;
    
    // CA potentiel (tous les RDV du jour)
    const caPotentiel = schedule.length * PRIX_CONSULTATION;
    
    return {
      upcoming,
      waiting,
      inProgress,
      completed,
      caJour,
      caPotentiel,
      totalPatients: schedule.length
    };
  }, [schedule, PRIX_CONSULTATION]);
  
  // Couleur selon le statut
  const getStatusColor = (status: PatientStatus): string => {
    switch (status) {
      case 'waiting': return 'status-waiting';
      case 'in_progress': return 'status-in-progress';
      case 'completed': return 'status-completed';
      case 'arrived': return 'status-arrived';
      case 'no_show': return 'status-no-show';
      default: return 'status-scheduled';
    }
  };
  
  const getStatusLabel = (status: PatientStatus): string => {
    switch (status) {
      case 'waiting': return 'En salle d\'attente';
      case 'in_progress': return 'En consultation';
      case 'completed': return 'Terminé';
      case 'arrived': return 'Arrivé';
      case 'no_show': return 'Absent';
      default: return 'Prévu';
    }
  };

  // Initialiser le contexte audio au premier clic
  useEffect(() => {
    const handleFirstClick = () => {
      initAudioContext();
      document.removeEventListener('click', handleFirstClick);
    };
    document.addEventListener('click', handleFirstClick);
    return () => document.removeEventListener('click', handleFirstClick);
  }, []);

  return (
    <div className="workspace-osteo">
      {/* Header */}
      <header className="workspace-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ChevronLeft size={20} />
          </button>
          <div className="header-title">
            <h1>Mon espace de travail</h1>
          </div>
          
        </div>
        
        {/* Navigation de date */}
        <div className="date-navigator">
          <button className="btn-nav" onClick={goToPreviousDay} title="Jour précédent">
            <ChevronLeft size={20} />
          </button>
          <div className="date-display" onClick={goToToday} title="Revenir à aujourd'hui">
            <CalendarDays size={18} />
            <span className={`date-text ${isToday ? 'today' : ''}`}>
              {formatSelectedDate()}
            </span>
            {!isToday && (
              <span className="date-year">{selectedDate.getFullYear()}</span>
            )}
          </div>
          <button className="btn-nav" onClick={goToNextDay} title="Jour suivant">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="header-right">
          {/* Indicateur WebSocket */}
          <div className={`ws-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{isConnected ? 'Connecté' : 'Déconnecté'}</span>
          </div>
          
          {/* Toggle son */}
          <button 
            className={`btn-sound ${soundEnabled ? 'enabled' : 'disabled'}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Désactiver les sons' : 'Activer les sons'}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          
          {/* Rafraîchir */}
          <button 
            className="btn-refresh"
            onClick={() => loadSchedule()}
            disabled={isLoading}
            title="Rafraîchir depuis la DB"
          >
            <RefreshCw size={20} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </header>
      
      {/* Barre d'onglets */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 20px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <button
          onClick={() => setViewMode('planning')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: viewMode === 'planning' ? '#3b82f6' : '#f1f5f9',
            color: viewMode === 'planning' ? 'white' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Calendar size={18} /> Mon Planning
        </button>
        <button
          onClick={() => setViewMode('plan')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: viewMode === 'plan' ? '#3b82f6' : '#f1f5f9',
            color: viewMode === 'plan' ? 'white' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <MapPin size={18} /> Vue Cabinet
        </button>
      </div>
      
      {/* Contenu principal */}
      {viewMode === 'planning' ? (
      <div className="workspace-content">
        {/* Panneau vue journée */}
        <aside className="day-overview-panel">
          {/* Barre CA compacte */}
          <div className="ca-bar">
            <div className="ca-info">
              <Banknote size={16} />
              <span className="ca-amount">{dayStats.caJour} CHF</span>
              <span className="ca-potential">/ {dayStats.caPotentiel}</span>
            </div>
            <div className="ca-progress">
              <div 
                className="ca-progress-fill" 
                style={{ width: `${dayStats.caPotentiel > 0 ? (dayStats.caJour / dayStats.caPotentiel) * 100 : 0}%` }}
              />
            </div>
          </div>
          
          {/* Liste continue scrollable */}
          <div className="day-timeline">
            {/* Section EN ATTENTE - toujours visible en premier si patients */}
            {(dayStats.waiting.length > 0 || dayStats.inProgress.length > 0) && (
              <div className="timeline-section waiting-section">
                <div className="section-header alert">
                  <BellRing size={14} className={dayStats.waiting.length > 0 ? 'bell-ringing' : ''} />
                  <span>En attente</span>
                  <span className="section-count">{dayStats.waiting.length + dayStats.inProgress.length}</span>
                </div>
                
                {dayStats.waiting.map(slot => (
                    <div 
                      key={slot.appointmentId}
                      className="timeline-patient waiting"
                      onClick={() => openPatientCard(slot)}
                    >
                      <div className="tp-time">{slot.startTime}</div>
                      <div className="tp-avatar pulse-avatar">{slot.customerInitials}</div>
                      <div className="tp-name">{slot.customerName}</div>
                      <button 
                        className="btn-go"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartConsultation(slot.appointmentId);
                        }}
                      >
                        <Play size={12} />
                      </button>
                    </div>
                  ))}
                
                {dayStats.inProgress.map(slot => (
                  <div 
                    key={slot.appointmentId}
                    className="timeline-patient in-progress"
                    onClick={() => openPatientCard(slot)}
                  >
                    <div className="tp-time">{slot.startTime}</div>
                    <div className="tp-avatar active">{slot.customerInitials}</div>
                    <div className="tp-name">{slot.customerName}</div>
                    <div className="tp-status">
                      <span className="dot"></span>
                    </div>
                    <button 
                      className="btn-done"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEndConsultation(slot.appointmentId);
                      }}
                    >
                      <CheckCircle size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Section À VOIR */}
            {dayStats.upcoming.length > 0 && (
              <div className="timeline-section upcoming-section">
                <div className="section-header">
                  <Hourglass size={14} />
                  <span>À voir</span>
                  <span className="section-count">{dayStats.upcoming.length}</span>
                </div>
                
                {dayStats.upcoming.map(slot => (
                  <div 
                    key={slot.appointmentId}
                    className="timeline-patient upcoming"
                    onClick={() => openPatientCard(slot)}
                  >
                    <div className="tp-time">{slot.startTime}</div>
                    <div className="tp-avatar">{slot.customerInitials}</div>
                    <div className="tp-name">{slot.customerName}</div>
                    <div className="tp-duration">{slot.duration}'</div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Section TERMINÉS */}
            {dayStats.completed.length > 0 && (
              <div className="timeline-section completed-section">
                <div className="section-header success">
                  <UserCheck size={14} />
                  <span>Vus</span>
                  <span className="section-count">{dayStats.completed.length}</span>
                </div>
                
                {dayStats.completed.map(slot => (
                  <div 
                    key={slot.appointmentId}
                    className="timeline-patient completed"
                    onClick={() => openPatientCard(slot)}
                  >
                    <div className="tp-time">{slot.startTime}</div>
                    <div className="tp-avatar done"><CheckCircle size={14} /></div>
                    <div className="tp-name">{slot.customerName}</div>
                    <div className="tp-price">{PRIX_CONSULTATION} CHF</div>
                  </div>
                ))}
              </div>
            )}
            
            {/* État vide */}
            {schedule.length === 0 && !isLoading && (
              <div className="empty-state">
                <Calendar size={32} />
                <p>Aucun rendez-vous aujourd'hui</p>
              </div>
            )}
          </div>
        </aside>
        
        {/* Planning du jour */}
        <main className="schedule-panel">
          <div className="panel-header">
            <h2><Calendar size={20} /> Planning du jour</h2>
            <span className="appointments-count">{schedule.length} rendez-vous</span>
          </div>
          
          {isLoading ? (
            <div className="loading-state">
              <RefreshCw size={32} className="spin" />
              <p>Chargement du planning...</p>
            </div>
          ) : schedule.length === 0 ? (
            <div className="empty-state">
              <Calendar size={48} />
              <p>Aucun rendez-vous aujourd'hui</p>
            </div>
          ) : (
            <div className="schedule-timeline">
              {/* Ligne du temps actuel */}
              <div 
                className="current-time-line" 
                style={{ 
                  top: `${((currentHour - 7) * 60 + currentMinute) * 1.5}px` 
                }}
              >
                <span className="current-time-label">
                  {now.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              {/* Slots de RDV */}
              {schedule.map(slot => (
                <div 
                  key={slot.appointmentId}
                  className={`schedule-slot ${getStatusColor(slot.status)} ${activeConsultation === slot.appointmentId ? 'active' : ''}`}
                  onClick={() => openPatientCard(slot)}
                >
                  <div className="slot-time">
                    <span className="start-time">{slot.startTime}</span>
                    <span className="duration">{slot.duration} min</span>
                  </div>
                  
                  <div className="slot-content">
                    <div className="slot-avatar">
                      {slot.customerInitials}
                    </div>
                    <div className="slot-info">
                      <div className="slot-name">{slot.customerName}</div>
                      <div className="slot-status">
                        {slot.hasArrived && <span className="arrived-badge">✓ Arrivé</span>}
                        {getStatusLabel(slot.status)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="slot-actions">
                    {slot.status === 'waiting' && (
                      <button 
                        className="btn-action start"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartConsultation(slot.appointmentId);
                        }}
                      >
                        <Play size={16} />
                      </button>
                    )}
                    {slot.status === 'in_progress' && (
                      <button 
                        className="btn-action end"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEndConsultation(slot.appointmentId);
                        }}
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                    <button 
                      className="btn-action view"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPatientCard(slot);
                      }}
                    >
                      <User size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      ) : (
        /* Vue Plan du Cabinet */
        <div className="workspace-content" style={{ padding: '20px', background: '#f1f5f9' }}>
          <CabinetFloorPlan
            appointments={allAppointments}
            patientLocations={patientLocations}
            onPatientMove={handlePatientMove}
            canConfigure={user.isSuperAdmin}
          />
        </div>
      )}
      
      {/* Modal fiche patient */}
      {selectedPatient && (
        <div className="patient-modal-overlay" onClick={() => setSelectedPatient(null)}>
          <div className="patient-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Fiche patient</h3>
              <button className="btn-close" onClick={() => setSelectedPatient(null)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="patient-header">
                <div className="patient-avatar large">
                  {selectedPatient.appointment.customerInitials}
                </div>
                <div className="patient-details">
                  <h4>{selectedPatient.appointment.customerName}</h4>
                  {selectedPatient.customer && (
                    <>
                      {selectedPatient.customer.birthdate && (
                        <p className="patient-birth">
                          Né(e) le {new Date(selectedPatient.customer.birthdate).toLocaleDateString('fr-CH')}
                          {' '}({(() => {
                            const birth = new Date(selectedPatient.customer.birthdate!);
                            const today = new Date();
                            let age = today.getFullYear() - birth.getFullYear();
                            const m = today.getMonth() - birth.getMonth();
                            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                            return age;
                          })()} ans)
                        </p>
                      )}
                      {selectedPatient.customer.phone && (
                        <p className="patient-phone">📞 {selectedPatient.customer.phone}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {(selectedPatient.customer?.notes || selectedPatient.appointment.customerNotes) && (
                <div className="patient-notes">
                  <h5>Antécédents / Notes</h5>
                  <p>{selectedPatient.customer?.notes || selectedPatient.appointment.customerNotes}</p>
                </div>
              )}
              
              <div className="patient-appointment">
                <h5>Rendez-vous du jour</h5>
                <p>
                  <Clock size={14} /> {selectedPatient.appointment.startTime} - {selectedPatient.appointment.endTime}
                  ({selectedPatient.appointment.duration} min)
                </p>
                <p className={`status ${getStatusColor(selectedPatient.appointment.status)}`}>
                  {getStatusLabel(selectedPatient.appointment.status)}
                </p>
              </div>
            </div>
            
            <div className="modal-footer">
              {selectedPatient.appointment.status === 'waiting' && (
                <button 
                  className="btn-primary"
                  onClick={() => {
                    handleStartConsultation(selectedPatient.appointment.appointmentId);
                    setSelectedPatient(null);
                    // Naviguer vers la consultation
                    navigate(`/pro/consultation/${selectedPatient.appointment.appointmentId}`);
                  }}
                >
                  <Play size={16} /> Démarrer la consultation
                </button>
              )}
              {selectedPatient.appointment.status === 'in_progress' && (
                <button 
                  className="btn-primary"
                  onClick={() => {
                    setSelectedPatient(null);
                    navigate(`/pro/consultation/${selectedPatient.appointment.appointmentId}`);
                  }}
                >
                  <FileText size={16} /> Continuer la consultation
                </button>
              )}
              <button 
                className="btn-secondary"
                onClick={() => setSelectedPatient(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

