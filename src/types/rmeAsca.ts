// ============================================
// types/rmeAsca.ts - Types RME/ASCA pour Synapse
// ============================================

// Affiliation RME ou ASCA
export interface RmeAscaAffiliation {
  id: string;
  type: 'RME' | 'ASCA';
  numero_membre: string;
  date_adhesion: string; // Date anniversaire pour renouvellement (YYYY-MM-DD)
  date_expiration: string; // YYYY-MM-DD
  statut: 'actif' | 'suspendu' | 'expire';
}

// Résultat de la validation IA d'une attestation de formation
export interface RmeAiValidationResult {
  criteres_formels: {
    titre_formation: boolean;
    nom_participant: boolean;
    nom_formateur: boolean;
    qualification_formateur: boolean;
    nom_organisme: boolean;
    adresse_organisme: boolean;
    dates_exactes: boolean;
    duree_heures: boolean;
    modalite: boolean;
    signature: boolean;
  };
  criteres_structurels: {
    part_autonome_conforme: boolean;
    organisme_identifiable: boolean;
    pertinence_osteopathie: boolean;
  };
  criteres_techniques: {
    document_lisible: boolean;
    format_accepte: boolean;
    texte_extractible: boolean;
  };
  coherence: {
    nom_correspond_profil: boolean;
    formateur_different_apprenant: boolean;
    dates_coherentes: boolean;
  };
  elements_manquants: string[];
  alertes: string[];
  commentaire_ia?: string;
}

// Formation continue soumise
export interface RmeContinuingEducation {
  id: string;
  employee_id: string;
  titre: string;
  organisme: string;
  formateur: string;
  qualification_formateur?: string;
  dates_formation: { debut: string; fin: string };
  heures_total: number;
  heures_autonomes: number;
  modalite: 'presentiel' | 'mixte' | 'en_ligne';
  est_enseignement: boolean;
  heures_enseignement_brutes?: number;
  facture_url?: string;
  attestation_url: string;
  ai_validation_status: 'pending' | 'conforme' | 'incomplet' | 'non_conforme' | 'validation_humaine';
  ai_validation_details?: RmeAiValidationResult;
  admin_validation_status?: 'pending' | 'approuve' | 'refuse';
  admin_commentaire?: string;
  montant_facture: number;
  prise_en_charge_employeur: boolean;
  statut_paiement: 'non_applicable' | 'soumis' | 'approuve' | 'paye' | 'refuse';
  date_paiement?: string;
  engagement_prorata_accepte: boolean;
  date_engagement?: string;
  periode_rme: string;
  heures_creditees?: number;
  created_at: string;
}

// Cotisation annuelle
export interface RmeAscaCotisation {
  id: string;
  employee_id: string;
  type: 'RME' | 'ASCA';
  annee: number;
  montant: number;
  date_echeance: string;
  date_paiement?: string;
  statut: 'a_payer' | 'paye' | 'rembourse_prorata';
  prise_en_charge_employeur: boolean;
}

// Certificat annuel (pour les patients)
export interface RmeAscaCertificat {
  id: string;
  type: 'RME' | 'ASCA';
  annee: number;
  date_expiration: string;
  document_url: string;
}

// Balance d'heures
export interface RmeHoursBalance {
  periode_debut: string;
  periode_fin: string;
  annee_rme: number;
  heures_requises: number;
  heures_validees: number;
  heures_en_attente: number;
  heures_reportees_precedent: number;
  solde: number;
  statut: 'en_regle' | 'a_risque' | 'critique' | 'non_conforme';
  jours_avant_expiration?: number;
}

// Container pour l'employé
export interface EmployeeRmeData {
  rme_rcc?: string; // Numéro RME depuis externalIds
  affiliations: RmeAscaAffiliation[];
  formations: RmeContinuingEducation[];
  cotisations: RmeAscaCotisation[];
  certificats: RmeAscaCertificat[];
  balance?: RmeHoursBalance;
}

