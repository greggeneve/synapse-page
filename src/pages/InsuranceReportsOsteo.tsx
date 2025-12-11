/**
 * Page Rapports d'Assurance - Vue Ostéopathe
 * Permet de voir, remplir et soumettre les rapports d'assurance
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Send,
  Eye,
  Edit3,
  Calendar,
  Building2,
  User,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import {
  getOsteoReports,
  getReportById,
  startFilling,
  submitForReview,
  getReportAnnotations,
  saveAnnotations,
  type InsuranceReport,
  type ReportAnnotation
} from '../services/insuranceReportService';
import type { TeamMember } from '../types';
import './InsuranceReportsOsteo.css';

interface InsuranceReportsOsteoProps {
  user: TeamMember;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  assigned: { label: 'À remplir', color: '#3b82f6', icon: <FileText size={14} /> },
  in_progress: { label: 'En cours', color: '#f59e0b', icon: <Edit3 size={14} /> },
  needs_correction: { label: 'À corriger', color: '#ef4444', icon: <AlertTriangle size={14} /> },
  submitted_for_review: { label: 'En validation', color: '#8b5cf6', icon: <Clock size={14} /> }
};

export function InsuranceReportsOsteo({ user }: InsuranceReportsOsteoProps) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<InsuranceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<InsuranceReport | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOsteoReports(parseInt(user.id));
      setReports(data);
    } catch (error) {
      console.error('Erreur chargement rapports:', error);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleOpenReport = async (report: InsuranceReport) => {
    // Charger le rapport complet avec le PDF
    const fullReport = await getReportById(report.id);
    if (fullReport) {
      setSelectedReport(fullReport);
      
      // Si le rapport est "assigned", le passer en "in_progress"
      if (fullReport.status === 'assigned') {
        await startFilling(fullReport.id, parseInt(user.id));
        loadReports();
      }
    }
  };

  const handleEditReport = () => {
    if (selectedReport) {
      // Naviguer vers l'éditeur PDF
      navigate(`/pro/insurance-reports/${selectedReport.id}/edit`);
    }
  };

  const handleSubmitForReview = async () => {
    if (!selectedReport) return;
    
    const result = await submitForReview(selectedReport.id, parseInt(user.id));
    if (result.success) {
      setSelectedReport(null);
      loadReports();
    }
  };

  const getUrgencyClass = (dueDate?: string): string => {
    if (!dueDate) return '';
    const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'overdue';
    if (days <= 3) return 'urgent';
    if (days <= 7) return 'soon';
    return '';
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const needsCorrectionReports = reports.filter(r => r.status === 'needs_correction');
  const inProgressReports = reports.filter(r => r.status === 'in_progress');
  const assignedReports = reports.filter(r => r.status === 'assigned');

  return (
    <div className="insurance-reports-osteo">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Rapports d'Assurance</h1>
            <p className="subtitle">
              {reports.length} rapport{reports.length > 1 ? 's' : ''} à traiter
            </p>
          </div>
        </div>
        <button className="btn-refresh" onClick={loadReports} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          Actualiser
        </button>
      </header>

      {/* Contenu */}
      <div className="page-content">
        {loading ? (
          <div className="loading-state">
            <Loader2 size={40} className="spin" />
            <p>Chargement des rapports...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>Aucun rapport à traiter</h3>
            <p>Vous n'avez pas de rapport d'assurance en attente.</p>
          </div>
        ) : (
          <div className="reports-sections">
            {/* Section: À corriger (prioritaire) */}
            {needsCorrectionReports.length > 0 && (
              <section className="reports-section urgent">
                <div className="section-header">
                  <AlertTriangle size={20} />
                  <h2>À corriger</h2>
                  <span className="count">{needsCorrectionReports.length}</span>
                </div>
                <div className="reports-list">
                  {needsCorrectionReports.map(report => (
                    <ReportCard 
                      key={report.id} 
                      report={report}
                      onOpen={() => handleOpenReport(report)}
                      getUrgencyClass={getUrgencyClass}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section: En cours */}
            {inProgressReports.length > 0 && (
              <section className="reports-section in-progress">
                <div className="section-header">
                  <Edit3 size={20} />
                  <h2>En cours</h2>
                  <span className="count">{inProgressReports.length}</span>
                </div>
                <div className="reports-list">
                  {inProgressReports.map(report => (
                    <ReportCard 
                      key={report.id} 
                      report={report}
                      onOpen={() => handleOpenReport(report)}
                      getUrgencyClass={getUrgencyClass}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section: À remplir */}
            {assignedReports.length > 0 && (
              <section className="reports-section assigned">
                <div className="section-header">
                  <FileText size={20} />
                  <h2>À remplir</h2>
                  <span className="count">{assignedReports.length}</span>
                </div>
                <div className="reports-list">
                  {assignedReports.map(report => (
                    <ReportCard 
                      key={report.id} 
                      report={report}
                      onOpen={() => handleOpenReport(report)}
                      getUrgencyClass={getUrgencyClass}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Modal de prévisualisation - Fenêtre redimensionnable */}
      {selectedReport && (
        <div 
          className="report-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setSelectedReport(null)}
        >
          <div 
            className="modal-content" 
            onClick={e => e.stopPropagation()}
            style={{
              width: '90vw',
              height: '90vh',
              minWidth: '600px',
              minHeight: '400px',
              maxWidth: '100vw',
              maxHeight: '100vh',
              background: 'white',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              resize: 'both',
              boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
            }}
          >
            <div className="modal-header">
              <div className="modal-title">
                <FileText size={24} />
                <div>
                  <h2>{selectedReport.insurance_name || 'Rapport d\'assurance'}</h2>
                  <p>
                    {selectedReport.patient_firstname} {selectedReport.patient_lastname}
                    {selectedReport.patient_birthdate && ` • ${formatDate(selectedReport.patient_birthdate)}`}
                  </p>
                </div>
              </div>
              <button className="btn-close" onClick={() => setSelectedReport(null)}>×</button>
            </div>

            {/* Layout 2 colonnes */}
            <div 
              className="modal-body-split"
              style={{
                display: 'flex',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden'
              }}
            >
              {/* Colonne gauche : Infos + Séances du patient */}
              <div 
                className="modal-left-panel"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: '1px solid #e2e8f0',
                  overflowY: 'auto',
                  background: '#f8fafc'
                }}
              >
                {/* Info du rapport */}
                <div className="modal-info">
                  <div className="info-grid">
                    <div className="info-item">
                      <Building2 size={16} />
                      <span>Assurance</span>
                      <strong>{selectedReport.insurance_name || 'Non spécifié'}</strong>
                    </div>
                    <div className="info-item">
                      <User size={16} />
                      <span>Patient</span>
                      <strong>
                        {selectedReport.patient_firstname} {selectedReport.patient_lastname}
                      </strong>
                    </div>
                    <div className="info-item">
                      <Calendar size={16} />
                      <span>Date limite</span>
                      <strong className={getUrgencyClass(selectedReport.due_date)}>
                        {formatDate(selectedReport.due_date)}
                      </strong>
                    </div>
                    <div className="info-item">
                      <FileText size={16} />
                      <span>Référence</span>
                      <strong>{selectedReport.reference_number || '-'}</strong>
                    </div>
                  </div>

                  {/* Commentaire de review si existe */}
                  {selectedReport.review_comment && (
                    <div className="review-comment">
                      <AlertCircle size={16} />
                      <div>
                        <strong>Commentaire de la direction :</strong>
                        <p>{selectedReport.review_comment}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Séances du patient */}
                <div className="patient-sessions">
                  <h3>
                    <Clock size={18} />
                    Séances concernées
                  </h3>
                  
                  {/* Placeholder - sera rempli automatiquement plus tard */}
                  <div className="sessions-placeholder">
                    <Calendar size={40} />
                    <p>Les séances du patient seront affichées ici automatiquement</p>
                    <small>Dates de traitement : {selectedReport.treatment_dates || 'Non renseignées'}</small>
                  </div>

                  {/* Exemple de ce que ça donnera une fois intégré */}
                  {/*
                  <div className="sessions-list">
                    <div className="session-item">
                      <div className="session-date">
                        <Calendar size={14} />
                        12 décembre 2025
                      </div>
                      <div className="session-details">
                        Consultation ostéopathie - 45min
                      </div>
                    </div>
                  </div>
                  */}
                </div>
              </div>

              {/* Colonne droite : PDF plein écran */}
              {/* PDF avec zoom contrôlable */}
              <div 
                className="modal-pdf"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#374151',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {selectedReport.original_pdf ? (
                  <iframe
                    src={`data:application/pdf;base64,${selectedReport.original_pdf}`}
                    title="Aperçu du rapport"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      flex: 1
                    }}
                  />
                ) : (
                  <div className="no-preview" style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af'
                  }}>
                    <FileText size={48} />
                    <p>Aperçu non disponible</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSelectedReport(null)}>
                Fermer
              </button>
              <button className="btn-primary" onClick={handleEditReport}>
                <Edit3 size={18} />
                Remplir le rapport
              </button>
              {(selectedReport.status === 'in_progress' || selectedReport.status === 'needs_correction') && (
                <button className="btn-submit" onClick={handleSubmitForReview}>
                  <Send size={18} />
                  Soumettre pour validation
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Composant carte de rapport
interface ReportCardProps {
  report: InsuranceReport;
  onOpen: () => void;
  getUrgencyClass: (date?: string) => string;
  formatDate: (date?: string) => string;
}

function ReportCard({ report, onOpen, getUrgencyClass, formatDate }: ReportCardProps) {
  const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.assigned;
  const urgencyClass = getUrgencyClass(report.due_date);

  return (
    <div className={`report-card ${urgencyClass}`} onClick={onOpen}>
      <div className="card-status" style={{ background: statusConfig.color }}>
        {statusConfig.icon}
        <span>{statusConfig.label}</span>
      </div>
      
      <div className="card-content">
        <div className="card-header">
          <h3>{report.insurance_name || 'Assurance non identifiée'}</h3>
          {report.reference_number && (
            <span className="reference">Réf: {report.reference_number}</span>
          )}
        </div>
        
        <div className="card-patient">
          <User size={14} />
          <span>
            {report.patient_firstname} {report.patient_lastname}
            {report.patient_birthdate && ` • ${formatDate(report.patient_birthdate)}`}
          </span>
        </div>

        <div className="card-meta">
          <div className={`due-date ${urgencyClass}`}>
            <Calendar size={14} />
            <span>
              {report.due_date 
                ? `Échéance: ${formatDate(report.due_date)}`
                : 'Pas d\'échéance'
              }
            </span>
          </div>
          {report.annotation_count && report.annotation_count > 0 && (
            <div className="annotations">
              <Edit3 size={14} />
              <span>{report.annotation_count} annotations</span>
            </div>
          )}
        </div>

        {report.status === 'needs_correction' && report.review_comment && (
          <div className="correction-hint">
            <AlertTriangle size={14} />
            <span>Corrections demandées</span>
          </div>
        )}
      </div>

      <ChevronRight size={20} className="card-arrow" />
    </div>
  );
}

export default InsuranceReportsOsteo;

