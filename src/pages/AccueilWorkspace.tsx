/**
 * Espace de travail Accueil - Synapse.poge
 * 
 * Interface pour le personnel d'accueil :
 * - Liste des RDV du jour (tous les praticiens)
 * - Marquer les patients comme arrivés
 * - Visualiser la salle d'attente
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  UserCheck,
  Users,
  CheckCircle,
  XCircle,
  CalendarDays,
  Bell,
  Coffee
} from 'lucide-react';
import { getAppointmentsByDate, type DayAppointment } from '../services/workspaceAgendaService';
import { 
  getStatusesByDate, 
  markPatientArrived, 
  cancelArrival,
  markNoShow,
  updatePatientZone,
  getPatientZones,
  type AppointmentStatusRecord,
  type AppointmentStatus,
  type PatientZone
} from '../services/appointmentStatusService';
import type { TeamMember } from '../types';
import { CabinetFloorPlan, type ZoneType, type PatientLocation } from '../components/CabinetFloorPlan';
import './AccueilWorkspace.css';

interface AccueilWorkspaceProps {
  user: TeamMember;
}

interface EnrichedAppointment extends DayAppointment {
  dbStatus: AppointmentStatus;
  arrivedAt: string | null;
}

// Mapping agenda_id -> nom du praticien (à terme, charger depuis la DB)
const PRATICIENS: Record<number, string> = {
  1525: 'Grégory',
  1526: 'Nicolas',
  1527: 'Pauline',
  1528: 'Amélie',
  1529: 'Sarah',
  // Ajouter les autres praticiens
};

export function AccueilWorkspace({ user }: AccueilWorkspaceProps) {
  const navigate = useNavigate();
  const employeeId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  
  // État
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([]);
  const [statuses, setStatuses] = useState<AppointmentStatusRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'waiting' | 'pending'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'plan'>('plan');
  const [patientLocations, setPatientLocations] = useState<PatientLocation[]>([]);
  
  
  // Formater la date pour la DB
  const formatDateForDB = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Charger les RDV et les zones depuis la DB
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateStr = formatDateForDB(selectedDate);
      
      // Charger les RDV
      const allAppointments = await getAppointmentsByDate(selectedDate);
      
      // Charger les statuts et zones depuis la DB
      const dbStatuses = await getStatusesByDate(dateStr);
      const dbZones = await getPatientZones(dateStr);
      
      // Enrichir avec les statuts DB
      const enriched: EnrichedAppointment[] = allAppointments.map(apt => {
        const dbStatus = dbStatuses.find(s => s.appointment_id === apt.appointmentId);
        return {
          ...apt,
          dbStatus: dbStatus?.status || 'scheduled' as const,
          arrivedAt: dbStatus?.arrived_at || null
        };
      });
      
      // Appliquer les zones depuis la DB
      const locations: PatientLocation[] = dbZones.map(z => ({
        odId: z.appointmentId,
        zone: z.zone as ZoneType
      }));
      
      setAppointments(enriched);
      setPatientLocations(locations);
      console.log('[AccueilWorkspace] Zones chargées:', locations.length);
    } catch (error) {
      console.error('[AccueilWorkspace] Erreur:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);
  
  // Formater la date pour comparaison stable
  const selectedDateStr = formatDateForDB(selectedDate);
  
  // Charger au démarrage et quand la date change
  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStr]);
  
  // Rafraîchissement automatique toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStr]);
  
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
    if (isToday) return "Aujourd'hui";
    return selectedDate.toLocaleDateString('fr-CH', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };
  
  // Marquer un patient comme arrivé
  const handleMarkArrived = async (apt: EnrichedAppointment, agendaId: number) => {
    const dateStr = formatDateForDB(selectedDate);
    const success = await markPatientArrived(apt.appointmentId, dateStr, agendaId, employeeId);
    if (success) {
      loadData(); // Rafraîchir
    }
  };
  
  // Annuler l'arrivée
  const handleCancelArrival = async (apt: EnrichedAppointment) => {
    const dateStr = formatDateForDB(selectedDate);
    const success = await cancelArrival(apt.appointmentId, dateStr);
    if (success) {
      loadData();
    }
  };
  
  // Marquer absent
  const handleMarkNoShow = async (apt: EnrichedAppointment, agendaId: number) => {
    const dateStr = formatDateForDB(selectedDate);
    const success = await markNoShow(apt.appointmentId, dateStr, agendaId, employeeId);
    if (success) {
      loadData();
    }
  };
  
  // Grouper par praticien
  const appointmentsByPraticien = useMemo(() => {
    const grouped: Record<number, EnrichedAppointment[]> = {};
    
    for (const apt of appointments) {
      const agendaId = apt.agendaId || 0;
      
      if (!grouped[agendaId]) {
        grouped[agendaId] = [];
      }
      grouped[agendaId].push(apt);
    }
    
    return grouped;
  }, [appointments]);
  
  // Filtrer les RDV
  const filteredAppointments = useMemo(() => {
    switch (filter) {
      case 'waiting':
        return appointments.filter(a => a.dbStatus === 'arrived');
      case 'pending':
        return appointments.filter(a => a.dbStatus === 'scheduled');
      default:
        return appointments;
    }
  }, [appointments, filter]);
  
  // Stats
  const stats = useMemo(() => {
    const total = appointments.length;
    const arrived = appointments.filter(a => a.dbStatus === 'arrived').length;
    const inProgress = appointments.filter(a => a.dbStatus === 'in_progress').length;
    const completed = appointments.filter(a => a.dbStatus === 'completed').length;
    const pending = appointments.filter(a => a.dbStatus === 'scheduled').length;
    
    return { total, arrived, inProgress, completed, pending };
  }, [appointments]);
  
  // Obtenir l'agenda_id d'un appointment
  const getAgendaId = (apt: EnrichedAppointment): number => {
    return apt.agendaId || 0;
  };
  
  // Gérer le déplacement d'un patient sur le plan
  const handlePatientMove = useCallback(async (
    appointmentId: number, 
    fromZone: ZoneType, 
    toZone: ZoneType,
    seatNumber?: number
  ) => {
    console.log(`[Accueil] Patient ${appointmentId} : ${fromZone} → ${toZone}${seatNumber ? ` (place ${seatNumber})` : ''}`);
    
    // Mettre à jour l'état local immédiatement
    setPatientLocations(prev => {
      const existing = prev.find(l => l.odId === appointmentId);
      if (existing) {
        return prev.map(l => 
          l.odId === appointmentId 
            ? { ...l, zone: toZone, seatNumber } 
            : l
        );
      } else {
        return [...prev, { odId: appointmentId, zone: toZone, seatNumber }];
      }
    });
    
    // Trouver le RDV pour avoir l'agenda_id
    const apt = appointments.find(a => a.appointmentId === appointmentId);
    if (!apt) return;
    
    const dateStr = formatDateForDB(selectedDate);
    
    // Sauvegarder la zone dans la DB (ceci met aussi à jour le statut automatiquement)
    await updatePatientZone(appointmentId, dateStr, apt.agendaId, toZone as PatientZone, employeeId);
    console.log(`[Accueil] Zone sauvegardée en DB: ${toZone}`);
    
  }, [appointments, selectedDate, employeeId]);

  return (
    <div className="accueil-workspace">
      {/* Header */}
      <header className="accueil-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ChevronLeft size={20} />
          </button>
          <div className="header-title">
            <h1>Accueil</h1>
            <p>Gestion des arrivées patients</p>
          </div>
        </div>
        
        {/* Navigation de date */}
        <div className="date-navigator">
          <button className="btn-nav" onClick={goToPreviousDay}>
            <ChevronLeft size={20} />
          </button>
          <div className="date-display" onClick={goToToday}>
            <CalendarDays size={18} />
            <span className={`date-text ${isToday ? 'today' : ''}`}>
              {formatSelectedDate()}
            </span>
          </div>
          <button className="btn-nav" onClick={goToNextDay}>
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="header-right">
          <button 
            className="btn-refresh"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw size={20} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </header>
      
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <Calendar size={16} />
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">RDV</span>
        </div>
        <div className="stat-item pending">
          <Clock size={16} />
          <span className="stat-value">{stats.pending}</span>
          <span className="stat-label">En attente</span>
        </div>
        <div className="stat-item arrived">
          <Coffee size={16} />
          <span className="stat-value">{stats.arrived}</span>
          <span className="stat-label">Salle d'attente</span>
        </div>
        <div className="stat-item in-progress">
          <User size={16} />
          <span className="stat-value">{stats.inProgress}</span>
          <span className="stat-label">En consultation</span>
        </div>
        <div className="stat-item completed">
          <CheckCircle size={16} />
          <span className="stat-value">{stats.completed}</span>
          <span className="stat-label">Terminés</span>
        </div>
      </div>
      
      {/* Toggle Vue */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        padding: '12px 24px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setViewMode('plan')}
            style={{
              padding: '8px 16px',
              background: viewMode === 'plan' ? '#3b82f6' : '#f1f5f9',
              color: viewMode === 'plan' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🗺️ Plan du cabinet
          </button>
          <button 
            onClick={() => setViewMode('list')}
            style={{
              padding: '8px 16px',
              background: viewMode === 'list' ? '#3b82f6' : '#f1f5f9',
              color: viewMode === 'list' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📋 Liste
          </button>
        </div>
        
        {viewMode === 'list' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              style={{
                padding: '8px 16px',
                background: filter === 'all' ? '#3b82f6' : '#f8fafc',
                color: filter === 'all' ? 'white' : '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Tous ({stats.total})
            </button>
            <button 
              onClick={() => setFilter('pending')}
              style={{
                padding: '8px 16px',
                background: filter === 'pending' ? '#3b82f6' : '#f8fafc',
                color: filter === 'pending' ? 'white' : '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              À venir ({stats.pending})
            </button>
            <button 
              onClick={() => setFilter('waiting')}
              style={{
                padding: '8px 16px',
                background: filter === 'waiting' ? '#3b82f6' : '#f8fafc',
                color: filter === 'waiting' ? 'white' : '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Bell size={14} /> Salle d'attente ({stats.arrived})
            </button>
          </div>
        )}
      </div>
      
      {/* Vue Plan */}
      {viewMode === 'plan' && (
        <div style={{ padding: '16px' }}>
          <CabinetFloorPlan
            appointments={appointments}
            patientLocations={patientLocations}
            onPatientMove={handlePatientMove}
            canConfigure={user.isSuperAdmin}
          />
        </div>
      )}
      
      {/* Vue Liste */}
      {viewMode === 'list' && (
      <div style={{ padding: '16px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <RefreshCw size={32} className="spin" />
            <p>Chargement...</p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <Users size={48} />
            <p>Aucun rendez-vous</p>
          </div>
        ) : (
          filteredAppointments.map((apt) => {
            const praticienName = PRATICIENS[apt.agendaId] || `Praticien ${apt.agendaId}`;
            const isArrived = apt.dbStatus === 'arrived';
            const isCompleted = apt.dbStatus === 'completed';
            const isNoShow = apt.dbStatus === 'no_show';
            
            return (
              <div key={apt.appointmentId} style={{ 
                padding: '16px 20px', 
                marginBottom: '8px', 
                background: isArrived ? '#eff6ff' : isCompleted ? '#f0fdf4' : isNoShow ? '#fef2f2' : 'white', 
                borderRadius: '12px',
                border: `1px solid ${isArrived ? '#93c5fd' : isCompleted ? '#86efac' : isNoShow ? '#fca5a5' : '#e2e8f0'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                opacity: isCompleted || isNoShow ? 0.7 : 1
              }}>
                {/* Heure */}
                <div style={{ minWidth: '60px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>{apt.startTime}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{apt.duration}'</div>
                </div>
                
                {/* Avatar */}
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', 
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600,
                  flexShrink: 0
                }}>{apt.customerInitials}</div>
                
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>{apt.customerName}</div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={12} /> {praticienName}
                  </div>
                </div>
                
                {/* Status */}
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: 600,
                  background: isArrived ? '#dbeafe' : isCompleted ? '#d1fae5' : isNoShow ? '#fee2e2' : '#f1f5f9',
                  color: isArrived ? '#2563eb' : isCompleted ? '#059669' : isNoShow ? '#dc2626' : '#64748b'
                }}>
                  {isArrived ? '☕ En attente' : isCompleted ? '✓ Terminé' : isNoShow ? 'Absent' : 'Prévu'}
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {apt.dbStatus === 'scheduled' && (
                    <>
                      <button 
                        onClick={() => handleMarkArrived(apt, apt.agendaId)}
                        style={{ 
                          width: '40px', height: '40px', 
                          background: '#dbeafe', color: '#2563eb', 
                          border: 'none', borderRadius: '10px', 
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        title="Marquer comme arrivé"
                      >
                        <UserCheck size={18} />
                      </button>
                      <button 
                        onClick={() => handleMarkNoShow(apt, apt.agendaId)}
                        style={{ 
                          width: '40px', height: '40px', 
                          background: '#fee2e2', color: '#dc2626', 
                          border: 'none', borderRadius: '10px', 
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        title="Marquer absent"
                      >
                        <XCircle size={18} />
                      </button>
                    </>
                  )}
                  {apt.dbStatus === 'arrived' && (
                    <button 
                      onClick={() => handleCancelArrival(apt)}
                      style={{ 
                        width: '40px', height: '40px', 
                        background: '#f1f5f9', color: '#64748b', 
                        border: 'none', borderRadius: '10px', 
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      title="Annuler l'arrivée"
                    >
                      <XCircle size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}
