/**
 * Page de démonstration - Test de la transcription audio
 * Accessible sans agenda.ch configuré
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  User,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Activity,
  ClipboardList,
  FileText,
  Sparkles
} from 'lucide-react';
import { AudioRecorder } from '../components/AudioRecorder';
import { isGeminiConfigured } from '../services/transcriptionService';
import type { AIAlert } from '../services/transcriptionService';
import './ConsultationPage.css';

// Patient fictif pour la démo
const DEMO_PATIENT = {
  name: 'Patient Démo',
  initials: 'PD',
  age: 42,
  gender: 'Homme',
  antecedents: `- Lombalgie chronique depuis 2019
- HTA sous traitement (Lisinopril 10mg)
- Ancien fumeur (arrêt 2020)
- Stress professionnel important
- Dernière consultation: douleur épaule droite (15/11/2024)`
};

export function DemoConsultation() {
  const navigate = useNavigate();
  
  // État des sections
  const [expandedSections, setExpandedSections] = useState({
    anamnesis: true,
    examination: false,
    treatment: false
  });
  
  // Contenu des sections
  const [anamnesis, setAnamnesis] = useState('');
  const [examination, setExamination] = useState('');
  const [treatment, setTreatment] = useState('');
  
  // Alertes IA
  const [aiAlerts, setAiAlerts] = useState<(AIAlert & { source: string })[]>([]);
  
  // Copie
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  // Copier
  const copyToClipboard = async (text: string, sectionName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionName);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Erreur copie:', err);
    }
  };
  
  // Générer l'export
  const generateExport = (): string => {
    const parts: string[] = [];
    
    if (anamnesis.trim()) {
      parts.push('=== ANAMNÈSE ===');
      parts.push(anamnesis);
      parts.push('');
    }
    
    if (examination.trim()) {
      parts.push('=== EXAMEN CLINIQUE ===');
      parts.push(examination);
      parts.push('');
    }
    
    if (treatment.trim()) {
      parts.push('=== TRAITEMENT ===');
      parts.push(treatment);
    }
    
    return parts.join('\n');
  };
  
  // Contexte pour l'IA (sans données sensibles)
  const aiContext = `Patient de ${DEMO_PATIENT.age} ans (${DEMO_PATIENT.gender.toLowerCase()}).
Antécédents connus:
${DEMO_PATIENT.antecedents}`;

  return (
    <div className="consultation-page">
      {/* Header */}
      <header className="consultation-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div className="header-info">
            <h1>🧪 Mode Démo - Transcription</h1>
            <p>Testez l'enregistrement audio et la transcription IA</p>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            className="btn-copy-all"
            onClick={() => copyToClipboard(generateExport(), 'all')}
            disabled={!anamnesis && !examination && !treatment}
          >
            {copiedSection === 'all' ? <Check size={18} /> : <Copy size={18} />}
            {copiedSection === 'all' ? 'Copié !' : 'Copier tout'}
          </button>
        </div>
      </header>
      
      <div className="consultation-content">
        {/* Sidebar Patient Démo */}
        <aside className="patient-sidebar">
          <div className="patient-card">
            <div className="patient-avatar large">
              {DEMO_PATIENT.initials}
            </div>
            <div className="patient-main-info">
              <h2>{DEMO_PATIENT.name}</h2>
              <span className="patient-age">{DEMO_PATIENT.age} ans • {DEMO_PATIENT.gender}</span>
            </div>
          </div>
          
          {/* Antécédents */}
          <div className="sidebar-section antecedents">
            <div className="section-header-static">
              <AlertTriangle size={18} />
              <span>Antécédents (démo)</span>
            </div>
            <div className="section-content">
              <p className="antecedents-text">{DEMO_PATIENT.antecedents}</p>
            </div>
          </div>
          
          {/* Info configuration */}
          <div className="sidebar-section">
            <div className="section-content" style={{ padding: '16px' }}>
              <div style={{ 
                padding: '12px', 
                background: isGeminiConfigured() ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                fontSize: '0.8rem'
              }}>
                <strong style={{ color: isGeminiConfigured() ? '#22c55e' : '#ef4444' }}>
                  {isGeminiConfigured() ? '✅ Gemini configuré' : '❌ Gemini non configuré'}
                </strong>
                {!isGeminiConfigured() && (
                  <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>
                    Ajoutez <code>VITE_GEMINI_API_KEY</code> dans .env.local pour activer la transcription IA
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
        
        {/* Zone principale */}
        <main className="consultation-main">
          {/* Alertes IA */}
          {aiAlerts.length > 0 && (
            <div className="ai-alerts">
              <h4 style={{ margin: '0 0 8px', fontSize: '0.875rem', color: '#f8fafc' }}>
                <Sparkles size={16} style={{ marginRight: '8px' }} />
                Alertes détectées par l'IA
              </h4>
              {aiAlerts.map((alert, i) => (
                <div key={i} className={`alert-item ${alert.type}`}>
                  <AlertTriangle size={16} />
                  <span>{alert.message}</span>
                  <small style={{ marginLeft: 'auto', opacity: 0.7 }}>({alert.source})</small>
                </div>
              ))}
            </div>
          )}
          
          {/* Instructions */}
          <div style={{ 
            padding: '16px 20px', 
            background: 'rgba(59, 130, 246, 0.1)', 
            borderRadius: '12px',
            marginBottom: '16px',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <h4 style={{ margin: '0 0 8px', color: '#3b82f6' }}>💡 Comment tester</h4>
            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.8' }}>
              <li>Cliquez sur <strong style={{ color: '#ef4444' }}>"Enregistrer"</strong> dans une section</li>
              <li>Parlez dans votre micro (ex: "Le patient présente une douleur lombaire...")</li>
              <li>Cliquez sur <strong>Stop</strong> pour arrêter</li>
              <li>Cliquez sur <strong style={{ color: '#8b5cf6' }}>"Transcrire"</strong> pour envoyer à Gemini</li>
              <li>Le texte transcrit + les alertes apparaîtront automatiquement !</li>
            </ol>
          </div>
          
          {/* Section Anamnèse */}
          <div className={`consultation-section ${expandedSections.anamnesis ? 'expanded' : ''}`}>
            <button 
              className="section-header"
              onClick={() => toggleSection('anamnesis')}
            >
              <div className="section-title">
                <ClipboardList size={20} />
                <h3>Anamnèse</h3>
              </div>
              <div className="section-actions">
                {anamnesis && (
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(anamnesis, 'anamnesis');
                    }}
                  >
                    {copiedSection === 'anamnesis' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {expandedSections.anamnesis ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            
            {expandedSections.anamnesis && (
              <div className="section-body">
                <div className="context-box">
                  <div className="context-header">
                    <FileText size={14} />
                    <span>Contexte patient (envoyé à l'IA)</span>
                  </div>
                  <p>{aiContext}</p>
                </div>
                
                <AudioRecorder
                  section="anamnesis"
                  context={aiContext}
                  onTranscription={(text) => setAnamnesis(prev => prev ? `${prev}\n\n${text}` : text)}
                  onAlerts={(alerts) => setAiAlerts(prev => [...prev, ...alerts.map(a => ({ ...a, source: 'anamnesis' }))])}
                />

                <div className="input-area">
                  <div className="input-header">
                    <span>Transcription / Saisie manuelle</span>
                  </div>
                  <textarea
                    value={anamnesis}
                    onChange={(e) => setAnamnesis(e.target.value)}
                    placeholder="La transcription apparaîtra ici, ou saisissez manuellement..."
                    rows={6}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Section Examen */}
          <div className={`consultation-section ${expandedSections.examination ? 'expanded' : ''}`}>
            <button 
              className="section-header"
              onClick={() => toggleSection('examination')}
            >
              <div className="section-title">
                <Stethoscope size={20} />
                <h3>Examen clinique</h3>
              </div>
              <div className="section-actions">
                {examination && (
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(examination, 'examination');
                    }}
                  >
                    {copiedSection === 'examination' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {expandedSections.examination ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            
            {expandedSections.examination && (
              <div className="section-body">
                <AudioRecorder
                  section="examination"
                  context={aiContext}
                  onTranscription={(text) => setExamination(prev => prev ? `${prev}\n\n${text}` : text)}
                  onAlerts={(alerts) => setAiAlerts(prev => [...prev, ...alerts.map(a => ({ ...a, source: 'examen' }))])}
                />

                <div className="input-area">
                  <div className="input-header">
                    <span>Transcription / Saisie manuelle</span>
                  </div>
                  <textarea
                    value={examination}
                    onChange={(e) => setExamination(e.target.value)}
                    placeholder="Observations, tests effectués, mobilité..."
                    rows={6}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Section Traitement */}
          <div className={`consultation-section ${expandedSections.treatment ? 'expanded' : ''}`}>
            <button 
              className="section-header"
              onClick={() => toggleSection('treatment')}
            >
              <div className="section-title">
                <Activity size={20} />
                <h3>Traitement</h3>
              </div>
              <div className="section-actions">
                {treatment && (
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(treatment, 'treatment');
                    }}
                  >
                    {copiedSection === 'treatment' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {expandedSections.treatment ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            
            {expandedSections.treatment && (
              <div className="section-body">
                <AudioRecorder
                  section="treatment"
                  context={aiContext}
                  onTranscription={(text) => setTreatment(prev => prev ? `${prev}\n\n${text}` : text)}
                  onAlerts={(alerts) => setAiAlerts(prev => [...prev, ...alerts.map(a => ({ ...a, source: 'traitement' }))])}
                />

                <div className="input-area">
                  <div className="input-header">
                    <span>Transcription / Saisie manuelle</span>
                  </div>
                  <textarea
                    value={treatment}
                    onChange={(e) => setTreatment(e.target.value)}
                    placeholder="Techniques utilisées, zones traitées..."
                    rows={6}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Export */}
          {(anamnesis || examination || treatment) && (
            <div className="export-zone">
              <h4>Export pour agenda.ch</h4>
              <div className="export-preview">
                {generateExport()}
              </div>
              <div className="export-actions">
                <button 
                  className="btn-copy"
                  onClick={() => copyToClipboard(generateExport(), 'export')}
                >
                  {copiedSection === 'export' ? <Check size={16} /> : <Copy size={16} />}
                  {copiedSection === 'export' ? 'Copié !' : 'Copier pour agenda.ch'}
                </button>
                <button 
                  className="btn-report"
                  onClick={() => navigate('/pro/reports', { 
                    state: { 
                      patientName: DEMO_PATIENT.name,
                      content: generateExport()
                    }
                  })}
                >
                  <FileText size={16} />
                  Créer un rapport
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

