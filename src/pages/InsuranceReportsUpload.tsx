/**
 * Page Upload des Rapports d'Assurance - Vue Accueil
 * Zone de dépôt avec reconnaissance IA automatique
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  Building2,
  User,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  UserCheck,
  ChevronDown,
  Send
} from 'lucide-react';
import {
  createInsuranceReport,
  assignToOsteo,
  getOsteoList,
  getPendingAssignmentReports,
  type InsuranceReport
} from '../services/insuranceReportService';
import {
  analyzeAndPrepareReport,
  type AIExtractionData
} from '../services/insuranceReportAIService';
import type { TeamMember } from '../types';
import './InsuranceReportsUpload.css';

interface InsuranceReportsUploadProps {
  user: TeamMember;
}

interface UploadedReport {
  id?: number;
  file: File;
  base64: string;
  status: 'analyzing' | 'ready' | 'uploading' | 'done' | 'error';
  extraction?: AIExtractionData;
  suggestedOsteoId?: number;
  suggestedOsteoName?: string;
  selectedOsteoId?: number;
  error?: string;
}

export function InsuranceReportsUpload({ user }: InsuranceReportsUploadProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploads, setUploads] = useState<UploadedReport[]>([]);
  const [osteoList, setOsteoList] = useState<{ id: number; name: string; pending_reports: number }[]>([]);
  const [pendingReports, setPendingReports] = useState<InsuranceReport[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingOsteos, setIsLoadingOsteos] = useState(false);

  // Charger la liste des ostéos
  const loadOsteoList = useCallback(async () => {
    if (osteoList.length > 0) return;
    setIsLoadingOsteos(true);
    try {
      const list = await getOsteoList();
      setOsteoList(list);
    } finally {
      setIsLoadingOsteos(false);
    }
  }, [osteoList.length]);

  // Charger les rapports en attente
  const loadPendingReports = async () => {
    const reports = await getPendingAssignmentReports();
    setPendingReports(reports);
  };

  // Convertir fichier en base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Retirer le préfixe data:...
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Gérer le drop de fichiers
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    
    if (files.length === 0) return;
    
    await loadOsteoList();
    processFiles(files);
  }, [loadOsteoList]);

  // Gérer la sélection de fichiers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    await loadOsteoList();
    processFiles(files);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Traiter les fichiers uploadés
  const processFiles = async (files: File[]) => {
    for (const file of files) {
      const uploadId = Date.now() + Math.random();
      
      // Ajouter à la liste avec statut "analyzing"
      setUploads(prev => [...prev, {
        file,
        base64: '',
        status: 'analyzing'
      }]);

      try {
        // Convertir en base64
        const base64 = await fileToBase64(file);
        
        // Mettre à jour avec le base64
        setUploads(prev => prev.map(u => 
          u.file === file ? { ...u, base64 } : u
        ));

        // Analyser avec l'IA
        const analysis = await analyzeAndPrepareReport(base64);
        
        setUploads(prev => prev.map(u => 
          u.file === file ? {
            ...u,
            status: 'ready',
            extraction: analysis.extraction,
            suggestedOsteoId: analysis.suggested_osteo_id,
            suggestedOsteoName: analysis.suggested_osteo_name,
            selectedOsteoId: analysis.suggested_osteo_id
          } : u
        ));

      } catch (error: any) {
        setUploads(prev => prev.map(u => 
          u.file === file ? {
            ...u,
            status: 'error',
            error: error.message || 'Erreur lors de l\'analyse'
          } : u
        ));
      }
    }
  };

  // Mettre à jour l'ostéo sélectionné
  const updateSelectedOsteo = (fileIndex: number, osteoId: number) => {
    setUploads(prev => prev.map((u, i) => 
      i === fileIndex ? { ...u, selectedOsteoId: osteoId } : u
    ));
  };

  // Soumettre un rapport
  const submitReport = async (upload: UploadedReport, index: number) => {
    if (!upload.selectedOsteoId) {
      alert('Veuillez sélectionner un ostéopathe');
      return;
    }

    setUploads(prev => prev.map((u, i) => 
      i === index ? { ...u, status: 'uploading' } : u
    ));

    try {
      // Créer le rapport
      const result = await createInsuranceReport({
        original_pdf: upload.base64,
        original_filename: upload.file.name,
        ai_extraction: upload.extraction,
        uploaded_by: parseInt(user.id)
      });

      if (result.success && result.id) {
        // Assigner à l'ostéo
        await assignToOsteo(result.id, upload.selectedOsteoId!, parseInt(user.id));

        setUploads(prev => prev.map((u, i) => 
          i === index ? { ...u, status: 'done', id: result.id } : u
        ));
      } else {
        throw new Error(result.error || 'Erreur lors de la création');
      }

    } catch (error: any) {
      setUploads(prev => prev.map((u, i) => 
        i === index ? { ...u, status: 'error', error: error.message } : u
      ));
    }
  };

  // Supprimer un upload
  const removeUpload = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index));
  };

  // Soumettre tous les rapports prêts
  const submitAllReady = async () => {
    const readyUploads = uploads.filter(u => u.status === 'ready' && u.selectedOsteoId);
    for (let i = 0; i < uploads.length; i++) {
      if (uploads[i].status === 'ready' && uploads[i].selectedOsteoId) {
        await submitReport(uploads[i], i);
      }
    }
  };

  const readyCount = uploads.filter(u => u.status === 'ready' && u.selectedOsteoId).length;
  const doneCount = uploads.filter(u => u.status === 'done').length;

  return (
    <div className="insurance-reports-upload">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Dépôt Rapports d'Assurance</h1>
            <p className="subtitle">Scannez et attribuez les formulaires aux ostéopathes</p>
          </div>
        </div>
        {readyCount > 0 && (
          <button className="btn-submit-all" onClick={submitAllReady}>
            <Send size={18} />
            Envoyer {readyCount} rapport{readyCount > 1 ? 's' : ''}
          </button>
        )}
      </header>

      {/* Zone de dépôt */}
      <div className="page-content">
        <div 
          className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className="drop-icon">
            <Upload size={40} />
          </div>
          <h3>Déposez vos fichiers ici</h3>
          <p>ou cliquez pour sélectionner</p>
          <span className="formats">PDF ou images (JPG, PNG)</span>
        </div>

        {/* Liste des uploads */}
        {uploads.length > 0 && (
          <div className="uploads-list">
            <div className="uploads-header">
              <h2>Documents en cours ({uploads.length})</h2>
              {doneCount > 0 && (
                <span className="done-badge">
                  <CheckCircle size={14} />
                  {doneCount} envoyé{doneCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {uploads.map((upload, index) => (
              <div key={index} className={`upload-card ${upload.status}`}>
                {/* Header de la carte */}
                <div className="card-header">
                  <div className="file-info">
                    <FileText size={20} />
                    <span className="filename">{upload.file.name}</span>
                  </div>
                  {upload.status !== 'done' && (
                    <button className="btn-remove" onClick={() => removeUpload(index)}>
                      <X size={18} />
                    </button>
                  )}
                </div>

                {/* Contenu selon le statut */}
                {upload.status === 'analyzing' && (
                  <div className="card-analyzing">
                    <Loader2 size={24} className="spin" />
                    <div>
                      <p className="analyzing-title">Analyse en cours...</p>
                      <p className="analyzing-subtitle">L'IA extrait les informations du document</p>
                    </div>
                  </div>
                )}

                {upload.status === 'ready' && upload.extraction && (
                  <div className="card-ready">
                    {/* Données extraites */}
                    <div className="extraction-data">
                      <div className="ai-badge">
                        <Sparkles size={14} />
                        Détecté par IA
                      </div>
                      
                      <div className="data-grid">
                        {upload.extraction.detected_insurance && (
                          <div className="data-item">
                            <Building2 size={14} />
                            <span>Assurance</span>
                            <strong>{upload.extraction.detected_insurance}</strong>
                          </div>
                        )}
                        {upload.extraction.detected_patient_name && (
                          <div className="data-item">
                            <User size={14} />
                            <span>Patient</span>
                            <strong>{upload.extraction.detected_patient_name}</strong>
                          </div>
                        )}
                        {upload.extraction.detected_patient_birthdate && (
                          <div className="data-item">
                            <Calendar size={14} />
                            <span>Date naissance</span>
                            <strong>{upload.extraction.detected_patient_birthdate}</strong>
                          </div>
                        )}
                        {upload.extraction.detected_reference && (
                          <div className="data-item">
                            <FileText size={14} />
                            <span>Référence</span>
                            <strong>{upload.extraction.detected_reference}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sélection de l'ostéo */}
                    <div className="osteo-selection">
                      <label>
                        <UserCheck size={16} />
                        Attribuer à :
                      </label>
                      {upload.suggestedOsteoName && (
                        <span className="suggested-badge">
                          <Sparkles size={12} />
                          Suggestion: {upload.suggestedOsteoName}
                        </span>
                      )}
                      <select
                        value={upload.selectedOsteoId || ''}
                        onChange={(e) => updateSelectedOsteo(index, parseInt(e.target.value))}
                      >
                        <option value="">Sélectionner un ostéopathe</option>
                        {osteoList.map(osteo => (
                          <option key={osteo.id} value={osteo.id}>
                            {osteo.name} ({osteo.pending_reports} en cours)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Actions */}
                    <div className="card-actions">
                      <button 
                        className="btn-submit"
                        onClick={() => submitReport(upload, index)}
                        disabled={!upload.selectedOsteoId}
                      >
                        <Send size={16} />
                        Envoyer à l'ostéopathe
                      </button>
                    </div>
                  </div>
                )}

                {upload.status === 'uploading' && (
                  <div className="card-uploading">
                    <Loader2 size={24} className="spin" />
                    <span>Envoi en cours...</span>
                  </div>
                )}

                {upload.status === 'done' && (
                  <div className="card-done">
                    <CheckCircle size={24} />
                    <span>Rapport envoyé avec succès</span>
                  </div>
                )}

                {upload.status === 'error' && (
                  <div className="card-error">
                    <AlertTriangle size={24} />
                    <div>
                      <p>Erreur</p>
                      <span>{upload.error}</span>
                    </div>
                    <button onClick={() => removeUpload(index)}>Supprimer</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default InsuranceReportsUpload;

