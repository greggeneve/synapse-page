/**
 * Espace de travail Ostéopathe - Synapse.poge
 * 
 * - Planning du jour avec statuts patients
 * - Salle d'attente avec notifications sonores
 * - Accès rapide aux fiches patients
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Users, 
  Clock, 
  Bell,
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
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useWebSocket } from '../services/websocketService';
import { 
  getTodayAppointments, 
  getCustomerById,
  formatPatientForDisplay,
  formatAppointmentTime,
  isAgendaConfigured,
  clearCache,
  type AgendaAppointment,
  type AgendaCustomer
} from '../services/agendaService';
import type { TeamMember } from '../types';
import type { WaitingPatient, PatientStatus, ScheduleSlot } from '../types/synapse';
import { playNotificationSound, initAudioContext } from '../utils/sounds';
import './WorkspaceOsteo.css';

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
    customer: AgendaCustomer | null;
  } | null>(null);
  const [activeConsultation, setActiveConsultation] = useState<number | null>(null);
  
  // Charger le planning du jour
  const loadSchedule = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Mapper l'ID agenda.ch de l'employé
      const appointments = await getTodayAppointments();
      
      // Convertir en ScheduleSlot
      const slots: ScheduleSlot[] = await Promise.all(
        appointments.map(async (apt) => {
          const customer = await getCustomerById(apt.customer_id);
          const { displayName, initials } = customer 
            ? formatPatientForDisplay(customer)
            : { displayName: 'Patient inconnu', initials: '??' };
          
          // Vérifier si le patient est en salle d'attente
          const waitingPatient = waitingRoom.find(w => w.appointmentId === apt.id);
          
          return {
            appointmentId: apt.id,
            customerId: apt.customer_id,
            customerName: displayName,
            customerInitials: initials,
            startTime: formatAppointmentTime(apt),
            endTime: new Date(apt.end_at).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }),
            duration: apt.duration,
            status: waitingPatient?.status || (apt.status === 'completed' ? 'completed' : 'scheduled'),
            hasArrived: !!waitingPatient,
            notes: apt.notes
          };
        })
      );
      
      setSchedule(slots);
    } catch (error) {
      console.error('Erreur chargement planning:', error);
    } finally {
      setIsLoading(false);
    }
  }, [waitingRoom]);
  
  // Charger au démarrage
  useEffect(() => {
    if (isAgendaConfigured()) {
      loadSchedule();
    } else {
      setIsLoading(false);
    }
  }, []);
  
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
    setSelectedPatient({ appointment: slot, customer });
  };
  
  // Démarrer une consultation
  const handleStartConsultation = (appointmentId: number) => {
    startConsultation(appointmentId);
    setActiveConsultation(appointmentId);
    
    // Mettre à jour le statut local
    setSchedule(prev => prev.map(slot => 
      slot.appointmentId === appointmentId 
        ? { ...slot, status: 'in_progress' as PatientStatus }
        : slot
    ));
  };
  
  // Terminer une consultation
  const handleEndConsultation = (appointmentId: number) => {
    endConsultation(appointmentId);
    setActiveConsultation(null);
    
    // Mettre à jour le statut local
    setSchedule(prev => prev.map(slot => 
      slot.appointmentId === appointmentId 
        ? { ...slot, status: 'completed' as PatientStatus }
        : slot
    ));
  };
  
  // Patients en attente pour cet ostéo
  const myWaitingPatients = waitingRoom.filter(p => p.assignedTo === employeeId);
  
  // Heure actuelle pour le timeline
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
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
            <p>{new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
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
            onClick={() => { clearCache(); loadSchedule(); }}
            disabled={isLoading}
            title="Rafraîchir le planning"
          >
            <RefreshCw size={20} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </header>
      
      {/* Contenu principal */}
      <div className="workspace-content">
        {/* Panneau salle d'attente */}
        <aside className="waiting-room-panel">
          <div className="panel-header">
            <h2>
              {myWaitingPatients.some(p => p.status === 'waiting') ? (
                <BellRing size={20} className="bell-ringing" />
              ) : (
                <Bell size={20} />
              )}
              Salle d'attente
            </h2>
            <span className="badge">{myWaitingPatients.length}</span>
          </div>
          
          <div className="waiting-list">
            {myWaitingPatients.length === 0 ? (
              <div className="empty-state">
                <Users size={32} />
                <p>Aucun patient en attente</p>
              </div>
            ) : (
              myWaitingPatients.map(patient => (
                <div 
                  key={patient.appointmentId}
                  className={`waiting-patient ${patient.status === 'waiting' ? 'pulse' : ''}`}
                  onClick={() => {
                    const slot = schedule.find(s => s.appointmentId === patient.appointmentId);
                    if (slot) openPatientCard(slot);
                  }}
                >
                  <div className="patient-avatar">
                    {patient.customerInitials}
                  </div>
                  <div className="patient-info">
                    <div className="patient-name">{patient.customerName}</div>
                    <div className="patient-time">
                      <Clock size={12} />
                      RDV {patient.scheduledTime} • Arrivé {new Date(patient.arrivedAt).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className={`patient-status ${getStatusColor(patient.status)}`}>
                    {patient.status === 'waiting' && (
                      <button 
                        className="btn-start"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartConsultation(patient.appointmentId);
                        }}
                      >
                        <Play size={14} /> Démarrer
                      </button>
                    )}
                    {patient.status === 'in_progress' && (
                      <span className="in-progress-badge">
                        <span className="dot"></span> En cours
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
        
        {/* Planning du jour */}
        <main className="schedule-panel">
          <div className="panel-header">
            <h2><Calendar size={20} /> Planning du jour</h2>
            <span className="appointments-count">{schedule.length} rendez-vous</span>
          </div>
          
          {!isAgendaConfigured() ? (
            <div className="config-warning">
              <AlertCircle size={24} />
              <p>API agenda.ch non configurée</p>
              <small>Ajoutez VITE_AGENDA_API_TOKEN dans .env.local</small>
            </div>
          ) : isLoading ? (
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
                          {' '}({formatPatientForDisplay(selectedPatient.customer).age} ans)
                        </p>
                      )}
                      {selectedPatient.customer.phone && (
                        <p className="patient-phone">📞 {selectedPatient.customer.phone}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {selectedPatient.customer?.notes && (
                <div className="patient-notes">
                  <h5>Antécédents / Notes</h5>
                  <p>{selectedPatient.customer.notes}</p>
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

