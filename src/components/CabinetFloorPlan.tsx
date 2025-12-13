/**
 * CabinetFloorPlan - Plan interactif du cabinet avec drag & drop
 * Utilise les images 3D du cabinet comme arrière-plan
 * Charge les zones depuis la configuration en DB
 */

import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { DayAppointment } from '../services/workspaceAgendaService';
import { getAllFloorConfigs } from '../services/floorPlanConfigService';
import type { ZoneConfig } from '../services/floorPlanConfigService';
import { getAllPractitioners } from '../services/practitionerService';
import type { Practitioner } from '../services/practitionerService';
import { getAllOsteoLocations, type OsteoLocation } from '../services/osteoLocationService';
import { Settings } from 'lucide-react';

// Types
export type ZoneType = 
  | 'outside' 
  | 'waiting-room-inf' | 'waiting-room-sup'
  | 'room-101' | 'room-102' | 'room-103' | 'room-104' | 'room-105' | 'room-106'
  | 'room-121' | 'room-122' | 'room-123' | 'room-124'
  | 'reception';

export type PatientLocation = {
  odId: number;
  zone: ZoneType;
  seatNumber?: number;
};

interface PatientPastille {
  appointment: DayAppointment;
  location: PatientLocation;
}

interface CabinetFloorPlanProps {
  appointments: DayAppointment[];
  patientLocations: PatientLocation[];
  onPatientMove: (appointmentId: number, fromZone: ZoneType, toZone: ZoneType, seatNumber?: number) => void;
  canConfigure?: boolean; // Si true, affiche le lien vers la config
}

// Couleurs par défaut pour les praticiens non trouvés
const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ec4899', 
  '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
];

// Zones par défaut (fallback si pas de config en DB)
const DEFAULT_ZONES_RDC_INF: ZoneConfig[] = [
  { id: 'room-105', label: '105', top: 2, left: 17, width: 23, height: 22, color: '#3b82f6' },
  { id: 'room-104', label: '104', top: 2, left: 41, width: 36, height: 22, color: '#10b981' },
  { id: 'waiting-room-inf', label: 'Attente', top: 25, left: 17, width: 23, height: 27, color: '#f59e0b' },
  { id: 'room-103', label: '103', top: 25, left: 41, width: 36, height: 27, color: '#8b5cf6' },
  { id: 'room-102', label: '102', top: 53, left: 41, width: 36, height: 20, color: '#ec4899' },
  { id: 'reception', label: 'Accueil', top: 53, left: 17, width: 23, height: 20, color: '#14b8a6' },
  { id: 'room-106', label: '106', top: 75, left: 30, width: 18, height: 22, color: '#f97316' },
  { id: 'room-101', label: '101', top: 75, left: 49, width: 20, height: 22, color: '#ef4444' },
];

const DEFAULT_ZONES_RDC_SUP: ZoneConfig[] = [
  { id: 'waiting-room-sup', label: 'Attente', top: 55, left: 35, width: 35, height: 35, color: '#f59e0b' },
  { id: 'room-121', label: '121', top: 8, left: 5, width: 22, height: 42, color: '#3b82f6' },
  { id: 'room-122', label: '122', top: 8, left: 29, width: 22, height: 42, color: '#10b981' },
  { id: 'room-123', label: '123', top: 8, left: 53, width: 22, height: 42, color: '#8b5cf6' },
  { id: 'room-124', label: '124', top: 8, left: 77, width: 18, height: 42, color: '#ec4899' },
];

// Pastille ostéo dans une salle
function OsteoPastille({ 
  practitioner,
  lastSeen 
}: { 
  practitioner: Practitioner;
  lastSeen?: string | null;
}) {
  const color = practitioner.color || '#3b82f6';
  
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
      title={`${practitioner.prenom} ${practitioner.nom}${lastSeen ? ` - vu à ${lastSeen}` : ''}`}
    >
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: color,
        border: '4px solid white',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {practitioner.photoUrl ? (
          <img 
            src={practitioner.photoUrl} 
            alt={practitioner.initials}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>
            {practitioner.initials}
          </span>
        )}
      </div>
      <span style={{
        fontSize: '12px',
        fontWeight: 700,
        color: '#374151',
        background: 'rgba(255,255,255,0.95)',
        padding: '2px 8px',
        borderRadius: '6px',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}>
        {practitioner.prenom}
      </span>
    </div>
  );
}

// Zone droppable positionnée sur le plan
function PlanZone({ 
  zone,
  patients,
  isDragging,
  practitioners,
  osteosInZone,
}: { 
  zone: ZoneConfig;
  patients: PatientPastille[];
  isDragging?: boolean;
  practitioners?: Map<number, Practitioner>;
  osteosInZone?: { practitioner: Practitioner; lastSeen?: string | null }[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        top: `${zone.top}%`,
        left: `${zone.left}%`,
        width: `${zone.width}%`,
        height: `${zone.height}%`,
        background: isOver 
          ? `${zone.color}50` 
          : isDragging 
            ? `${zone.color}35` 
            : `${zone.color}25`,
        border: isOver 
          ? `4px solid ${zone.color}` 
          : isDragging 
            ? `3px dashed ${zone.color}90`
            : `2px solid ${zone.color}60`,
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '4px',
        transition: 'all 0.2s',
        overflow: 'hidden',
        backdropFilter: isOver ? 'blur(4px)' : 'blur(3px)',
        boxShadow: isOver 
          ? `0 0 20px ${zone.color}60, inset 0 0 30px ${zone.color}30` 
          : `inset 0 0 15px ${zone.color}15`,
        transform: isOver ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Label de la zone */}
      <span style={{
        fontSize: zone.id.startsWith('room-') ? '14px' : '10px',
        fontWeight: 700,
        color: zone.color,
        background: 'rgba(255,255,255,0.95)',
        padding: '2px 8px',
        borderRadius: '6px',
        position: 'absolute',
        top: '4px',
        left: '4px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {zone.label}
      </span>
      
      {/* Pastilles ostéos dans cette salle - centrées */}
      {osteosInZone && osteosInZone.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          flex: 1,
        }}>
          {osteosInZone.map(o => (
            <OsteoPastille 
              key={o.practitioner.agendaId} 
              practitioner={o.practitioner}
              lastSeen={o.lastSeen}
            />
          ))}
        </div>
      )}
      
      {/* Pastilles patients */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '6px', 
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: '20px',
        padding: '4px',
      }}>
        {patients.map(p => (
          <PatientChip 
            key={p.appointment.appointmentId} 
            appointment={p.appointment} 
            showFullName 
            practitioner={practitioners?.get(p.appointment.agendaId)}
            currentZone={zone.id}
          />
        ))}
      </div>
    </div>
  );
}

// Pastille patient avec nom de famille et genre
function PatientChip({ 
  appointment, 
  isDragging,
  compact = false,
  showFullName = false,
  practitionerColor,
  practitioner,
  currentZone
}: { 
  appointment: DayAppointment; 
  isDragging?: boolean;
  compact?: boolean;
  showFullName?: boolean;
  practitionerColor?: string;
  practitioner?: Practitioner;
  currentZone?: string;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `patient-${appointment.appointmentId}`,
    data: { appointment }
  });
  
  // Couleur selon le genre du patient
  const getGenderColor = () => {
    if (appointment.customerSex === 'f') return '#ec4899'; // Rose pour femme
    if (appointment.customerSex === 'm') return '#3b82f6'; // Bleu pour homme
    return '#64748b'; // Gris si inconnu
  };
  
  const genderColor = getGenderColor();
  const bgColor = practitionerColor || '#64748b';
  
  // Nom à afficher
  const displayName = showFullName 
    ? `${appointment.customerFirstName || ''} ${appointment.customerLastName || ''}`.trim() || appointment.customerName
    : appointment.customerLastName || appointment.customerName.split(' ').pop();
  
  if (compact) {
    // Version compacte (cercle avec initiales) - pour mini-agendas dehors
    return (
      <div
        ref={setNodeRef}
        style={{
          background: genderColor,
          color: 'white',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          fontSize: '10px',
          fontWeight: 700,
          cursor: 'grab',
          boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
          transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          border: `2px solid ${bgColor}`,
        }}
        {...listeners}
        {...attributes}
        title={`${appointment.customerName} - ${appointment.startTime}`}
      >
        {appointment.customerInitials}
      </div>
    );
  }
  
  const osteoColor = practitioner?.color || bgColor;
  
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        background: genderColor,
        color: 'white',
        padding: '4px 10px',
        borderRadius: '16px',
        fontSize: showFullName ? '10px' : '11px',
        fontWeight: 600,
        cursor: 'grab',
        boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.8 : 1,
        transition: isDragging ? 'none' : 'box-shadow 0.2s',
        zIndex: isDragging ? 1000 : 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        border: `2px solid ${bgColor}`,
      }}
      {...listeners}
      {...attributes}
      title={`${appointment.customerName} - ${appointment.startTime} - ${practitioner ? `${practitioner.prenom} ${practitioner.nom}` : ''}`}
    >
      {/* Pastille ostéo en haut à gauche (seulement en salle d'attente) */}
      {showFullName && practitioner && currentZone?.startsWith('waiting-room') && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '-12px',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: osteoColor,
          border: '2px solid white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          zIndex: 10,
        }}>
          {practitioner.photoUrl ? (
            <img 
              src={practitioner.photoUrl} 
              alt={practitioner.initials}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>
              {practitioner.initials}
            </span>
          )}
        </div>
      )}
      
      <span style={{ 
        width: '18px', 
        height: '18px', 
        background: 'rgba(255,255,255,0.3)', 
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '9px',
        fontWeight: 700,
        flexShrink: 0
      }}>
        {appointment.customerSex === 'f' ? '♀' : appointment.customerSex === 'm' ? '♂' : '?'}
      </span>
      <span>{displayName}</span>
    </div>
  );
}

// Ligne compacte d'agenda pour un ostéo (scroll horizontal des patients)
function OsteoVerticalTimeline({ 
  agendaId, 
  patients,
  practitioner
}: { 
  agendaId: number; 
  patients: PatientPastille[];
  practitioner?: Practitioner;
}) {
  // Trier par heure (prochain patient en premier)
  const sortedPatients = [...patients].sort((a, b) => 
    a.appointment.startTime.localeCompare(b.appointment.startTime)
  );

  if (patients.length === 0) return null;
  
  const color = practitioner?.color || DEFAULT_COLORS[agendaId % DEFAULT_COLORS.length];

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 8px',
        minHeight: '48px',
      }}
    >
      {/* Photo ostéo */}
      <div style={{ flexShrink: 0 }}>
        {practitioner?.photoUrl ? (
          <img 
            src={practitioner.photoUrl}
            alt={`${practitioner.prenom} ${practitioner.nom}`}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: `2px solid ${color}`,
            }}
          />
        ) : (
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '11px',
            fontWeight: 700,
          }}>
            {practitioner?.initials || '??'}
          </div>
        )}
      </div>
      
      {/* Scroll horizontal des patients */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '6px',
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBottom: '2px',
      }}>
        {sortedPatients.map((p) => (
          <div 
            key={p.appointment.appointmentId}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1px',
              flexShrink: 0,
            }}
          >
            <span style={{ 
              fontSize: '9px', 
              color: '#64748b',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}>
              {p.appointment.startTime}
            </span>
            <PatientChip appointment={p.appointment} practitionerColor={color} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

// Zone extérieure avec les mini-agendas par ostéo (colonne droite)
function OutsideZone({ 
  patientsByOsteo,
  practitioners,
  isDragging
}: { 
  patientsByOsteo: Record<number, PatientPastille[]>;
  practitioners: Map<number, Practitioner>;
  isDragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'outside' });
  const hasPatients = Object.keys(patientsByOsteo).length > 0;
  
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver 
          ? 'linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)' 
          : isDragging 
            ? 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)'
            : 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        padding: '12px',
        borderLeft: '2px solid #e2e8f0',
        transition: 'all 0.3s',
        width: '320px',
        flexShrink: 0,
        boxShadow: isOver ? 'inset 0 0 20px rgba(34, 197, 94, 0.2)' : 'none',
        overflowY: 'auto',
        maxHeight: '100%',
      }}
    >
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        gap: '4px',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <span style={{ fontSize: '20px' }}>🚪</span>
        <span style={{ 
          fontSize: '12px', 
          fontWeight: 700, 
          color: '#374151',
          textAlign: 'center',
        }}>
          EXTÉRIEUR
        </span>
        <span style={{ 
          fontSize: '10px', 
          color: '#64748b',
          fontWeight: 500,
          textAlign: 'center',
        }}>
          Patients à venir
        </span>
      </div>
      
      {hasPatients ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(patientsByOsteo)
            .sort(([, a], [, b]) => {
              const nextA = [...a].sort((x, y) => x.appointment.startTime.localeCompare(y.appointment.startTime))[0];
              const nextB = [...b].sort((x, y) => x.appointment.startTime.localeCompare(y.appointment.startTime))[0];
              return nextA?.appointment.startTime.localeCompare(nextB?.appointment.startTime || '') || 0;
            })
            .map(([agendaId, pts]) => (
              <OsteoVerticalTimeline 
                key={agendaId} 
                agendaId={parseInt(agendaId)} 
                patients={pts}
                practitioner={practitioners.get(parseInt(agendaId))}
              />
            ))
          }
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          color: '#059669',
          fontSize: '12px',
          fontWeight: 500,
          padding: '20px 0',
        }}>
          ✨ Tous arrivés !
        </div>
      )}
    </div>
  );
}

// Composant principal
export function CabinetFloorPlan({ 
  appointments, 
  patientLocations, 
  onPatientMove,
  canConfigure = false
}: CabinetFloorPlanProps) {
  const [activeDragData, setActiveDragData] = useState<DayAppointment | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<'rdc-inf' | 'rdc-sup'>('rdc-inf');
  const [zonesInf, setZonesInf] = useState<ZoneConfig[]>(DEFAULT_ZONES_RDC_INF);
  const [zonesSup, setZonesSup] = useState<ZoneConfig[]>(DEFAULT_ZONES_RDC_SUP);
  const [practitioners, setPractitioners] = useState<Map<number, Practitioner>>(new Map());
  const [osteoLocations, setOsteoLocations] = useState<OsteoLocation[]>([]);
  
  // Charger les zones et praticiens depuis la DB
  useEffect(() => {
    const loadData = async () => {
      try {
        // Charger les zones
        const configs = await getAllFloorConfigs();
        if (configs['rdc-inf']?.length > 0) {
          setZonesInf(configs['rdc-inf']);
        }
        if (configs['rdc-sup']?.length > 0) {
          setZonesSup(configs['rdc-sup']);
        }
        
        // Charger les praticiens
        const allPractitioners = await getAllPractitioners();
        const practMap = new Map<number, Practitioner>();
        allPractitioners.forEach(p => practMap.set(p.agendaId, p));
        setPractitioners(practMap);
        console.log('[CabinetFloorPlan] Praticiens chargés:', allPractitioners.length);
        
        // Charger les positions des ostéos
        const locations = await getAllOsteoLocations();
        setOsteoLocations(locations);
        console.log('[CabinetFloorPlan] Positions ostéos chargées:', locations.length, locations);
      } catch (error) {
        console.log('[CabinetFloorPlan] Erreur chargement:', error);
      }
    };
    loadData();
    
    // Rafraîchir les positions toutes les 30 secondes
    const interval = setInterval(async () => {
      try {
        const locations = await getAllOsteoLocations();
        setOsteoLocations(locations);
      } catch (error) {
        console.log('[CabinetFloorPlan] Erreur refresh positions:', error);
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  
  // Combiner appointments avec leurs locations
  const patients: PatientPastille[] = appointments.map(apt => {
    const location = patientLocations.find(l => l.odId === apt.appointmentId) || {
      odId: apt.appointmentId,
      zone: 'outside' as ZoneType
    };
    return { appointment: apt, location };
  });

  const getPatientsByZone = (zone: ZoneType | string) => 
    patients.filter(p => p.location.zone === zone);
  
  // Obtenir les ostéos par zone (basé sur leur localisation IP)
  // Filtre les ostéos non vus depuis plus de 3 minutes
  const getOsteosByZone = (zoneId: string) => {
    const now = new Date();
    const timeoutMinutes = 3;
    
    return osteoLocations
      .filter(loc => {
        if (loc.currentRoomId !== zoneId) return false;
        
        // Vérifier si l'ostéo a été vu récemment
        if (loc.lastSeenAt) {
          const lastSeen = new Date(loc.lastSeenAt);
          const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
          return diffMinutes <= timeoutMinutes;
        }
        return false;
      })
      .map(loc => {
        const practitioner = practitioners.get(loc.agendaId);
        return practitioner ? { 
          practitioner, 
          lastSeen: loc.lastSeenAt 
        } : null;
      })
      .filter((o): o is { practitioner: Practitioner; lastSeen: string | null } => o !== null);
  };
    
  // Patients "dehors" groupés par ostéo
  const outsidePatients = getPatientsByZone('outside');
  const patientsByOsteo = outsidePatients.reduce((acc, p) => {
    const agendaId = p.appointment.agendaId;
    if (!acc[agendaId]) acc[agendaId] = [];
    acc[agendaId].push(p);
    return acc;
  }, {} as Record<number, PatientPastille[]>);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragData(event.active.data.current?.appointment);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.data.current?.appointment) {
      const appointment = active.data.current.appointment as DayAppointment;
      const fromLocation = patientLocations.find(l => l.odId === appointment.appointmentId);
      const toZone = over.id as ZoneType;
      
      if (fromLocation?.zone !== toZone) {
        onPatientMove(appointment.appointmentId, fromLocation?.zone || 'outside', toZone);
      }
    }
    
    setActiveDragData(null);
  };

  // Stats
  const waitingInfCount = getPatientsByZone('waiting-room-inf').length;
  const waitingSupCount = getPatientsByZone('waiting-room-sup').length;
  const receptionCount = getPatientsByZone('reception').length;

  const zones = selectedFloor === 'rdc-inf' ? zonesInf : zonesSup;
  const planImage = selectedFloor === 'rdc-inf' ? '/plan-rdc-inf.png' : '/plan-rdc-sup.png';

  return (
    <DndContext 
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Section Plan */}
        <div>
          {/* Sélecteur d'étage */}
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            marginBottom: '12px',
          }}>
            <button
              onClick={() => setSelectedFloor('rdc-inf')}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: selectedFloor === 'rdc-inf' ? '#3b82f6' : 'white',
                color: selectedFloor === 'rdc-inf' ? 'white' : '#64748b',
                border: selectedFloor === 'rdc-inf' ? 'none' : '1px solid #e2e8f0',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ⬇️ RDC Inf ({waitingInfCount} en attente)
            </button>
            <button
              onClick={() => setSelectedFloor('rdc-sup')}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: selectedFloor === 'rdc-sup' ? '#3b82f6' : 'white',
                color: selectedFloor === 'rdc-sup' ? 'white' : '#64748b',
                border: selectedFloor === 'rdc-sup' ? 'none' : '1px solid #e2e8f0',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ⬆️ RDC Sup ({waitingSupCount} en attente)
            </button>
          </div>

          {/* Résumé */}
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            marginBottom: '12px',
            fontSize: '12px',
          }}>
            <span style={{ background: '#d1fae5', padding: '4px 10px', borderRadius: '16px' }}>
              🚪 Dehors: <strong>{outsidePatients.length}</strong>
            </span>
            <span style={{ background: '#fef3c7', padding: '4px 10px', borderRadius: '16px' }}>
              🪑 Attente: <strong>{waitingInfCount + waitingSupCount}</strong>
            </span>
            <span style={{ background: '#fecaca', padding: '4px 10px', borderRadius: '16px' }}>
              💳 Paiement: <strong>{receptionCount}</strong>
            </span>
          </div>

          {/* Container Plan + Extérieur */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '0',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
          }}>
            {/* Plan avec image de fond */}
            <div style={{
              position: 'relative',
              flex: '1 1 auto',
              overflow: 'hidden',
            }}>
              {/* Wrapper pour image + zones (se déplace ensemble lors du rognage) */}
              <div style={{
                position: 'relative',
                width: selectedFloor === 'rdc-inf' ? '120%' : '100%',
                marginRight: selectedFloor === 'rdc-inf' ? '-20%' : '0',
              }}>
                <img 
                  src={planImage} 
                  alt={`Plan ${selectedFloor}`}
                  style={{ 
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
                
                {/* Zones superposées */}
                {zones.map(zone => (
                  <PlanZone
                    key={zone.id}
                    zone={zone}
                    patients={getPatientsByZone(zone.id)}
                    isDragging={!!activeDragData}
                    practitioners={practitioners}
                    osteosInZone={getOsteosByZone(zone.id)}
                  />
                ))}
              </div>
            </div>
            
            {/* Zone Extérieur à droite - Patients à venir */}
            <OutsideZone 
              patientsByOsteo={patientsByOsteo}
              practitioners={practitioners}
              isDragging={!!activeDragData}
            />
          </div>
          
          <div style={{ 
            marginTop: '8px', 
            fontSize: '11px',
            color: '#94a3b8',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 8px',
          }}>
            <span>💡 Glissez les patients depuis la zone extérieure vers le plan</span>
            {canConfigure && (
              <a 
                href="/admin/floor-plan"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#64748b',
                  textDecoration: 'none',
                  fontSize: '11px',
                }}
              >
                <Settings size={12} /> Configurer zones
              </a>
            )}
          </div>
        </div>
        
        {Object.keys(patientsByOsteo).length === 0 && outsidePatients.length === 0 && (
          <div style={{ 
            marginTop: '16px',
            textAlign: 'center', 
            padding: '20px',
            background: '#d1fae5',
            borderRadius: '12px',
            color: '#059669',
            fontSize: '14px',
            fontWeight: 500,
          }}>
            ✨ Tous les patients sont arrivés ou en consultation !
          </div>
        )}
      </div>
      
      <DragOverlay>
        {activeDragData && (
          <PatientChip appointment={activeDragData} isDragging />
        )}
      </DragOverlay>
    </DndContext>
  );
}
