/**
 * Page Supervision des Rapports d'Assurance - Vue Direction
 * Permet de valider, demander des corrections ou approuver les rapports
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  XCircle,
  Send,
  Eye,
  Mic,
  MicOff,
  Calendar,
  Building2,
  User,
  Clock,
  Loader2,
  RefreshCw,
  MessageSquare,
  ChevronRight,
  Play,
  Square,
  Users,
  AlertTriangle
} from 'lucide-react';
import {
  getReportsForReview,
  getReportById,
  addReviewComment,
  requestCorrection,
  approveAndAssignForSending,
  getReportHistory,
  getReceptionList,
  type InsuranceReport,
  type ReportHistoryEntry
} from '../services/insuranceReportService';
import type { TeamMember } from '../types';
import './InsuranceReportsReview.css';

interface InsuranceReportsReviewProps {
  user: TeamMember;
}

export function InsuranceReportsReview({ user }: InsuranceReportsReviewProps) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<InsuranceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<InsuranceReport | null>(null);
  const [history, setHistory] = useState<ReportHistoryEntry[]>([]);
  const [receptionStaff, setReceptionStaff] = useState<{ id: number; name: string }[]>([]);
  
  // États pour l'enregistrement vocal
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // États pour le formulaire
  const [comment, setComment] = useState('');
  const [selectedSender, setSelectedSender] = useState<number | ''>('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsData, receptionData] = await Promise.all([
        getReportsForReview(),
        getReceptionList()
      ]);
      setReports(reportsData);
      setReceptionStaff(receptionData);
    } catch (error) {
      console.error('Erreur chargement rapports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleOpenReport = async (report: InsuranceReport) => {
    const [fullReport, historyData] = await Promise.all([
      getReportById(report.id),
      getReportHistory(report.id)
    ]);
    
    if (fullReport) {
      setSelectedReport(fullReport);
      setHistory(historyData);
      setComment('');
      setAudioBlob(null);
      setAudioUrl(null);
      setSelectedSender('');
    }
  };

  // Enregistrement audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Erreur accès microphone:', error);
      alert('Impossible d\'accéder au microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const clearAudio = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  // Actions
  const handleRequestCorrection = async () => {
    if (!selectedReport || !comment.trim()) {
      alert('Veuillez ajouter un commentaire pour la demande de correction');
      return;
    }

    setActionLoading(true);
    try {
      await requestCorrection(selectedReport.id, parseInt(user.id), comment);
      setSelectedReport(null);
      loadReports();
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedReport) return;
    if (!selectedSender) {
      alert('Veuillez sélectionner un membre de l\'accueil pour l\'envoi');
      return;
    }

    setActionLoading(true);
    try {
      // Sauvegarder le commentaire si présent
      if (comment.trim()) {
        await addReviewComment(
          selectedReport.id,
          parseInt(user.id),
          comment,
          audioUrl || undefined
        );
      }

      await approveAndAssignForSending(
        selectedReport.id,
        parseInt(user.id),
        selectedSender as number
      );
      
      setSelectedReport(null);
      loadReports();
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      created: 'Rapport créé',
      assigned: 'Assigné',
      started_filling: 'Remplissage commencé',
      saved_draft: 'Brouillon sauvegardé',
      submitted: 'Soumis pour validation',
      review_comment_added: 'Commentaire ajouté',
      correction_requested: 'Correction demandée',
      approved: 'Validé',
      assigned_for_sending: 'Assigné pour envoi',
      sent: 'Envoyé',
      archived: 'Archivé'
    };
    return labels[action] || action;
  };

  return (
    <div className="insurance-reports-review">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Supervision Rapports</h1>
            <p className="subtitle">
              {reports.length} rapport{reports.length > 1 ? 's' : ''} à valider
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
            <CheckCircle size={48} />
            <h3>Tout est validé !</h3>
            <p>Aucun rapport en attente de validation.</p>
          </div>
        ) : (
          <div className="reports-grid">
            {reports.map(report => (
              <div key={report.id} className="review-card" onClick={() => handleOpenReport(report)}>
                <div className="card-header">
                  <div className="insurance-badge">
                    <Building2 size={16} />
                    {report.insurance_name || 'Assurance'}
                  </div>
                  {report.due_date && (
                    <div className="due-badge">
                      <Calendar size={14} />
                      {formatDate(report.due_date)}
                    </div>
                  )}
                </div>

                <div className="card-body">
                  <h3>{report.patient_firstname} {report.patient_lastname}</h3>
                  <p className="patient-info">
                    {report.patient_birthdate && formatDate(report.patient_birthdate)}
                    {report.reference_number && ` • Réf: ${report.reference_number}`}
                  </p>
                </div>

                <div className="card-footer">
                  <div className="osteo-info">
                    <User size={14} />
                    <span>Par {report.assigned_osteo_name}</span>
                  </div>
                  <ChevronRight size={18} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de review */}
      {selectedReport && (
        <div className="review-modal" onClick={() => !actionLoading && setSelectedReport(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <FileText size={24} />
                <div>
                  <h2>Validation du rapport</h2>
                  <p>{selectedReport.insurance_name} - {selectedReport.patient_firstname} {selectedReport.patient_lastname}</p>
                </div>
              </div>
              <button 
                className="btn-close" 
                onClick={() => setSelectedReport(null)}
                disabled={actionLoading}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Info du rapport */}
              <div className="report-info">
                <div className="info-row">
                  <span><Building2 size={14} /> Assurance</span>
                  <strong>{selectedReport.insurance_name || '-'}</strong>
                </div>
                <div className="info-row">
                  <span><User size={14} /> Patient</span>
                  <strong>{selectedReport.patient_firstname} {selectedReport.patient_lastname}</strong>
                </div>
                <div className="info-row">
                  <span><Calendar size={14} /> Date naissance</span>
                  <strong>{formatDate(selectedReport.patient_birthdate)}</strong>
                </div>
                <div className="info-row">
                  <span><FileText size={14} /> Référence</span>
                  <strong>{selectedReport.reference_number || '-'}</strong>
                </div>
                <div className="info-row">
                  <span><User size={14} /> Rempli par</span>
                  <strong>{selectedReport.assigned_osteo_name}</strong>
                </div>
              </div>

              {/* PDF Preview */}
              <div className="pdf-preview">
                <h4>Aperçu du rapport</h4>
                {selectedReport.filled_pdf || selectedReport.original_pdf ? (
                  <iframe
                    src={`data:application/pdf;base64,${selectedReport.filled_pdf || selectedReport.original_pdf}`}
                    title="Aperçu du rapport"
                  />
                ) : (
                  <div className="no-preview">
                    <FileText size={32} />
                    <p>Pas d'aperçu disponible</p>
                  </div>
                )}
              </div>

              {/* Historique */}
              <div className="history-section">
                <h4><Clock size={16} /> Historique</h4>
                <div className="history-list">
                  {history.slice(0, 5).map(entry => (
                    <div key={entry.id} className="history-item">
                      <span className="history-action">{getActionLabel(entry.action)}</span>
                      <span className="history-by">{entry.performer_name}</span>
                      <span className="history-date">{formatDateTime(entry.created_at)}</span>
                      {entry.comment && <p className="history-comment">{entry.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section avis */}
              <div className="review-section">
                <h4><MessageSquare size={16} /> Votre avis</h4>
                
                {/* Enregistrement audio */}
                <div className="audio-recorder">
                  <span className="recorder-label">Dictée vocale :</span>
                  {!audioBlob ? (
                    <button 
                      className={`btn-record ${isRecording ? 'recording' : ''}`}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {isRecording ? (
                        <>
                          <Square size={16} />
                          Arrêter
                        </>
                      ) : (
                        <>
                          <Mic size={16} />
                          Enregistrer
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="audio-playback">
                      <audio src={audioUrl || ''} controls />
                      <button className="btn-clear-audio" onClick={clearAudio}>
                        <XCircle size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Commentaire texte */}
                <textarea
                  placeholder="Ajoutez un commentaire (obligatoire pour demander une correction)..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={4}
                />

                {/* Sélection membre accueil */}
                <div className="sender-select">
                  <label>
                    <Users size={16} />
                    Attribuer l'envoi à :
                  </label>
                  <select 
                    value={selectedSender} 
                    onChange={e => setSelectedSender(e.target.value ? parseInt(e.target.value) : '')}
                  >
                    <option value="">Sélectionner un membre de l'accueil</option>
                    {receptionStaff.map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="modal-actions">
              <button 
                className="btn-secondary" 
                onClick={() => setSelectedReport(null)}
                disabled={actionLoading}
              >
                Fermer
              </button>
              <button 
                className="btn-correction"
                onClick={handleRequestCorrection}
                disabled={actionLoading || !comment.trim()}
              >
                {actionLoading ? <Loader2 size={18} className="spin" /> : <AlertTriangle size={18} />}
                Demander correction
              </button>
              <button 
                className="btn-approve"
                onClick={handleApprove}
                disabled={actionLoading || !selectedSender}
              >
                {actionLoading ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />}
                Valider et envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InsuranceReportsReview;

