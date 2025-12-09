import { useState, useCallback } from 'react';
import { 
  FileText, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Lightbulb,
  AlertTriangle,
  Send
} from 'lucide-react';
import { correctAndAdvise, type CorrectionResult } from '../services/geminiService';
import type { Report, DEFAULT_REPORT_TEMPLATE } from '../types';

interface ReportEditorProps {
  report: Partial<Report>;
  onReportChange: (report: Partial<Report>) => void;
  onFinalize: () => void;
}

export function ReportEditor({ report, onReportChange, onFinalize }: ReportEditorProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const handleContentChange = (content: string) => {
    onReportChange({ ...report, content, status: 'draft' });
    setCorrectionResult(null);
  };

  const handleAnalyze = useCallback(async () => {
    if (!report.content?.trim()) return;
    
    setIsAnalyzing(true);
    try {
      const result = await correctAndAdvise(report.content);
      setCorrectionResult(result);
      onReportChange({
        ...report,
        correctedContent: result.correctedText,
        corrections: result.corrections,
        suggestions: result.suggestions,
        warnings: result.warnings,
        status: 'corrected'
      });
    } catch (error) {
      console.error('Erreur analyse:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [report, onReportChange]);

  const handleAcceptCorrections = () => {
    if (correctionResult) {
      onReportChange({
        ...report,
        content: correctionResult.correctedText,
        correctedContent: correctionResult.correctedText,
        status: 'corrected'
      });
    }
  };

  return (
    <div className="report-editor">
      {/* Métadonnées du rapport */}
      <div className="report-meta">
        <div className="meta-field">
          <label>Titre du rapport</label>
          <input
            type="text"
            value={report.title || ''}
            onChange={(e) => onReportChange({ ...report, title: e.target.value })}
            placeholder="Ex: Consultation lombalgies chroniques"
            className="input-field"
          />
        </div>
        
        <div className="meta-row">
          <div className="meta-field">
            <label>Initiales patient</label>
            <input
              type="text"
              value={report.patientInitials || ''}
              onChange={(e) => onReportChange({ ...report, patientInitials: e.target.value.toUpperCase() })}
              placeholder="Ex: J.D."
              className="input-field small"
              maxLength={5}
            />
          </div>
          
          <div className="meta-field">
            <label>Âge</label>
            <input
              type="number"
              value={report.patientAge || ''}
              onChange={(e) => onReportChange({ ...report, patientAge: parseInt(e.target.value) || undefined })}
              placeholder="45"
              className="input-field small"
              min={0}
              max={120}
            />
          </div>
          
          <div className="meta-field">
            <label>Date consultation</label>
            <input
              type="date"
              value={report.consultationDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => onReportChange({ ...report, consultationDate: e.target.value })}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="editor-tabs">
        <button 
          className={`tab ${activeTab === 'edit' ? 'active' : ''}`}
          onClick={() => setActiveTab('edit')}
        >
          <FileText size={16} />
          Rédaction
        </button>
        <button 
          className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
          disabled={!correctionResult}
        >
          <CheckCircle2 size={16} />
          Aperçu corrigé
        </button>
      </div>

      {/* Zone d'édition */}
      <div className="editor-content">
        {activeTab === 'edit' ? (
          <textarea
            value={report.content || ''}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder={`Rédigez votre rapport ici...

## MOTIF DE CONSULTATION
Décrivez le motif...

## ANAMNÈSE
Antécédents, contexte...

## EXAMEN CLINIQUE
Observations, tests...

## DIAGNOSTIC OSTÉOPATHIQUE
Dysfonctions identifiées...

## TRAITEMENT EFFECTUÉ
Techniques utilisées...

## ÉVOLUTION ET CONSEILS
Réaction du patient, conseils...`}
            className="editor-textarea"
          />
        ) : (
          <div className="preview-content">
            <div className="corrected-text">
              {correctionResult?.correctedText || report.content}
            </div>
          </div>
        )}
      </div>

      {/* Bouton d'analyse IA */}
      <div className="editor-actions">
        <button 
          className="btn-analyze"
          onClick={handleAnalyze}
          disabled={isAnalyzing || !report.content?.trim()}
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={18} className="spin" />
              Analyse en cours...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Corriger & Analyser avec l'IA
            </>
          )}
        </button>

        {correctionResult && (
          <button 
            className="btn-finalize"
            onClick={onFinalize}
          >
            <Send size={18} />
            Générer le PDF
          </button>
        )}
      </div>

      {/* Panel de feedback IA */}
      {correctionResult && (
        <div className="ai-feedback">
          {/* Corrections */}
          {correctionResult.corrections.length > 0 && (
            <div className="feedback-section corrections">
              <h4>
                <CheckCircle2 size={16} />
                Corrections effectuées
              </h4>
              <ul>
                {correctionResult.corrections.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <button className="btn-accept" onClick={handleAcceptCorrections}>
                Accepter les corrections
              </button>
            </div>
          )}

          {/* Suggestions */}
          {correctionResult.suggestions.length > 0 && (
            <div className="feedback-section suggestions">
              <h4>
                <Lightbulb size={16} />
                Suggestions d'amélioration
              </h4>
              <ul>
                {correctionResult.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Alertes */}
          {correctionResult.warnings.length > 0 && (
            <div className="feedback-section warnings">
              <h4>
                <AlertTriangle size={16} />
                Points d'attention
              </h4>
              <ul>
                {correctionResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

