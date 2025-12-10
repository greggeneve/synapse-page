// Types pour l'application employés - Rapports

export interface TeamMember {
  id: string;
  nom: string;
  prenom: string;
  fonction: string;
  photo_url?: string;
  email_professionnel?: string;
  actif: boolean;
  // Permissions (optionnel, pour AuthUser)
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  impersonating?: string; // Nom de l'admin qui impersonne
  // Rôles de direction
  isDirecteur?: boolean;
  isDirecteurAdjoint?: boolean;
}

export interface Report {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail?: string;
  title: string;
  content: string;
  correctedContent?: string;
  // Infos patient
  patientInitials?: string;
  patientName?: string;           // Nom complet pour le PDF
  patientBirthDate?: string;      // Date de naissance (YYYY-MM-DD)
  patientAge?: number;
  // Contexte
  consultationDate: string;
  destinataire?: string;          // Ex: "Dr Martin Dupont"
  introduction?: string;          // Paragraphe d'intro avant le contenu
  // Signature personnalisée
  signatureId?: number;           // ID de la signature sélectionnée
  signatureLines?: string[];      // Lignes de signature formatées pour le PDF
  // Métadonnées
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'corrected' | 'finalized';
  corrections?: string[];
  suggestions?: string[];
  warnings?: string[];
}

// Signature personnalisée pour les rapports
export interface ReportSignature {
  id: number;
  employee_id: number;
  name: string;
  title_line1: string;
  title_line2?: string;
  title_line3?: string;
  certifications?: string;
  show_rme?: boolean;
  show_email?: boolean;
  show_phone?: boolean;
  is_default: boolean;
}

export interface ReportTemplate {
  id: string;
  name: string;
  sections: ReportSection[];
}

export interface ReportSection {
  id: string;
  title: string;
  placeholder: string;
  required: boolean;
}

// Template par défaut pour un rapport ostéopathique
export const DEFAULT_REPORT_TEMPLATE: ReportTemplate = {
  id: 'osteo-standard',
  name: 'Rapport Ostéopathique Standard',
  sections: [
    {
      id: 'motif',
      title: 'Motif de consultation',
      placeholder: 'Décrivez le motif de consultation du patient...',
      required: true
    },
    {
      id: 'anamnese',
      title: 'Anamnèse',
      placeholder: 'Antécédents, contexte médical, historique...',
      required: true
    },
    {
      id: 'examen',
      title: 'Examen clinique',
      placeholder: 'Observations, tests effectués, mobilité...',
      required: true
    },
    {
      id: 'diagnostic',
      title: 'Diagnostic ostéopathique',
      placeholder: 'Dysfonctions identifiées, zones de restriction...',
      required: true
    },
    {
      id: 'traitement',
      title: 'Traitement effectué',
      placeholder: 'Techniques utilisées, zones traitées...',
      required: true
    },
    {
      id: 'evolution',
      title: 'Évolution et conseils',
      placeholder: 'Réaction du patient, conseils donnés, suivi prévu...',
      required: false
    }
  ]
};

