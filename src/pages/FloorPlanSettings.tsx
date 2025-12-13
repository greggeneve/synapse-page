/**
 * FloorPlanSettings - Page de configuration des zones du plan
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { FloorPlanConfigurator } from '../components/FloorPlanConfigurator';
import { getFloorConfig, saveFloorConfig } from '../services/floorPlanConfigService';
import type { ZoneConfig } from '../services/floorPlanConfigService';

export default function FloorPlanSettings() {
  const navigate = useNavigate();
  const [selectedFloor, setSelectedFloor] = useState<'rdc-inf' | 'rdc-sup'>('rdc-inf');
  const [zonesInf, setZonesInf] = useState<ZoneConfig[]>([]);
  const [zonesSup, setZonesSup] = useState<ZoneConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const [inf, sup] = await Promise.all([
        getFloorConfig('rdc-inf'),
        getFloorConfig('rdc-sup'),
      ]);
      setZonesInf(inf);
      setZonesSup(sup);
    } catch (error) {
      console.error('Erreur chargement config:', error);
    }
    setLoading(false);
  };

  const handleSave = async (zones: ZoneConfig[]) => {
    setSaving(true);
    setMessage(null);
    
    try {
      const result = await saveFloorConfig(selectedFloor, zones);
      
      if (result.success) {
        // Mettre à jour l'état local
        if (selectedFloor === 'rdc-inf') {
          setZonesInf(zones);
        } else {
          setZonesSup(zones);
        }
        setMessage({ type: 'success', text: 'Configuration sauvegardée !' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Erreur de sauvegarde' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    }
    
    setSaving(false);
    
    // Effacer le message après 3s
    setTimeout(() => setMessage(null), 3000);
  };

  const planImage = selectedFloor === 'rdc-inf' ? '/plan-rdc-inf.png' : '/plan-rdc-sup.png';
  const currentZones = selectedFloor === 'rdc-inf' ? zonesInf : zonesSup;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f1f5f9',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        maxWidth: '1200px',
        margin: '0 auto 20px',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#64748b',
          }}
        >
          <ArrowLeft size={18} /> Retour
        </button>
        
        {/* Message de feedback */}
        {message && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: message.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: message.type === 'success' ? '#059669' : '#dc2626',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        )}
      </div>

      {/* Sélecteur d'étage */}
      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <button
          onClick={() => setSelectedFloor('rdc-inf')}
          style={{
            padding: '12px 24px',
            background: selectedFloor === 'rdc-inf' ? '#3b82f6' : 'white',
            color: selectedFloor === 'rdc-inf' ? 'white' : '#64748b',
            border: selectedFloor === 'rdc-inf' ? 'none' : '1px solid #e2e8f0',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ⬇️ RDC Inférieur ({zonesInf.length} zones)
        </button>
        <button
          onClick={() => setSelectedFloor('rdc-sup')}
          style={{
            padding: '12px 24px',
            background: selectedFloor === 'rdc-sup' ? '#3b82f6' : 'white',
            color: selectedFloor === 'rdc-sup' ? 'white' : '#64748b',
            border: selectedFloor === 'rdc-sup' ? 'none' : '1px solid #e2e8f0',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ⬆️ RDC Supérieur ({zonesSup.length} zones)
        </button>
      </div>

      {/* Configurateur */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Chargement...
        </div>
      ) : (
        <FloorPlanConfigurator
          key={selectedFloor}
          floor={selectedFloor}
          planImage={planImage}
          initialZones={currentZones}
          onSave={handleSave}
        />
      )}
      
      {saving && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            padding: '20px 40px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
          }}>
            Sauvegarde en cours...
          </div>
        </div>
      )}
    </div>
  );
}
