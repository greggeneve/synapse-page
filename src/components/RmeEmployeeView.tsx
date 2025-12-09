// ============================================
// components/RmeEmployeeView.tsx - Vue RME côté employé (v2)
// ============================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap, Award, Clock, AlertTriangle, CheckCircle2,
  Upload, Plus, FileText, Calendar, Info, AlertCircle,
  Loader2, Send, X, ChevronDown, ChevronUp, Eye,
  Download, Euro, Calculator, Shield, FileCheck,
  XCircle, HelpCircle, Sparkles
} from 'lucide-react';
import type { EmployeeRmeData, RmeContinuingEducation, RmeAiValidationResult } from '../types/rmeAsca';
import { loadEmployeeRmeData, submitFormation } from '../services/rmeEmployeeService';
import './RmeEmployeeView.css';

interface RmeEmployeeViewProps {
  employeeId: string;
  employeeName: string;
}

export const RmeEmployeeView: React.FC<RmeEmployeeViewProps> = ({ employeeId, employeeName }) => {
  const [data, setData] = useState<EmployeeRmeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    pending: true,
    validated: false,
    refused: false
  });

  useEffect(() => {
    loadData();
  }, [employeeId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await loadEmployeeRmeData(employeeId);
      setData(result);
    } catch (error) {
      console.error('Erreur chargement RME:', error);
    }
    setIsLoading(false);
  };

  // Données dérivées
  const rmeAffiliation = data?.affiliations?.find(a => a.type === 'RME');
  const hasRme = !!rmeAffiliation || !!data?.rme_rcc;

  // Calculs pour la date anniversaire
  const anniversaryDate = rmeAffiliation?.date_expiration 
    ? new Date(rmeAffiliation.date_expiration) 
    : null;
  
  const today = new Date();
  const daysUntilAnniversary = anniversaryDate 
    ? Math.ceil((anniversaryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Période de traitement des dossiers (2 mois avant)
  const processingStartDate = anniversaryDate 
    ? new Date(anniversaryDate.getTime() - 60 * 24 * 60 * 60 * 1000)
    : null;
  const isInProcessingPeriod = processingStartDate && today >= processingStartDate;

  // Grouper les formations par statut
  const groupedFormations = useMemo(() => {
    const formations = data?.formations || [];
    return {
      pending: formations.filter(f => 
        f.admin_validation_status === 'pending' || f.ai_validation_status === 'pending'
      ),
      validated: formations.filter(f => f.admin_validation_status === 'approuve'),
      refused: formations.filter(f => 
        f.admin_validation_status === 'refuse' || f.ai_validation_status === 'non_conforme'
      ),
      incomplete: formations.filter(f => f.ai_validation_status === 'incomplet')
    };
  }, [data?.formations]);

  // Calcul du montant dû en cas de départ anticipé
  const calculateProrataAmount = useMemo(() => {
    if (!anniversaryDate || !data?.formations) return 0;
    
    const validatedFormations = data.formations.filter(
      f => f.admin_validation_status === 'approuve' && 
           f.prise_en_charge_employeur && 
           f.engagement_prorata_accepte
    );

    let totalDue = 0;
    const monthsRemaining = daysUntilAnniversary ? Math.ceil(daysUntilAnniversary / 30) : 0;
    
    validatedFormations.forEach(f => {
      const prorata = (f.montant_facture * monthsRemaining) / 12;
      totalDue += prorata;
    });

    return totalDue;
  }, [data?.formations, daysUntilAnniversary, anniversaryDate]);

  // Si pas ostéopathe (pas de RME), ne rien afficher
  if (!isLoading && !hasRme) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rme-loading">
        <Loader2 className="spin" size={24} />
        <span>Chargement des données RME...</span>
      </div>
    );
  }

  const balance = data?.balance;

  // Déterminer le statut global
  const getGlobalStatus = () => {
    if (!balance) return { status: 'unknown', color: 'gray', message: 'Aucune donnée disponible' };
    
    const total = balance.heures_validees + balance.heures_reportees_precedent;
    const diff = total - balance.heures_requises;
    
    if (diff >= 5) return { status: 'excellent', color: 'green', message: `${diff}h d'avance ! 🎉` };
    if (diff >= 0) return { status: 'ok', color: 'blue', message: 'Objectif atteint ✓' };
    if (diff >= -5) return { status: 'warning', color: 'orange', message: `${Math.abs(diff)}h à compléter` };
    return { status: 'critical', color: 'red', message: `${Math.abs(diff)}h manquantes ⚠️` };
  };

  const globalStatus = getGlobalStatus();

  return (
    <div className="rme-employee-view-v2">
      {/* ═══════════════════════════════════════════════════════════════
          HEADER - Vue d'ensemble rapide
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rme-overview-header">
        <div className="rme-overview-left">
          <div className="rme-badge-container">
            <Award size={32} className="rme-badge-icon" />
            <div className="rme-badge-info">
              <span className="rme-badge-label">Mon numéro RME</span>
              <span className="rme-badge-number">{rmeAffiliation?.numero_membre || data?.rme_rcc || '-'}</span>
            </div>
          </div>
        </div>

        <div className="rme-overview-center">
          {anniversaryDate && (
            <div className={`rme-anniversary-card ${isInProcessingPeriod ? 'processing' : ''}`}>
              <Calendar size={20} />
              <div className="rme-anniversary-info">
                <span className="rme-anniversary-label">Date anniversaire RME</span>
                <span className="rme-anniversary-date">
                  {anniversaryDate.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span className={`rme-anniversary-countdown ${daysUntilAnniversary && daysUntilAnniversary <= 60 ? 'urgent' : ''}`}>
                  {daysUntilAnniversary && daysUntilAnniversary > 0 
                    ? `Dans ${daysUntilAnniversary} jours`
                    : daysUntilAnniversary === 0 
                    ? "Aujourd'hui !"
                    : 'Expiré'
                  }
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="rme-overview-right">
          <div className={`rme-status-card status-${globalStatus.color}`}>
            <div className="rme-status-icon">
              {globalStatus.status === 'excellent' && <CheckCircle2 size={24} />}
              {globalStatus.status === 'ok' && <CheckCircle2 size={24} />}
              {globalStatus.status === 'warning' && <AlertCircle size={24} />}
              {globalStatus.status === 'critical' && <AlertTriangle size={24} />}
              {globalStatus.status === 'unknown' && <HelpCircle size={24} />}
            </div>
            <div className="rme-status-info">
              <span className="rme-status-message">{globalStatus.message}</span>
              {balance && (
                <span className="rme-status-hours">
                  {balance.heures_validees + balance.heures_reportees_precedent}h / {balance.heures_requises}h requises
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BANDEAU D'INFORMATION
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rme-info-banner">
        <Info size={18} />
        <div className="rme-info-content">
          <p>
            <strong>📅 Dépôt toute l'année possible</strong> — Vos documents peuvent être déposés à tout moment, 
            mais ils seront étudiés <strong>2 mois avant votre date anniversaire</strong>, 
            période pendant laquelle vous devrez compléter votre dossier RME en ligne.
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BARRE DE PROGRESSION DES HEURES
      ═══════════════════════════════════════════════════════════════ */}
      {balance && (
        <div className="rme-progress-section">
          <div className="rme-progress-header">
            <h3><Clock size={18} /> Mes heures de formation {balance.annee_rme}</h3>
            <div className="rme-progress-legend">
              <span className="legend-validated">Validées</span>
              <span className="legend-pending">En attente</span>
              <span className="legend-reported">Reportées</span>
            </div>
          </div>
          
          <div className="rme-progress-container">
            <div className="rme-progress-bar-bg">
              {/* Heures reportées */}
              <div 
                className="rme-progress-segment reported"
                style={{ width: `${(balance.heures_reportees_precedent / balance.heures_requises) * 100}%` }}
                title={`${balance.heures_reportees_precedent}h reportées`}
              />
              {/* Heures validées */}
              <div 
                className="rme-progress-segment validated"
                style={{ 
                  width: `${(balance.heures_validees / balance.heures_requises) * 100}%`,
                  left: `${(balance.heures_reportees_precedent / balance.heures_requises) * 100}%`
                }}
                title={`${balance.heures_validees}h validées`}
              />
              {/* Heures en attente */}
              <div 
                className="rme-progress-segment pending"
                style={{ 
                  width: `${(balance.heures_en_attente / balance.heures_requises) * 100}%`,
                  left: `${((balance.heures_reportees_precedent + balance.heures_validees) / balance.heures_requises) * 100}%`
                }}
                title={`${balance.heures_en_attente}h en attente`}
              />
              {/* Marqueur objectif */}
              <div className="rme-progress-goal" style={{ left: '100%' }}>
                <span>{balance.heures_requises}h</span>
              </div>
            </div>
            
            <div className="rme-progress-details">
              <div className="rme-progress-stat">
                <span className="stat-value">{balance.heures_reportees_precedent}h</span>
                <span className="stat-label">Reportées</span>
              </div>
              <div className="rme-progress-stat">
                <span className="stat-value">{balance.heures_validees}h</span>
                <span className="stat-label">Validées</span>
              </div>
              <div className="rme-progress-stat">
                <span className="stat-value">{balance.heures_en_attente}h</span>
                <span className="stat-label">En attente</span>
              </div>
              <div className="rme-progress-stat total">
                <span className="stat-value">{balance.heures_validees + balance.heures_reportees_precedent + balance.heures_en_attente}h</span>
                <span className="stat-label">Total</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          BOUTON SOUMETTRE UNE FORMATION
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rme-action-section">
        <button
          onClick={() => setShowSubmitForm(true)}
          className="rme-submit-btn"
        >
          <Plus size={20} />
          <span>Soumettre une nouvelle formation</span>
          <Sparkles size={16} className="sparkle" />
        </button>
        <p className="rme-action-hint">
          L'attestation sera vérifiée automatiquement par notre IA selon les normes RME
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          CALCUL PRORATA EN CAS DE DÉPART
      ═══════════════════════════════════════════════════════════════ */}
      {calculateProrataAmount > 0 && (
        <div className="rme-prorata-info">
          <Calculator size={20} />
          <div className="rme-prorata-content">
            <h4>Montant dû en cas de départ anticipé</h4>
            <p>
              Si vous quittez l'entreprise avant votre date anniversaire RME, 
              le montant à rembourser serait de :
            </p>
            <span className="rme-prorata-amount">CHF {calculateProrataAmount.toFixed(2)}</span>
            <small>(Calcul prorata temporis basé sur les formations prises en charge)</small>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          HISTORIQUE DES FORMATIONS
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rme-formations-history">
        <h3><FileText size={18} /> Mes formations</h3>

        {/* En attente de validation */}
        <FormationSection
          title="En attente de validation"
          icon={<Clock size={18} />}
          formations={[...groupedFormations.pending, ...groupedFormations.incomplete]}
          expanded={expandedSections.pending}
          onToggle={() => setExpandedSections(prev => ({ ...prev, pending: !prev.pending }))}
          badgeClass="pending"
          emptyMessage="Aucune formation en attente"
        />

        {/* Validées */}
        <FormationSection
          title="Formations validées"
          icon={<CheckCircle2 size={18} />}
          formations={groupedFormations.validated}
          expanded={expandedSections.validated}
          onToggle={() => setExpandedSections(prev => ({ ...prev, validated: !prev.validated }))}
          badgeClass="validated"
          emptyMessage="Aucune formation validée"
        />

        {/* Refusées */}
        {groupedFormations.refused.length > 0 && (
          <FormationSection
            title="Formations refusées"
            icon={<XCircle size={18} />}
            formations={groupedFormations.refused}
            expanded={expandedSections.refused}
            onToggle={() => setExpandedSections(prev => ({ ...prev, refused: !prev.refused }))}
            badgeClass="refused"
            emptyMessage=""
          />
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          CERTIFICATS
      ═══════════════════════════════════════════════════════════════ */}
      {(data?.certificats || []).length > 0 && (
        <div className="rme-certificats-section">
          <h3><Award size={18} /> Mes certificats RME/ASCA</h3>
          <p className="rme-certificats-hint">À présenter à vos patients pour le remboursement</p>
          <div className="rme-certificats-grid">
            {data?.certificats?.map(cert => (
              <a
                key={cert.id}
                href={cert.document_url}
                download={`Certificat_${cert.type}_${cert.annee}.pdf`}
                className="rme-certificat-card"
              >
                <FileCheck size={24} />
                <div className="cert-info">
                  <span className="cert-type">{cert.type}</span>
                  <span className="cert-year">{cert.annee}</span>
                </div>
                <Download size={16} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODAL DE SOUMISSION
      ═══════════════════════════════════════════════════════════════ */}
      {showSubmitForm && (
        <SubmitFormationModal
          employeeId={employeeId}
          employeeName={employeeName}
          dateAnniversaire={rmeAffiliation?.date_expiration || ''}
          onClose={() => setShowSubmitForm(false)}
          onSuccess={() => {
            setShowSubmitForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Composant Section de formations
// ═══════════════════════════════════════════════════════════════
interface FormationSectionProps {
  title: string;
  icon: React.ReactNode;
  formations: RmeContinuingEducation[];
  expanded: boolean;
  onToggle: () => void;
  badgeClass: string;
  emptyMessage: string;
}

const FormationSection: React.FC<FormationSectionProps> = ({
  title, icon, formations, expanded, onToggle, badgeClass, emptyMessage
}) => {
  return (
    <div className={`rme-formation-section ${badgeClass}`}>
      <button className="rme-section-header" onClick={onToggle}>
        <div className="section-title">
          {icon}
          <span>{title}</span>
          <span className={`section-badge ${badgeClass}`}>{formations.length}</span>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      
      {expanded && (
        <div className="rme-section-content">
          {formations.length === 0 ? (
            <p className="rme-empty">{emptyMessage}</p>
          ) : (
            formations.map(f => <FormationCard key={f.id} formation={f} />)
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Composant Carte de formation
// ═══════════════════════════════════════════════════════════════
const FormationCard: React.FC<{ formation: RmeContinuingEducation }> = ({ formation }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="rme-formation-card">
      <div className="formation-main" onClick={() => setShowDetails(!showDetails)}>
        <div className="formation-info">
          <h4>{formation.titre}</h4>
          <p className="formation-org">{formation.organisme}</p>
          <div className="formation-meta">
            <span><Calendar size={14} /> {new Date(formation.dates_formation.debut).toLocaleDateString('fr-CH')}</span>
            <span><Clock size={14} /> {formation.heures_total}h</span>
            {formation.montant_facture > 0 && (
              <span><Euro size={14} /> CHF {formation.montant_facture}</span>
            )}
          </div>
        </div>
        
        <div className="formation-status">
          <StatusBadge status={formation.ai_validation_status} type="ia" />
          {formation.admin_validation_status && formation.admin_validation_status !== 'pending' && (
            <StatusBadge status={formation.admin_validation_status} type="admin" />
          )}
        </div>
      </div>

      {showDetails && (
        <div className="formation-details">
          {/* Détails de validation IA */}
          {formation.ai_validation_details && (
            <AIValidationDetails details={formation.ai_validation_details} />
          )}
          
          {/* Commentaire admin */}
          {formation.admin_commentaire && (
            <div className="formation-comment">
              <strong>💬 Commentaire de l'administration :</strong>
              <p>{formation.admin_commentaire}</p>
            </div>
          )}
          
          {/* Documents */}
          <div className="formation-documents">
            {formation.attestation_url && (
              <a href={formation.attestation_url} target="_blank" rel="noopener noreferrer" className="doc-link">
                <FileText size={16} /> Attestation
              </a>
            )}
            {formation.facture_url && (
              <a href={formation.facture_url} target="_blank" rel="noopener noreferrer" className="doc-link">
                <FileText size={16} /> Facture
              </a>
            )}
          </div>

          {/* Info prise en charge */}
          {formation.prise_en_charge_employeur && (
            <div className="formation-prise-en-charge">
              <Shield size={16} />
              <span>Prise en charge employeur</span>
              {formation.engagement_prorata_accepte && (
                <span className="engagement-badge">Engagement prorata signé</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Composant Détails validation IA
// ═══════════════════════════════════════════════════════════════
const AIValidationDetails: React.FC<{ details: RmeAiValidationResult }> = ({ details }) => {
  const criteresFormels = Object.entries(details.criteres_formels);
  const allFormelsOk = criteresFormels.every(([, v]) => v);

  return (
    <div className="ai-validation-details">
      <h5><Sparkles size={16} /> Analyse automatique de l'attestation</h5>
      
      <div className="ai-criteria-grid">
        {criteresFormels.map(([key, value]) => (
          <div key={key} className={`ai-criterion ${value ? 'ok' : 'missing'}`}>
            {value ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            <span>{formatCriterionName(key)}</span>
          </div>
        ))}
      </div>

      {details.elements_manquants.length > 0 && (
        <div className="ai-missing">
          <strong>Éléments manquants :</strong>
          <ul>
            {details.elements_manquants.map((el, i) => <li key={i}>{el}</li>)}
          </ul>
        </div>
      )}

      {details.alertes.length > 0 && (
        <div className="ai-alerts">
          <strong>⚠️ Alertes :</strong>
          <ul>
            {details.alertes.map((al, i) => <li key={i}>{al}</li>)}
          </ul>
        </div>
      )}

      {details.commentaire_ia && (
        <div className="ai-comment">
          <strong>Commentaire IA :</strong>
          <p>{details.commentaire_ia}</p>
        </div>
      )}
    </div>
  );
};

// Formater le nom des critères
const formatCriterionName = (key: string): string => {
  const names: Record<string, string> = {
    titre_formation: 'Titre de la formation',
    nom_participant: 'Nom du participant',
    nom_formateur: 'Nom du formateur',
    qualification_formateur: 'Qualification formateur',
    nom_organisme: 'Organisme de formation',
    adresse_organisme: 'Adresse organisme',
    dates_exactes: 'Dates de formation',
    duree_heures: 'Durée en heures',
    modalite: 'Modalité',
    signature: 'Signature'
  };
  return names[key] || key;
};

// ═══════════════════════════════════════════════════════════════
// Composant Badge de statut
// ═══════════════════════════════════════════════════════════════
const StatusBadge: React.FC<{ status: string; type: 'ia' | 'admin' }> = ({ status, type }) => {
  const configs: Record<string, { className: string; label: string; icon: React.ReactNode }> = {
    pending: { 
      className: 'status-pending', 
      label: type === 'ia' ? 'Analyse IA...' : 'En attente',
      icon: <Loader2 size={12} className="spin" />
    },
    conforme: { 
      className: 'status-success', 
      label: 'Conforme RME',
      icon: <CheckCircle2 size={12} />
    },
    incomplet: { 
      className: 'status-warning', 
      label: 'Incomplet',
      icon: <AlertCircle size={12} />
    },
    non_conforme: { 
      className: 'status-error', 
      label: 'Non conforme',
      icon: <XCircle size={12} />
    },
    validation_humaine: { 
      className: 'status-info', 
      label: 'Révision manuelle',
      icon: <Eye size={12} />
    },
    approuve: { 
      className: 'status-success', 
      label: 'Validé ✓',
      icon: <CheckCircle2 size={12} />
    },
    refuse: { 
      className: 'status-error', 
      label: 'Refusé',
      icon: <XCircle size={12} />
    }
  };
  const config = configs[status] || { className: 'status-pending', label: status, icon: null };
  
  return (
    <span className={`rme-status-badge ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// Modal de soumission de formation (v2)
// ═══════════════════════════════════════════════════════════════
const SubmitFormationModal: React.FC<{
  employeeId: string;
  employeeName: string;
  dateAnniversaire: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ employeeId, employeeName, dateAnniversaire, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    titre: '',
    organisme: '',
    formateur: '',
    qualificationFormateur: '',
    dateDebut: '',
    dateFin: '',
    heuresTotal: 0,
    heuresAutonomes: 0,
    modalite: 'presentiel' as 'presentiel' | 'mixte' | 'en_ligne',
    estEnseignement: false,
    montant: 0,
    priseEnChargeEmployeur: false
  });
  const [attestationFile, setAttestationFile] = useState<string>('');
  const [factureFile, setFactureFile] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingAI, setIsValidatingAI] = useState(false);
  const [aiValidationResult, setAiValidationResult] = useState<RmeAiValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Conditions à accepter
  const [conditions, setConditions] = useState({
    prorata: false,
    discretion: false,
    apresFormation: false,
    documentsComplets: false
  });

  const allConditionsAccepted = formData.priseEnChargeEmployeur 
    ? Object.values(conditions).every(v => v)
    : true;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'attestation' | 'facture') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      if (type === 'attestation') {
        setAttestationFile(base64);
        // Lancer la validation IA
        setIsValidatingAI(true);
        try {
          // Simulation de validation IA (à remplacer par appel API Gemini)
          await new Promise(resolve => setTimeout(resolve, 2000));
          // Pour la démo, on simule une réponse IA
          const mockResult: RmeAiValidationResult = {
            criteres_formels: {
              titre_formation: true,
              nom_participant: true,
              nom_formateur: true,
              qualification_formateur: Math.random() > 0.3,
              nom_organisme: true,
              adresse_organisme: Math.random() > 0.2,
              dates_exactes: true,
              duree_heures: true,
              modalite: Math.random() > 0.4,
              signature: true
            },
            criteres_structurels: {
              part_autonome_conforme: true,
              organisme_identifiable: true,
              pertinence_osteopathie: true
            },
            criteres_techniques: {
              document_lisible: true,
              format_accepte: true,
              texte_extractible: true
            },
            coherence: {
              nom_correspond_profil: true,
              formateur_different_apprenant: true,
              dates_coherentes: true
            },
            elements_manquants: [],
            alertes: [],
            commentaire_ia: 'Document analysé avec succès.'
          };
          
          // Ajouter les éléments manquants
          Object.entries(mockResult.criteres_formels).forEach(([key, value]) => {
            if (!value) {
              mockResult.elements_manquants.push(formatCriterionName(key));
            }
          });
          
          setAiValidationResult(mockResult);
        } catch (err) {
          console.error('Erreur validation IA:', err);
        }
        setIsValidatingAI(false);
      } else {
        setFactureFile(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!allConditionsAccepted && formData.priseEnChargeEmployeur) {
      setError('Vous devez accepter toutes les conditions pour soumettre une demande de prise en charge');
      return;
    }
    if (!attestationFile) {
      setError('L\'attestation est obligatoire');
      return;
    }
    if (!formData.titre || !formData.organisme || !formData.formateur || !formData.dateDebut || !formData.heuresTotal) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await submitFormation({
      employee_id: employeeId,
      titre: formData.titre,
      organisme: formData.organisme,
      formateur: formData.formateur,
      qualification_formateur: formData.qualificationFormateur,
      dates_formation: { debut: formData.dateDebut, fin: formData.dateFin || formData.dateDebut },
      heures_total: formData.heuresTotal,
      heures_autonomes: formData.heuresAutonomes,
      modalite: formData.modalite,
      est_enseignement: formData.estEnseignement,
      facture_url: factureFile || undefined,
      attestation_url: attestationFile,
      montant_facture: formData.montant,
      prise_en_charge_employeur: formData.priseEnChargeEmployeur,
      statut_paiement: formData.priseEnChargeEmployeur ? 'soumis' : 'non_applicable',
      engagement_prorata_accepte: conditions.prorata,
      date_engagement: conditions.prorata ? new Date().toISOString() : undefined,
      periode_rme: new Date().getFullYear().toString()
    });

    setIsSubmitting(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Erreur lors de la soumission');
    }
  };

  return (
    <div className="rme-modal-overlay" onClick={onClose}>
      <div className="rme-modal rme-modal-large" onClick={e => e.stopPropagation()}>
        <div className="rme-modal-header">
          <div className="modal-title">
            <GraduationCap size={24} />
            <h2>Soumettre une formation continue</h2>
          </div>
          <button className="rme-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="rme-steps">
          <div className={`rme-step ${step >= 1 ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Informations</span>
          </div>
          <div className={`rme-step ${step >= 2 ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Documents</span>
          </div>
          <div className={`rme-step ${step >= 3 ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Prise en charge</span>
          </div>
        </div>

        <div className="rme-modal-body">
          {/* ÉTAPE 1: Informations */}
          {step === 1 && (
            <div className="rme-form-step">
              <div className="rme-form-row">
                <div className="rme-form-group">
                  <label>Titre de la formation *</label>
                  <input
                    type="text"
                    value={formData.titre}
                    onChange={e => setFormData({ ...formData, titre: e.target.value })}
                    placeholder="Ex: Ostéopathie pédiatrique avancée"
                  />
                </div>
                <div className="rme-form-group">
                  <label>Organisme de formation *</label>
                  <input
                    type="text"
                    value={formData.organisme}
                    onChange={e => setFormData({ ...formData, organisme: e.target.value })}
                    placeholder="Ex: Swiss Osteopathy Institute"
                  />
                </div>
              </div>

              <div className="rme-form-row">
                <div className="rme-form-group">
                  <label>Formateur *</label>
                  <input
                    type="text"
                    value={formData.formateur}
                    onChange={e => setFormData({ ...formData, formateur: e.target.value })}
                    placeholder="Nom du formateur"
                  />
                </div>
                <div className="rme-form-group">
                  <label>Qualification du formateur</label>
                  <input
                    type="text"
                    value={formData.qualificationFormateur}
                    onChange={e => setFormData({ ...formData, qualificationFormateur: e.target.value })}
                    placeholder="Ex: DO, PhD"
                  />
                </div>
              </div>

              <div className="rme-form-row rme-form-row-3">
                <div className="rme-form-group">
                  <label>Date début *</label>
                  <input
                    type="date"
                    value={formData.dateDebut}
                    onChange={e => setFormData({ ...formData, dateDebut: e.target.value })}
                  />
                </div>
                <div className="rme-form-group">
                  <label>Date fin</label>
                  <input
                    type="date"
                    value={formData.dateFin}
                    onChange={e => setFormData({ ...formData, dateFin: e.target.value })}
                  />
                </div>
                <div className="rme-form-group">
                  <label>Modalité *</label>
                  <select
                    value={formData.modalite}
                    onChange={e => setFormData({ ...formData, modalite: e.target.value as any })}
                  >
                    <option value="presentiel">Présentiel</option>
                    <option value="mixte">Mixte</option>
                    <option value="en_ligne">En ligne</option>
                  </select>
                </div>
              </div>

              <div className="rme-form-row rme-form-row-3">
                <div className="rme-form-group">
                  <label>Heures totales *</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.heuresTotal}
                    onChange={e => setFormData({ ...formData, heuresTotal: Number(e.target.value) })}
                  />
                </div>
                <div className="rme-form-group">
                  <label>Heures autonomes</label>
                  <input
                    type="number"
                    min="0"
                    max={formData.heuresTotal * 0.5}
                    value={formData.heuresAutonomes}
                    onChange={e => setFormData({ ...formData, heuresAutonomes: Number(e.target.value) })}
                  />
                  <span className="rme-hint">Max 50% du total ({Math.floor(formData.heuresTotal * 0.5)}h)</span>
                </div>
                <div className="rme-form-group">
                  <label>Montant (CHF)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.montant}
                    onChange={e => setFormData({ ...formData, montant: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 2: Documents */}
          {step === 2 && (
            <div className="rme-form-step">
              <div className="rme-upload-section">
                <div className="rme-upload-card">
                  <div className="upload-header">
                    <FileText size={24} />
                    <div>
                      <h4>Attestation de formation *</h4>
                      <p>Document officiel avec signature</p>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => handleFileUpload(e, 'attestation')}
                    id="attestation-upload"
                    hidden
                  />
                  <label htmlFor="attestation-upload" className="upload-btn">
                    <Upload size={18} />
                    {attestationFile ? 'Changer le fichier' : 'Choisir un fichier'}
                  </label>
                  {attestationFile && (
                    <div className="upload-status success">
                      <CheckCircle2 size={16} /> Fichier chargé
                    </div>
                  )}
                </div>

                <div className="rme-upload-card">
                  <div className="upload-header">
                    <Euro size={24} />
                    <div>
                      <h4>Facture</h4>
                      <p>Optionnel, requis pour prise en charge</p>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => handleFileUpload(e, 'facture')}
                    id="facture-upload"
                    hidden
                  />
                  <label htmlFor="facture-upload" className="upload-btn">
                    <Upload size={18} />
                    {factureFile ? 'Changer le fichier' : 'Choisir un fichier'}
                  </label>
                  {factureFile && (
                    <div className="upload-status success">
                      <CheckCircle2 size={16} /> Fichier chargé
                    </div>
                  )}
                </div>
              </div>

              {/* Validation IA */}
              {isValidatingAI && (
                <div className="rme-ai-validating">
                  <Loader2 size={24} className="spin" />
                  <p>Analyse de l'attestation en cours...</p>
                  <span>Vérification des critères RME par notre IA</span>
                </div>
              )}

              {aiValidationResult && !isValidatingAI && (
                <div className="rme-ai-result">
                  <h4><Sparkles size={18} /> Résultat de l'analyse automatique</h4>
                  <AIValidationDetails details={aiValidationResult} />
                </div>
              )}

              {/* Info normes RME */}
              <div className="rme-norms-info">
                <h4><Info size={16} /> Normes RME pour l'attestation</h4>
                <ul>
                  <li>Titre de la formation</li>
                  <li>Votre nom et prénom</li>
                  <li>Nom et qualification du formateur</li>
                  <li>Nom et adresse de l'organisme</li>
                  <li>Dates exactes et durée en heures</li>
                  <li>Signature du formateur ou de l'organisme</li>
                </ul>
              </div>
            </div>
          )}

          {/* ÉTAPE 3: Prise en charge */}
          {step === 3 && (
            <div className="rme-form-step">
              <div className="rme-prise-en-charge-option">
                <label className="rme-checkbox-large">
                  <input
                    type="checkbox"
                    checked={formData.priseEnChargeEmployeur}
                    onChange={e => setFormData({ ...formData, priseEnChargeEmployeur: e.target.checked })}
                  />
                  <div className="checkbox-content">
                    <span className="checkbox-title">Demander une prise en charge employeur</span>
                    <span className="checkbox-desc">
                      Montant de la formation : CHF {formData.montant.toFixed(2)}
                    </span>
                  </div>
                </label>
              </div>

              {formData.priseEnChargeEmployeur && (
                <div className="rme-conditions-section">
                  <h4><Shield size={18} /> Conditions de prise en charge</h4>
                  <p className="conditions-intro">
                    En demandant une prise en charge, vous devez accepter les conditions suivantes :
                  </p>

                  <div className="rme-condition-box">
                    <label className="rme-condition">
                      <input
                        type="checkbox"
                        checked={conditions.prorata}
                        onChange={e => setConditions({ ...conditions, prorata: e.target.checked })}
                      />
                      <div>
                        <strong>Engagement prorata temporis</strong>
                        <p>
                          En cas de départ avant ma date anniversaire RME 
                          ({dateAnniversaire ? new Date(dateAnniversaire).toLocaleDateString('fr-CH') : 'non définie'}), 
                          je m'engage à rembourser le montant au prorata du temps restant.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="rme-condition-box">
                    <label className="rme-condition">
                      <input
                        type="checkbox"
                        checked={conditions.discretion}
                        onChange={e => setConditions({ ...conditions, discretion: e.target.checked })}
                      />
                      <div>
                        <strong>Participation à la discrétion du directeur</strong>
                        <p>
                          Je comprends que la participation financière aux frais de formation 
                          est à la discrétion du directeur et peut être refusée.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="rme-condition-box">
                    <label className="rme-condition">
                      <input
                        type="checkbox"
                        checked={conditions.apresFormation}
                        onChange={e => setConditions({ ...conditions, apresFormation: e.target.checked })}
                      />
                      <div>
                        <strong>Remboursement après formation</strong>
                        <p>
                          Je comprends que le remboursement ne pourra être effectué 
                          qu'après la formation effectuée et non avant.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="rme-condition-box">
                    <label className="rme-condition">
                      <input
                        type="checkbox"
                        checked={conditions.documentsComplets}
                        onChange={e => setConditions({ ...conditions, documentsComplets: e.target.checked })}
                      />
                      <div>
                        <strong>Documents complets et conformes</strong>
                        <p>
                          Je comprends que le paiement sera effectué uniquement après soumission 
                          de tous les documents complets et conformes aux normes RME.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Récapitulatif */}
              <div className="rme-summary">
                <h4>📋 Récapitulatif</h4>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Formation</span>
                    <span className="summary-value">{formData.titre || '-'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Organisme</span>
                    <span className="summary-value">{formData.organisme || '-'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Durée</span>
                    <span className="summary-value">{formData.heuresTotal}h</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Montant</span>
                    <span className="summary-value">CHF {formData.montant.toFixed(2)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Attestation</span>
                    <span className={`summary-value ${attestationFile ? 'ok' : 'missing'}`}>
                      {attestationFile ? '✓ Uploadée' : '✗ Manquante'}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Prise en charge</span>
                    <span className="summary-value">
                      {formData.priseEnChargeEmployeur ? 'Demandée' : 'Non demandée'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="rme-error">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
        </div>

        <div className="rme-modal-footer">
          {step > 1 && (
            <button className="rme-btn-secondary" onClick={() => setStep(step - 1)}>
              ← Précédent
            </button>
          )}
          <div className="footer-spacer" />
          {step < 3 ? (
            <button 
              className="rme-btn-primary" 
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && (!formData.titre || !formData.organisme || !formData.formateur || !formData.dateDebut || !formData.heuresTotal)}
            >
              Suivant →
            </button>
          ) : (
            <button 
              className="rme-btn-primary submit" 
              onClick={handleSubmit}
              disabled={isSubmitting || !attestationFile || (formData.priseEnChargeEmployeur && !allConditionsAccepted)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Soumettre la formation
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RmeEmployeeView;
