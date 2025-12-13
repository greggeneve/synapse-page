/**
 * FloorPlanConfigurator - Outil pour dessiner les zones sur le plan
 * Permet à l'admin de configurer visuellement les zones drag & drop
 */

import { useState, useRef, useEffect } from 'react';
import { Save, Trash2, Edit3, Plus, RotateCcw } from 'lucide-react';

interface ZoneConfig {
  id: string;
  label: string;
  top: number;    // en %
  left: number;   // en %
  width: number;  // en %
  height: number; // en %
  color: string;
}

interface FloorPlanConfiguratorProps {
  floor: 'rdc-inf' | 'rdc-sup';
  planImage: string;
  initialZones?: ZoneConfig[];
  onSave: (zones: ZoneConfig[]) => void;
}

const ZONE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
];

const ZONE_TYPES_RDC_INF = [
  { id: 'room-101', label: 'Salle 101' },
  { id: 'room-102', label: 'Salle 102' },
  { id: 'room-103', label: 'Salle 103' },
  { id: 'room-104', label: 'Salle 104' },
  { id: 'room-105', label: 'Salle 105' },
  { id: 'room-106', label: 'Salle 106' },
  { id: 'waiting-room-inf', label: 'Salle d\'attente' },
  { id: 'reception', label: 'Accueil' },
];

const ZONE_TYPES_RDC_SUP = [
  { id: 'room-121', label: 'Salle 121' },
  { id: 'room-122', label: 'Salle 122' },
  { id: 'room-123', label: 'Salle 123' },
  { id: 'room-124', label: 'Salle 124' },
  { id: 'waiting-room-sup', label: 'Salle d\'attente' },
];

export function FloorPlanConfigurator({ 
  floor, 
  planImage, 
  initialZones = [],
  onSave 
}: FloorPlanConfiguratorProps) {
  const [zones, setZones] = useState<ZoneConfig[]>(initialZones);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const zoneTypes = floor === 'rdc-inf' ? ZONE_TYPES_RDC_INF : ZONE_TYPES_RDC_SUP;
  const [newZoneType, setNewZoneType] = useState<string>(zoneTypes[0].id);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculer position en % relatif au conteneur
  const getRelativePosition = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).classList.contains('plan-image')) return;
    
    const pos = getRelativePosition(e.clientX, e.clientY);
    setIsDrawing(true);
    setDrawStart(pos);
    setCurrentRect({ top: pos.y, left: pos.x, width: 0, height: 0 });
    setSelectedZoneId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !drawStart) return;
    
    const pos = getRelativePosition(e.clientX, e.clientY);
    const top = Math.min(drawStart.y, pos.y);
    const left = Math.min(drawStart.x, pos.x);
    const width = Math.abs(pos.x - drawStart.x);
    const height = Math.abs(pos.y - drawStart.y);
    
    setCurrentRect({ top, left, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect) {
      setIsDrawing(false);
      return;
    }
    
    // Minimum size check
    if (currentRect.width > 2 && currentRect.height > 2) {
      // Trouver une couleur non utilisée
      const usedColors = zones.map(z => z.color);
      const availableColor = ZONE_COLORS.find(c => !usedColors.includes(c)) || ZONE_COLORS[0];
      
      // Vérifier si le type de zone existe déjà
      const existingZone = zones.find(z => z.id === newZoneType);
      if (existingZone) {
        // Mettre à jour la zone existante
        setZones(zones.map(z => 
          z.id === newZoneType 
            ? { ...z, ...currentRect }
            : z
        ));
      } else {
        // Créer nouvelle zone
        const zoneInfo = zoneTypes.find(z => z.id === newZoneType);
        const newZone: ZoneConfig = {
          id: newZoneType,
          label: zoneInfo?.label || newZoneType,
          ...currentRect,
          color: availableColor,
        };
        setZones([...zones, newZone]);
      }
    }
    
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentRect(null);
  };

  const handleZoneClick = (zoneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedZoneId(zoneId === selectedZoneId ? null : zoneId);
  };

  const deleteZone = (zoneId: string) => {
    setZones(zones.filter(z => z.id !== zoneId));
    setSelectedZoneId(null);
  };

  const updateZoneLabel = (zoneId: string, newLabel: string) => {
    setZones(zones.map(z => z.id === zoneId ? { ...z, label: newLabel } : z));
    setEditingLabel(null);
  };

  const resetZones = () => {
    if (confirm('Supprimer toutes les zones ?')) {
      setZones([]);
      setSelectedZoneId(null);
    }
  };

  const handleSave = () => {
    onSave(zones);
  };

  // Filtrer les types de zone disponibles (non déjà dessinés)
  const availableZoneTypes = zoneTypes.filter(
    zt => !zones.find(z => z.id === zt.id) || zt.id === newZoneType
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>
          🎨 Configuration des zones - {floor === 'rdc-inf' ? 'RDC Inférieur' : 'RDC Supérieur'}
        </h2>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={resetZones}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: '#fee2e2',
              color: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <RotateCcw size={16} /> Reset
          </button>
          <button
            onClick={handleSave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <Save size={16} /> Sauvegarder
          </button>
        </div>
      </div>

      {/* Sélecteur de type de zone */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '8px',
      }}>
        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
          <Plus size={14} style={{ verticalAlign: 'middle' }} /> Dessiner :
        </span>
        <select
          value={newZoneType}
          onChange={(e) => setNewZoneType(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '13px',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          {zoneTypes.map(zt => (
            <option key={zt.id} value={zt.id}>
              {zt.label} {zones.find(z => z.id === zt.id) ? '✓' : ''}
            </option>
          ))}
        </select>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
          Cliquez et glissez sur le plan pour dessiner la zone
        </span>
      </div>

      {/* Plan avec zones */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          cursor: isDrawing ? 'crosshair' : 'default',
          userSelect: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <img 
          src={planImage} 
          alt="Plan"
          className="plan-image"
          style={{ 
            width: '100%', 
            height: 'auto',
            display: 'block',
            pointerEvents: 'none',
          }}
          draggable={false}
        />
        
        {/* Zones existantes */}
        {zones.map(zone => (
          <div
            key={zone.id}
            onClick={(e) => handleZoneClick(zone.id, e)}
            style={{
              position: 'absolute',
              top: `${zone.top}%`,
              left: `${zone.left}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              background: `${zone.color}40`,
              border: `3px solid ${zone.color}`,
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: selectedZoneId === zone.id ? `0 0 0 3px ${zone.color}80` : 'none',
            }}
          >
            {editingLabel === zone.id ? (
              <input
                autoFocus
                defaultValue={zone.label}
                onBlur={(e) => updateZoneLabel(zone.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateZoneLabel(zone.id, e.currentTarget.value);
                  if (e.key === 'Escape') setEditingLabel(null);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '80%',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  textAlign: 'center',
                  border: '2px solid white',
                  borderRadius: '4px',
                  background: 'white',
                }}
              />
            ) : (
              <span style={{
                background: 'white',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: zone.color,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}>
                {zone.label}
              </span>
            )}
            
            {/* Actions sur zone sélectionnée */}
            {selectedZoneId === zone.id && (
              <div style={{
                position: 'absolute',
                top: '-36px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '4px',
                background: 'white',
                padding: '4px',
                borderRadius: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
              }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingLabel(zone.id); }}
                  style={{
                    padding: '6px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  title="Renommer"
                >
                  <Edit3 size={14} color="#64748b" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }}
                  style={{
                    padding: '6px',
                    background: '#fee2e2',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  title="Supprimer"
                >
                  <Trash2 size={14} color="#dc2626" />
                </button>
              </div>
            )}
          </div>
        ))}
        
        {/* Rectangle en cours de dessin */}
        {isDrawing && currentRect && (
          <div
            style={{
              position: 'absolute',
              top: `${currentRect.top}%`,
              left: `${currentRect.left}%`,
              width: `${currentRect.width}%`,
              height: `${currentRect.height}%`,
              background: 'rgba(59, 130, 246, 0.3)',
              border: '3px dashed #3b82f6',
              borderRadius: '8px',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* Liste des zones configurées */}
      <div style={{ 
        marginTop: '16px',
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '8px',
      }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
          Zones configurées ({zones.length})
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {zones.map(zone => (
            <span
              key={zone.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: 'white',
                border: `2px solid ${zone.color}`,
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500,
                color: zone.color,
              }}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: zone.color,
              }} />
              {zone.label}
            </span>
          ))}
          {zones.length === 0 && (
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>
              Aucune zone configurée. Dessinez sur le plan !
            </span>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div style={{ 
        marginTop: '12px',
        padding: '12px',
        background: '#eff6ff',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#3b82f6',
      }}>
        <strong>💡 Instructions :</strong>
        <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
          <li>Sélectionnez le type de zone dans le menu déroulant</li>
          <li>Cliquez et glissez sur le plan pour dessiner un rectangle</li>
          <li>Cliquez sur une zone pour la modifier ou supprimer</li>
          <li>Cliquez sur "Sauvegarder" quand c'est terminé</li>
        </ul>
      </div>
    </div>
  );
}
