/**
 * Page de Consultation - Synapse.poge
 * 
 * Fiche patient complète avec :
 * - Informations patient (depuis agenda.ch)
 * - Antécédents et historique
 * - Sections anamnèse / examen / traitement
 * - Préparation pour transcription audio
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  User,
  Calendar,
  Clock,
  Phone,
  Mail,
  MapPin,
  FileText,
  AlertTriangle,
  History,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Activity,
  ClipboardList,
  Loader2
} from 'lucide-react';
import { 
  getCustomerById, 
  getPatientHistory,
  formatPatientForDisplay,
  extractAntecedentsForAI,
  type AgendaCustomer,
  type AgendaAppointment
} from '../services/agendaService';
import { useWebSocket } from '../services/websocketService';
import type { TeamMember } from '../types';
import type { ConsultationSection } from '../types/synapse';
import type { AIAlert } from '../services/transcriptionService';
import { AudioRecorder } from '../components/AudioRecorder';
import './ConsultationPage.css';

interface ConsultationPageProps {
  user: TeamMember;
}

export function ConsultationPage({ user }: ConsultationPageProps) {
  const navigate = useNavigate();
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const employeeId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  
  const { endConsultation } = useWebSocket('osteo', employeeId, `${user.prenom} ${user.nom}`);
  
  // État patient
  const [customer, setCustomer] = useState<AgendaCustomer | null>(null);
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // État consultation
  const [anamnesis, setAnamnesis] = useState<ConsultationSection>({
    context: '',
    transcription: '',
    isRecording: false,
    isTranscribing: false
  });
  const [examination, setExamination] = useState<ConsultationSection>({
    context: '',
    transcription: '',
    isRecording: false,
    isTranscribing: false
  });
  const [treatment, setTreatment] = useState<ConsultationSection>({
    context: '',
    transcription: '',
    isRecording: false,
    isTranscribing: false
  });
  
  // État UI
  const [expandedSections, setExpandedSections] = useState({
    info: true,
    history: false,
    anamnesis: true,
    examination: false,
    treatment: false
  });
  const [aiAlerts, setAiAlerts] = useState<AIAlert[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  // Charger les données patient
  const loadPatientData = useCallback(async () => {
    if (!appointmentId) {
      setError('ID de rendez-vous manquant');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Pour le moment, on utilise un customerId de test
      // TODO: Récupérer le customerId depuis l'appointmentId
      const customerId = parseInt(appointmentId, 10);
      
      const { customer: patientData, appointments: history } = await getPatientHistory(customerId);
      
      if (patientData) {
        setCustomer(patientData);
        setAppointments(history);
        
        // Pré-remplir le contexte avec les antécédents (sans données sensibles)
        const context = extractAntecedentsForAI(patientData);
        setAnamnesis(prev => ({ ...prev, context }));
      } else {
        setError('Patient non trouvé');
      }
    } catch (err) {
      console.error('Erreur chargement patient:', err);
      setError('Erreur lors du chargement des données patient');
    } finally {
      setIsLoading(false);
    }
  }, [appointmentId]);
  
  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);
  
  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  // Copier le contenu d'une section
  const copyToClipboard = async (text: string, sectionName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionName);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Erreur copie:', err);
    }
  };
  
  // Générer l'export complet pour agenda.ch
  const generateExport = (): string => {
    const parts: string[] = [];
    
    if (anamnesis.transcription.trim()) {
      parts.push('=== ANAMNÈSE ===');
      parts.push(anamnesis.transcription);
      parts.push('');
    }
    
    if (examination.transcription.trim()) {
      parts.push('=== EXAMEN CLINIQUE ===');
      parts.push(examination.transcription);
      parts.push('');
    }
    
    if (treatment.transcription.trim()) {
      parts.push('=== TRAITEMENT ===');
      parts.push(treatment.transcription);
    }
    
    return parts.join('\n');
  };
  
  // Terminer la consultation
  const handleEndConsultation = () => {
    if (appointmentId) {
      endConsultation(parseInt(appointmentId, 10));
    }
    navigate('/pro/workspace');
  };
  
  // Formater les données patient pour l'affichage
  const patientDisplay = customer ? formatPatientForDisplay(customer) : null;
  
  // Filtrer les consultations passées (pas celle d'aujourd'hui)
  const pastAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.start_at);
    const today = new Date();
    return aptDate.toDateString() !== today.toDateString();
  }).slice(0, 10); // Limiter à 10

  if (isLoading) {
    return (
      <div className="consultation-page loading">
        <Loader2 size={48} className="spin" />
        <p>Chargement des données patient...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="consultation-page error">
        <AlertTriangle size={48} />
        <p>{error}</p>
        <button onClick={() => navigate('/pro/workspace')}>
          Retour à l'espace de travail
        </button>
      </div>
    );
  }

  return (
    <div className="consultation-page">
      {/* Header */}
      <header className="consultation-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/pro/workspace')}>
            <ArrowLeft size={20} />
          </button>
          <div className="header-info">
            <h1>Consultation en cours</h1>
            <p>{new Date().toLocaleDateString('fr-CH', { 
              weekday: 'long', 
              day: 'numeric', 
              month: 'long' 
            })}</p>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            className="btn-copy-all"
            onClick={() => copyToClipboard(generateExport(), 'all')}
            disabled={!anamnesis.transcription && !examination.transcription && !treatment.transcription}
          >
            {copiedSection === 'all' ? <Check size={18} /> : <Copy size={18} />}
            {copiedSection === 'all' ? 'Copié !' : 'Copier tout'}
          </button>
          <button 
            className="btn-end"
            onClick={handleEndConsultation}
          >
            <Check size={18} />
            Terminer
          </button>
        </div>
      </header>
      
      <div className="consultation-content">
        {/* Colonne gauche - Infos patient */}
        <aside className="patient-sidebar">
          {/* Carte patient */}
          <div className="patient-card">
            <div className="patient-avatar large">
              {patientDisplay?.initials || '??'}
            </div>
            <div className="patient-main-info">
              <h2>{patientDisplay?.displayName || 'Patient'}</h2>
              {patientDisplay?.age && (
                <span className="patient-age">{patientDisplay.age} ans</span>
              )}
            </div>
          </div>
          
          {/* Section Informations */}
          <div className="sidebar-section">
            <button 
              className="section-toggle"
              onClick={() => toggleSection('info')}
            >
              <User size={18} />
              <span>Informations</span>
              {expandedSections.info ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            {expandedSections.info && customer && (
              <div className="section-content">
                {customer.birthdate && (
                  <div className="info-row">
                    <Calendar size={14} />
                    <span>Né(e) le {new Date(customer.birthdate).toLocaleDateString('fr-CH')}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="info-row">
                    <Phone size={14} />
                    <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                  </div>
                )}
                {customer.mobile && customer.mobile !== customer.phone && (
                  <div className="info-row">
                    <Phone size={14} />
                    <a href={`tel:${customer.mobile}`}>{customer.mobile}</a>
                  </div>
                )}
                {customer.email && (
                  <div className="info-row">
                    <Mail size={14} />
                    <a href={`mailto:${customer.email}`}>{customer.email}</a>
                  </div>
                )}
                {(customer.address || customer.city) && (
                  <div className="info-row">
                    <MapPin size={14} />
                    <span>
                      {customer.address && `${customer.address}, `}
                      {customer.zip && `${customer.zip} `}
                      {customer.city}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Section Antécédents */}
          {customer?.notes && (
            <div className="sidebar-section antecedents">
              <div className="section-header-static">
                <AlertTriangle size={18} />
                <span>Antécédents / Notes</span>
              </div>
              <div className="section-content">
                <p className="antecedents-text">{customer.notes}</p>
              </div>
            </div>
          )}
          
          {/* Section Historique */}
          <div className="sidebar-section">
            <button 
              className="section-toggle"
              onClick={() => toggleSection('history')}
            >
              <History size={18} />
              <span>Historique ({pastAppointments.length})</span>
              {expandedSections.history ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            {expandedSections.history && (
              <div className="section-content history-list">
                {pastAppointments.length === 0 ? (
                  <p className="empty-history">Aucune consultation précédente</p>
                ) : (
                  pastAppointments.map(apt => (
                    <div key={apt.id} className="history-item">
                      <div className="history-date">
                        {new Date(apt.start_at).toLocaleDateString('fr-CH', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </div>
                      {apt.notes && (
                        <div className="history-notes">{apt.notes}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
        
        {/* Zone principale - Sections consultation */}
        <main className="consultation-main">
          {/* Alertes IA */}
          {aiAlerts.length > 0 && (
            <div className="ai-alerts">
              {aiAlerts.map((alert, i) => (
                <div key={i} className={`alert-item ${alert.type}`}>
                  <AlertTriangle size={16} />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}
          
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
                {anamnesis.transcription && (
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(anamnesis.transcription, 'anamnesis');
                    }}
                    title="Copier"
                  >
                    {copiedSection === 'anamnesis' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {expandedSections.anamnesis ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            
            {expandedSections.anamnesis && (
              <div className="section-body">
                {/* Contexte pré-rempli */}
                {anamnesis.context && (
                  <div className="context-box">
                    <div className="context-header">
                      <FileText size={14} />
                      <span>Contexte (antécédents)</span>
                    </div>
                    <p>{anamnesis.context}</p>
                  </div>
                )}
                
                {/* Enregistrement audio */}
                <AudioRecorder
                  section="anamnesis"
                  context={anamnesis.context}
                  onTranscription={(text) => setAnamnesis(prev => ({ 
                    ...prev, 
                    transcription: prev.transcription ? `${prev.transcription}\n\n${text}` : text 
                  }))}
                  onAlerts={(alerts) => setAiAlerts(prev => [...prev, ...alerts.map(a => ({ ...a, source: 'anamnesis' as const }))])}
                />

                {/* Zone de saisie / transcription */}
                <div className="input-area">
                  <div className="input-header">
                    <span>Saisie / Transcription</span>
                  </div>
                  <textarea
                    value={anamnesis.transcription}
                    onChange={(e) => setAnamnesis(prev => ({ ...prev, transcription: e.target.value }))}
                    placeholder="Motif de consultation, histoire de la maladie, symptômes..."
                    rows={6}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Section Examen clinique */}
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
                {examination.transcription && (
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(examination.transcription, 'examination');
                    }}
                    title="Copier"
                  >
                    {copiedSection === 'examination' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {expandedSections.examination ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            
            {expandedSections.examination && (
              <div className="section-body">
                {/* Enregistrement audio */}
                <AudioRecorder
                  section="examination"
                  context={anamnesis.context}
                  onTranscription={(text) => setExamination(prev => ({ 
                    ...prev, 
                    transcription: prev.transcription ? `${prev.transcription}\n\n${text}` : text 
                  }))}
                  onAlerts={(alerts) => setAiAlerts(prev => [...prev, ...alerts.map(a => ({ ...a, source: 'examination' as const }))])}
                />

                <div className="input-area">
                  <div className="input-header">
                    <span>Saisie / Transcription</span>
                  </div>
                  <textarea
                    value={examination.transcription}
                    onChange={(e) => setExamination(prev => ({ ...prev, transcription: e.target.value }))}
                    placeholder="Observations, tests effectués, mobilité, palpation..."
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
                {treatment.transcription && (
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(treatment.transcription, 'treatment');
                    }}
                    title="Copier"
                  >
                    {copiedSection === 'treatment' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {expandedSections.treatment ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            
            {expandedSections.treatment && (
              <div className="section-body">
                {/* Enregistrement audio */}
                <AudioRecorder
                  section="treatment"
                  context={anamnesis.context}
                  onTranscription={(text) => setTreatment(prev => ({ 
                    ...prev, 
                    transcription: prev.transcription ? `${prev.transcription}\n\n${text}` : text 
                  }))}
                  onAlerts={(alerts) => setAiAlerts(prev => [...prev, ...alerts.map(a => ({ ...a, source: 'treatment' as const }))])}
                />

                <div className="input-area">
                  <div className="input-header">
                    <span>Saisie / Transcription</span>
                  </div>
                  <textarea
                    value={treatment.transcription}
                    onChange={(e) => setTreatment(prev => ({ ...prev, transcription: e.target.value }))}
                    placeholder="Techniques utilisées, zones traitées, réactions du patient..."
                    rows={6}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Zone d'export */}
          <div className="export-zone">
            <h4>Export pour agenda.ch</h4>
            <div className="export-preview">
              {generateExport() || 'Complétez les sections ci-dessus pour générer l\'export...'}
            </div>
            <div className="export-actions">
              <button 
                className="btn-copy"
                onClick={() => copyToClipboard(generateExport(), 'export')}
                disabled={!generateExport()}
              >
                {copiedSection === 'export' ? <Check size={16} /> : <Copy size={16} />}
                {copiedSection === 'export' ? 'Copié !' : 'Copier pour agenda.ch'}
              </button>
              <button 
                className="btn-report"
                onClick={() => navigate('/pro/reports', { 
                  state: { 
                    patientName: patientDisplay?.displayName,
                    patientBirthDate: customer?.birthdate,
                    content: generateExport()
                  }
                })}
                disabled={!generateExport()}
              >
                <FileText size={16} />
                Créer un rapport
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

