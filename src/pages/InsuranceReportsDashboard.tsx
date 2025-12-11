/**
 * Tableau de bord des Rapports d'Assurance
 * Vision d'ensemble pour Direction et Personnel Administratif
 * Classement par ancienneté, alertes de délai
 */

import { useState, useEffect, useCallback } from 'react';
import './InsuranceReportsDashboard.css';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Upload,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  User,
  Building2,
  Calendar,
  ChevronRight,
  Loader2,
  RefreshCw,
  Filter,
  Eye,
  Send,
  X,
  Sparkles,
  UserCheck,
  Bell,
  Trash2
} from 'lucide-react';
import {
  createInsuranceReport,
  assignToOsteo,
  getOsteoList,
  type InsuranceReport,
  type ReportStatus
} from '../services/insuranceReportService';
import {
  analyzeAndPrepareReport
} from '../services/insuranceReportAIService';
import { query } from '../services/mariadb';
import type { TeamMember } from '../types';
import './InsuranceReportsDashboard.css';

interface InsuranceReportsDashboardProps {
  user: TeamMember;
}

interface ReportWithDays extends InsuranceReport {
  days_since_received: number;
  urgency_level: 'normal' | 'warning' | 'critical' | 'overdue';
}

// Calcul du niveau d'urgence
function getUrgencyLevel(days: number): 'normal' | 'warning' | 'critical' | 'overdue' {
  if (days > 15) return 'overdue';
  if (days > 10) return 'critical';
  if (days > 7) return 'warning';
  return 'normal';
}

// Labels des statuts
const STATUS_LABELS: Record<ReportStatus, string> = {
  pending_assignment: 'À attribuer',
  assigned: 'Assigné',
  in_progress: 'En cours',
  submitted_for_review: 'En validation',
  needs_correction: 'À corriger',
  approved: 'Validé',
  ready_to_send: 'À envoyer',
  sent: 'Envoyé',
  archived: 'Archivé'
};

export function InsuranceReportsDashboard({ user }: InsuranceReportsDashboardProps) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportWithDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue'>('all');
  const [osteoFilter, setOsteoFilter] = useState<number | 'all'>('all');
  const [osteoList, setOsteoList] = useState<{ id: number; name: string; pending_reports: number }[]>([]);
  
  // États pour l'upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<{
    file: string;
    success: boolean;
    message: string;
    osteoName?: string;
    details?: string;
  }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Charger tous les rapports avec calcul des jours
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      // Charger les rapports actifs (non archivés)
      const result = await query<any>(`
        SELECT 
          ir.*,
          DATEDIFF(CURRENT_DATE, COALESCE(ir.received_date, ir.created_at)) AS days_since_received,
          JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) AS osteo_prenom,
          JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom')) AS osteo_nom
        FROM insurance_reports ir
        LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
        WHERE ir.status NOT IN ('sent', 'archived')
        ORDER BY 
          CASE ir.status 
            WHEN 'needs_correction' THEN 1
            WHEN 'pending_assignment' THEN 2
            WHEN 'assigned' THEN 3
            WHEN 'in_progress' THEN 4
            ELSE 5
          END,
          days_since_received DESC,
          ir.created_at ASC
      `);

      const reportsData: ReportWithDays[] = (result.data || []).map((row: any) => ({
        ...row,
        days_since_received: row.days_since_received || 0,
        urgency_level: getUrgencyLevel(row.days_since_received || 0),
        assigned_osteo_name: row.osteo_prenom && row.osteo_nom 
          ? `${row.osteo_prenom} ${row.osteo_nom}`
          : undefined,
        ai_extraction_data: row.ai_extraction_data 
          ? (typeof row.ai_extraction_data === 'string' 
              ? JSON.parse(row.ai_extraction_data) 
              : row.ai_extraction_data)
          : undefined
      }));

      setReports(reportsData);
      
      // Charger la liste des ostéos
      const osteos = await getOsteoList();
      setOsteoList(osteos);
      
    } catch (error) {
      console.error('Erreur chargement rapports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Supprimer un rapport
  const deleteReport = async (reportId: number) => {
    try {
      const result = await query(`DELETE FROM insurance_reports WHERE id = ?`, [reportId]);
      if (result.success) {
        setReports(prev => prev.filter(r => r.id !== reportId));
      } else {
        alert('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Re-analyser un rapport avec l'IA
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  
  const reanalyzeReport = async (reportId: number) => {
    setAnalyzingId(reportId);
    try {
      // Récupérer le PDF du rapport
      const pdfResult = await query<any>(`
        SELECT original_pdf FROM insurance_reports WHERE id = ?
      `, [reportId]);
      
      if (!pdfResult.success || !pdfResult.data?.[0]?.original_pdf) {
        alert('PDF non trouvé');
        return;
      }
      
      const pdfBase64 = pdfResult.data[0].original_pdf;
      
      console.log('[ReAnalyze] Début analyse IA pour rapport', reportId);
      
      // Analyser avec l'IA
      const analysis = await analyzeAndPrepareReport(pdfBase64);
      
      console.log('[ReAnalyze] Résultat:', analysis);
      
      if (analysis.extraction) {
        // Parser le nom du patient
        let patientFirstname = null;
        let patientLastname = null;
        if (analysis.extraction.detected_patient_name) {
          const parts = analysis.extraction.detected_patient_name.trim().split(' ');
          patientFirstname = parts[0] || null;
          patientLastname = parts.slice(1).join(' ') || null;
        }
        
        // Mettre à jour le rapport
        const updateResult = await query(`
          UPDATE insurance_reports SET
            patient_firstname = COALESCE(?, patient_firstname),
            patient_lastname = COALESCE(?, patient_lastname),
            patient_birthdate = COALESCE(?, patient_birthdate),
            insurance_name = COALESCE(?, insurance_name),
            reference_number = COALESCE(?, reference_number),
            ai_extraction_data = ?,
            ai_confidence_score = 0.8
          WHERE id = ?
        `, [
          patientFirstname,
          patientLastname,
          analysis.extraction.detected_patient_birthdate || null,
          analysis.extraction.detected_insurance || null,
          analysis.extraction.detected_reference || null,
          JSON.stringify(analysis.extraction),
          reportId
        ]);
        
        if (updateResult.success) {
          // Si un ostéo a été suggéré, l'assigner
          if (analysis.suggested_osteo_id) {
            await assignToOsteo(reportId, analysis.suggested_osteo_id, parseInt(user.id));
          }
          
          alert(`✅ Analyse terminée !\n\nPatient: ${analysis.extraction.detected_patient_name || 'Non détecté'}\nAssurance: ${analysis.extraction.detected_insurance || 'Non détectée'}\nOstéo: ${analysis.extraction.detected_osteo_name || 'Non détecté'}`);
          
          // Recharger les rapports
          loadReports();
        } else {
          alert('Erreur lors de la mise à jour');
        }
      } else {
        alert('⚠️ L\'IA n\'a pas pu extraire d\'informations de ce document.');
      }
    } catch (error: any) {
      console.error('[ReAnalyze] Erreur:', error);
      alert(`Erreur d'analyse: ${error.message}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  // Filtrer les rapports
  const filteredReports = reports.filter(report => {
    // Filtre par statut
    if (filter === 'pending') {
      if (!['pending_assignment', 'assigned', 'in_progress', 'needs_correction'].includes(report.status)) {
        return false;
      }
    }
    if (filter === 'overdue') {
      if (report.days_since_received <= 10) return false;
    }
    
    // Filtre par ostéo
    if (osteoFilter !== 'all') {
      if (report.assigned_osteo_id !== osteoFilter) return false;
    }
    
    return true;
  });

  // Statistiques
  const stats = {
    total: reports.length,
    pending: reports.filter(r => ['pending_assignment', 'assigned', 'in_progress'].includes(r.status)).length,
    overdue: reports.filter(r => r.days_since_received > 10).length,
    critical: reports.filter(r => r.days_since_received > 15).length,
    needsCorrection: reports.filter(r => r.status === 'needs_correction').length
  };

  // Upload de fichiers
  const handleFileSelect = async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(f => 
      f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    setUploadFiles(pdfFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const processUpload = async () => {
    if (uploadFiles.length === 0) return;

    for (const file of uploadFiles) {
      setUploadingFile(file.name);

      try {
        // Convertir en base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Essayer d'analyser avec l'IA (optionnel)
        let analysis: { extraction?: any; suggested_osteo_id?: number; suggested_osteo_name?: string } = {};
        let aiStatus = 'non disponible';
        try {
          console.log('[Upload] Début analyse IA...');
          analysis = await analyzeAndPrepareReport(base64);
          console.log('[Upload] Résultat analyse IA:', analysis);
          
          if (analysis.extraction) {
            aiStatus = 'OK';
            console.log('[Upload] ✅ Extraction IA:', {
              patient: analysis.extraction.detected_patient_name,
              insurance: analysis.extraction.detected_insurance,
              osteo: analysis.extraction.detected_osteo_name,
              birthdate: analysis.extraction.detected_patient_birthdate
            });
          }
        } catch (aiError: any) {
          console.warn('[Upload] Analyse IA échouée:', aiError.message);
          aiStatus = aiError.message;
        }
        
        // Créer le rapport
        const createResult = await createInsuranceReport({
          original_pdf: base64,
          original_filename: file.name,
          ai_extraction: analysis.extraction,
          uploaded_by: parseInt(user.id)
        });

        if (createResult.success && createResult.id) {
          // Construire le message de résultat avec les infos IA
          const extractedInfo = analysis.extraction ? [
            analysis.extraction.detected_patient_name && `Patient: ${analysis.extraction.detected_patient_name}`,
            analysis.extraction.detected_insurance && `Assurance: ${analysis.extraction.detected_insurance}`,
            analysis.extraction.detected_osteo_name && `Ostéo: ${analysis.extraction.detected_osteo_name}`
          ].filter(Boolean).join(' | ') : '';

          // Si un ostéo a été suggéré par l'IA, l'assigner automatiquement
          if (analysis.suggested_osteo_id) {
            await assignToOsteo(createResult.id, analysis.suggested_osteo_id, parseInt(user.id));
            
            setUploadResults(prev => [...prev, {
              file: file.name,
              success: true,
              message: `✅ Assigné automatiquement`,
              osteoName: analysis.suggested_osteo_name,
              details: extractedInfo
            }]);
          } else {
            setUploadResults(prev => [...prev, {
              file: file.name,
              success: true,
              message: analysis.extraction ? '✅ Créé' : '⚠️ Créé (sans IA)',
              details: extractedInfo || `IA: ${aiStatus}`
            }]);
          }
        } else {
          // Erreur de création - probablement table SQL manquante
          const errorMsg = createResult.error || 'Erreur création';
          if (errorMsg.includes("doesn't exist") || errorMsg.includes('Table')) {
            throw new Error('Tables SQL non créées. Exécutez le script data/create_insurance_reports_tables.sql');
          }
          throw new Error(errorMsg);
        }

      } catch (error: any) {
        console.error('[Upload] Erreur:', error);
        setUploadResults(prev => [...prev, {
          file: file.name,
          success: false,
          message: error.message || 'Erreur lors de la création'
        }]);
      }
    }

    setUploadingFile(null);
    setUploadFiles([]);
    loadReports();
  };

  const closeUploadModal = () => {
    setShowUpload(false);
    setUploadFiles([]);
    setUploadResults([]);
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="insurance-reports-dashboard">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Rapports d'Assurance</h1>
            <p className="subtitle">Suivi et gestion des formulaires</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-upload" onClick={() => setShowUpload(true)}>
            <Upload size={18} />
            Déposer un document
          </button>
          <button className="btn-refresh" onClick={loadReports} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* Statistiques */}
      <div className="stats-bar">
        <div className="stat-card">
          <FileText size={20} />
          <div>
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total actifs</span>
          </div>
        </div>
        <div className="stat-card pending" onClick={() => setFilter('pending')}>
          <Clock size={20} />
          <div>
            <span className="stat-value">{stats.pending}</span>
            <span className="stat-label">En attente</span>
          </div>
        </div>
        <div className="stat-card warning" onClick={() => setFilter('overdue')}>
          <AlertTriangle size={20} />
          <div>
            <span className="stat-value">{stats.overdue}</span>
            <span className="stat-label">&gt; 10 jours</span>
          </div>
        </div>
        <div className="stat-card critical">
          <AlertCircle size={20} />
          <div>
            <span className="stat-value">{stats.critical}</span>
            <span className="stat-label">&gt; 15 jours</span>
          </div>
        </div>
        {stats.needsCorrection > 0 && (
          <div className="stat-card correction">
            <Bell size={20} />
            <div>
              <span className="stat-value">{stats.needsCorrection}</span>
              <span className="stat-label">À corriger</span>
            </div>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="filters-bar">
        <div className="filter-group">
          <Filter size={16} />
          <select value={filter} onChange={e => setFilter(e.target.value as any)}>
            <option value="all">Tous les rapports</option>
            <option value="pending">En attente de traitement</option>
            <option value="overdue">En retard (&gt;10 jours)</option>
          </select>
        </div>
        <div className="filter-group">
          <User size={16} />
          <select 
            value={osteoFilter} 
            onChange={e => setOsteoFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
          >
            <option value="all">Tous les ostéopathes</option>
            {osteoList.map(osteo => (
              <option key={osteo.id} value={osteo.id}>
                {osteo.name} ({osteo.pending_reports})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste des rapports */}
      <div className="reports-content">
        {loading ? (
          <div className="loading-state">
            <Loader2 size={40} className="spin" />
            <p>Chargement...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} />
            <h3>Aucun rapport</h3>
            <p>
              {filter !== 'all' 
                ? 'Aucun rapport ne correspond aux filtres sélectionnés.'
                : 'Aucun rapport d\'assurance en cours.'}
            </p>
          </div>
        ) : (
          <div className="reports-table">
            <div className="table-header">
              <div className="col-days">Délai</div>
              <div className="col-patient">Patient</div>
              <div className="col-insurance">Assurance</div>
              <div className="col-treatment">Dates traitement</div>
              <div className="col-osteo">Ostéopathe</div>
              <div className="col-status">Statut</div>
              <div className="col-date">Reçu le</div>
              <div className="col-actions"></div>
            </div>
            
            {filteredReports.map(report => (
              <div 
                key={report.id} 
                className={`table-row ${report.urgency_level}`}
              >
                {/* Pastille délai */}
                <div className="col-days">
                  <div className={`days-badge ${report.urgency_level}`}>
                    {report.days_since_received}j
                    {report.urgency_level === 'overdue' && <AlertCircle size={12} />}
                    {report.urgency_level === 'critical' && <AlertTriangle size={12} />}
                  </div>
                </div>

                {/* Patient */}
                <div className="col-patient">
                  <strong>
                    {report.patient_firstname} {report.patient_lastname}
                  </strong>
                  {report.patient_birthdate && (
                    <span className="birth-date">{formatDate(report.patient_birthdate)}</span>
                  )}
                </div>

                {/* Assurance */}
                <div className="col-insurance">
                  <span className="insurance-name">
                    {report.insurance_name || 'Non identifiée'}
                  </span>
                  {report.reference_number && (
                    <span className="reference">Réf: {report.reference_number}</span>
                  )}
                </div>

                {/* Dates traitement */}
                <div className="col-treatment">
                  <span className="treatment-dates">
                    {report.treatment_dates || '-'}
                  </span>
                </div>

                {/* Ostéopathe */}
                <div className="col-osteo">
                  {report.assigned_osteo_name ? (
                    <span className="osteo-name">{report.assigned_osteo_name}</span>
                  ) : (
                    <span className="not-assigned">Non attribué</span>
                  )}
                </div>

                {/* Statut */}
                <div className="col-status">
                  <span className={`status-badge ${report.status}`}>
                    {STATUS_LABELS[report.status]}
                  </span>
                </div>

                {/* Date */}
                <div className="col-date">
                  {formatDate(report.received_date || report.created_at)}
                </div>

                {/* Actions */}
                <div className="col-actions">
                  <button 
                    className="btn-view"
                    onClick={() => navigate(`/insurance-report/${report.id}`)}
                    title="Voir détails"
                  >
                    <Eye size={16} />
                  </button>
                  <button 
                    className={`btn-reanalyze ${analyzingId === report.id ? 'analyzing' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (analyzingId === null) reanalyzeReport(report.id);
                    }}
                    disabled={analyzingId !== null}
                    title="Re-analyser avec l'IA"
                  >
                    {analyzingId === report.id ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                  </button>
                  <button 
                    className="btn-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Supprimer le rapport ${report.patient_firstname || ''} ${report.patient_lastname || 'sans nom'} ?`)) {
                        deleteReport(report.id);
                      }
                    }}
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Upload */}
      {showUpload && (
        <div className="upload-modal" onClick={closeUploadModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <Upload size={24} />
              <h2>Déposer un document</h2>
              <button className="btn-close" onClick={closeUploadModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Zone de drop */}
              {uploadFiles.length === 0 && uploadResults.length === 0 && (
                <div 
                  className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf,image/*"
                    multiple
                    onChange={e => handleFileSelect(e.target.files || [])}
                    style={{ display: 'none' }}
                  />
                  <FileText size={40} />
                  <h3>Déposez vos fichiers ici</h3>
                  <p>ou cliquez pour sélectionner</p>
                  <span className="hint">PDF ou images scannées</span>
                </div>
              )}

              {/* Fichiers sélectionnés */}
              {uploadFiles.length > 0 && (
                <div className="selected-files">
                  <h3>{uploadFiles.length} fichier{uploadFiles.length > 1 ? 's' : ''} sélectionné{uploadFiles.length > 1 ? 's' : ''}</h3>
                  <div className="files-list">
                    {uploadFiles.map((file, i) => (
                      <div key={i} className="file-item">
                        <FileText size={16} />
                        <span>{file.name}</span>
                        {uploadingFile === file.name && (
                          <Loader2 size={16} className="spin" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="ai-notice">
                    <Sparkles size={16} />
                    <span>L'IA va analyser et attribuer automatiquement les rapports</span>
                  </div>
                  <button 
                    className="btn-process"
                    onClick={processUpload}
                    disabled={!!uploadingFile}
                  >
                    {uploadingFile ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        Analyse en cours...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Traiter {uploadFiles.length > 1 ? 'les fichiers' : 'le fichier'}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Résultats */}
              {uploadResults.length > 0 && (
                <div className="upload-results">
                  <h3>Résultats</h3>
                  {uploadResults.map((result, i) => (
                    <div key={i} className={`result-item ${result.success ? 'success' : 'error'}`}>
                      {result.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                      <div className="result-content">
                        <strong>{result.file}</strong>
                        <span className="result-message">
                          {result.message}
                          {result.osteoName && ` à ${result.osteoName}`}
                        </span>
                        {result.details && (
                          <span className="result-details">{result.details}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="upload-actions">
                    <button className="btn-retry" onClick={() => setUploadResults([])}>
                      <RefreshCw size={16} />
                      Réessayer
                    </button>
                    <button className="btn-done" onClick={closeUploadModal}>
                      Terminé
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InsuranceReportsDashboard;

