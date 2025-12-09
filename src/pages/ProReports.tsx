import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Download, 
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  User,
  Calendar,
  AtSign,
  PenLine
} from 'lucide-react';
import { getActiveTeamMembers } from '../services/teamService';
import { generateReportPDF, downloadPDF, loadImageAsBase64 } from '../services/pdfGenerator';
import { correctAndAdvise, type CorrectionResult } from '../services/geminiService';
import { PDFPreview } from '../components/PDFPreview';
import { SignatureSelector } from '../components/SignatureSelector';
import type { TeamMember, Report } from '../types';
import { query } from '../services/mariadb';

interface ProReportsProps {
  user: TeamMember;
}

export function ProReports({ user }: ProReportsProps) {
  const navigate = useNavigate();
  
  // État de l'équipe
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  
  // Logo en base64 pour le PDF
  const [logoBase64, setLogoBase64] = useState<string>('');
  
  // RME de l'utilisateur
  const [userRmeRcc, setUserRmeRcc] = useState<string>('');
  
  // État du rapport courant
  const [currentReport, setCurrentReport] = useState<Partial<Report>>({
    title: '',
    content: '',
    consultationDate: new Date().toISOString().split('T')[0],
    status: 'draft',
    authorName: `${user.prenom} ${user.nom}`,
    authorId: user.id,
    signatureLines: []
  });
  
  // État IA
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  
  // État UI
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // État pour le redimensionnement du panneau
  const [editorWidth, setEditorWidth] = useState(50); // Pourcentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // État pour le zoom du PDF
  const [pdfZoom, setPdfZoom] = useState(1);
  
  // Gestion du redimensionnement
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      
      // Limiter entre 20% et 80%
      setEditorWidth(Math.min(80, Math.max(20, newWidth)));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);
  
  // Gestion du zoom avec la molette
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setPdfZoom(prev => Math.min(3, Math.max(0.25, prev + delta)));
    }
  }, []);

  // Charger l'équipe, le logo et le RME au démarrage
  useEffect(() => {
    loadTeam();
    loadLogo();
    loadUserRme();
  }, []);

  const loadLogo = async () => {
    try {
      const base64 = await loadImageAsBase64('/logo-poge.png');
      setLogoBase64(base64);
    } catch (error) {
      console.error('Erreur chargement logo:', error);
    }
  };
  
  const loadUserRme = async () => {
    try {
      const employeeId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      console.log('Chargement RME pour employee_id:', employeeId);
      
      const result = await query<{ profile_json: any }>(
        `SELECT profile_json FROM employees WHERE employee_id = ?`,
        [employeeId]
      );
      
      if (result.success && result.data && result.data.length > 0) {
        const profile = typeof result.data[0].profile_json === 'string' 
          ? JSON.parse(result.data[0].profile_json)
          : result.data[0].profile_json;
        
        const rme = profile.externalIds?.rme_rcc || profile.externalIds?.id_externe_RME || '';
        setUserRmeRcc(rme);
      }
    } catch (error) {
      console.error('Erreur chargement RME:', error);
    }
  };
  
  // Gestion de la signature
  const handleSignatureChange = useCallback((signatureId: number, signatureLines: string[]) => {
    setCurrentReport(prev => ({
      ...prev,
      signatureId,
      signatureLines
    }));
  }, []);

  const loadTeam = async () => {
    setTeamLoading(true);
    try {
      const members = await getActiveTeamMembers();
      setTeamMembers(members);
    } catch (error) {
      console.error('Erreur chargement équipe:', error);
    } finally {
      setTeamLoading(false);
    }
  };

  // Analyser avec l'IA
  const handleAnalyze = useCallback(async () => {
    if (!currentReport.content?.trim()) return;
    
    setIsAnalyzing(true);
    try {
      const result = await correctAndAdvise(currentReport.content);
      setCorrectionResult(result);
      setCurrentReport(prev => ({
        ...prev,
        correctedContent: result.correctedText,
        corrections: result.corrections,
        suggestions: result.suggestions,
        warnings: result.warnings,
        status: 'corrected'
      }));
      setActiveTab('preview');
    } catch (error) {
      console.error('Erreur analyse:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentReport.content]);

  // Générer et télécharger le PDF
  const handleGeneratePDF = useCallback(async () => {
    if (!currentReport.content?.trim()) return;
    
    setIsGeneratingPDF(true);
    try {
      const pdfBlob = await generateReportPDF({
        report: {
          id: crypto.randomUUID(),
          authorId: user.id,
          authorName: `${user.prenom} ${user.nom}`,
          authorEmail: user.email_professionnel,
          title: currentReport.title || 'Rapport de consultation',
          content: currentReport.content || '',
          correctedContent: currentReport.correctedContent,
          patientInitials: currentReport.patientInitials,
          patientName: currentReport.patientName,
          patientBirthDate: currentReport.patientBirthDate,
          patientAge: currentReport.patientAge,
          consultationDate: currentReport.consultationDate || new Date().toISOString().split('T')[0],
          destinataire: currentReport.destinataire,
          introduction: currentReport.introduction,
          signatureId: currentReport.signatureId,
          signatureLines: currentReport.signatureLines,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: currentReport.status || 'draft',
          corrections: currentReport.corrections,
          suggestions: currentReport.suggestions,
          warnings: currentReport.warnings
        },
        logoBase64
      });
      
      const filename = `rapport_${currentReport.patientInitials || 'patient'}_${currentReport.consultationDate || 'date'}.pdf`;
      downloadPDF(pdfBlob, filename);
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [currentReport, teamMembers, logoBase64, user]);

  // Accepter les corrections
  const handleAcceptCorrections = () => {
    if (correctionResult) {
      setCurrentReport(prev => ({
        ...prev,
        content: correctionResult.correctedText,
        correctedContent: correctionResult.correctedText,
        status: 'corrected'
      }));
    }
  };

  return (
    <div className="pro-reports-page split-layout">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Rédiger un rapport</h1>
            <p>Aperçu en temps réel • Correction IA • Export PDF</p>
          </div>
        </div>
        <div className="header-right">
          <button 
            className="btn-primary"
            onClick={handleGeneratePDF}
            disabled={isGeneratingPDF || !currentReport.content?.trim()}
          >
            <Download size={18} />
            {isGeneratingPDF ? 'Génération...' : 'Télécharger PDF'}
          </button>
        </div>
      </header>

      {/* Layout Split */}
      <div className="split-container" ref={containerRef}>
        {/* Panneau gauche - Éditeur */}
        <div className="editor-panel" style={{ width: `${editorWidth}%` }}>
          {/* Infos Patient */}
          <div className="editor-section">
            <h3><User size={16} /> Informations patient</h3>
            <div className="form-row">
              <div className="form-field">
                <label>Nom complet du patient</label>
                <input
                  type="text"
                  value={currentReport.patientName || ''}
                  onChange={(e) => setCurrentReport(prev => ({ ...prev, patientName: e.target.value }))}
                  placeholder="Ex: Angela Kunz"
                />
              </div>
              <div className="form-field small">
                <label>Date de naissance</label>
                <input
                  type="date"
                  value={currentReport.patientBirthDate || ''}
                  onChange={(e) => setCurrentReport(prev => ({ ...prev, patientBirthDate: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Destinataire */}
          <div className="editor-section">
            <h3><AtSign size={16} /> Destinataire</h3>
            <div className="form-row">
              <div className="form-field">
                <label>À l'attention de</label>
                <input
                  type="text"
                  value={currentReport.destinataire || ''}
                  onChange={(e) => setCurrentReport(prev => ({ ...prev, destinataire: e.target.value }))}
                  placeholder="Ex: Dr Martin Dupont"
                />
              </div>
              <div className="form-field small">
                <label>Date consultation</label>
                <input
                  type="date"
                  value={currentReport.consultationDate || ''}
                  onChange={(e) => setCurrentReport(prev => ({ ...prev, consultationDate: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Contenu */}
          <div className="editor-section flex-grow">
            <div className="editor-header">
              <h3><FileText size={16} /> Contenu du rapport</h3>
              <button 
                className="btn-ai"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !currentReport.content?.trim()}
              >
                {isAnalyzing ? (
                  <><Loader2 size={16} className="spin" /> Analyse...</>
                ) : (
                  <><Sparkles size={16} /> Corriger avec l'IA</>
                )}
              </button>
            </div>
            
            <textarea
              className="report-textarea"
              value={currentReport.content || ''}
              onChange={(e) => {
                setCurrentReport(prev => ({ ...prev, content: e.target.value, status: 'draft' }));
                setCorrectionResult(null);
              }}
              placeholder={`Rédigez votre rapport ici...

## Anamnèse :
Décrivez l'historique et le contexte...

## Examen clinique :
Observations et tests effectués...

## Diagnostic :
Hypothèses diagnostiques...

## Traitement effectué :
Techniques utilisées...

## Conclusions :
Synthèse et recommandations...`}
            />

            {/* Résultats IA */}
            {correctionResult && (
              <div className="ai-results">
                {correctionResult.corrections.length > 0 && (
                  <div className="ai-section corrections">
                    <h4><CheckCircle2 size={14} /> Corrections appliquées</h4>
                    <ul>
                      {correctionResult.corrections.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {correctionResult.suggestions.length > 0 && (
                  <div className="ai-section suggestions">
                    <h4><Lightbulb size={14} /> Suggestions</h4>
                    <ul>
                      {correctionResult.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {correctionResult.warnings.length > 0 && (
                  <div className="ai-section warnings">
                    <h4><AlertTriangle size={14} /> Points d'attention</h4>
                    <ul>
                      {correctionResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="btn-accept" onClick={handleAcceptCorrections}>
                  <CheckCircle2 size={16} /> Appliquer les corrections
                </button>
              </div>
            )}
          </div>

          {/* Section Signature */}
          <SignatureSelector
            employeeId={typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id)}
            employeeName={`${user.prenom} ${user.nom}`}
            employeeEmail={user.email_professionnel}
            rmeRcc={userRmeRcc}
            selectedSignatureId={currentReport.signatureId}
            onSignatureChange={handleSignatureChange}
          />
        </div>

        {/* Séparateur redimensionnable */}
        <div 
          className={`resizer ${isResizing ? 'active' : ''}`}
          onMouseDown={handleMouseDown}
        >
          <div className="resizer-handle" />
        </div>

        {/* Panneau droit - Aperçu PDF (prend tout l'espace restant) */}
        <div 
          className="preview-panel" 
          onWheel={handleWheel}
        >
          <PDFPreview 
            report={currentReport}
            logoUrl="/logo-poge.png"
            zoom={pdfZoom}
            onZoomChange={setPdfZoom}
          />
        </div>
      </div>
    </div>
  );
}

