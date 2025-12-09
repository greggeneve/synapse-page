/**
 * Types pour Synapse.poge - Workflow patient
 */

import type { AgendaCustomer, AgendaAppointment } from '../services/agendaService';

// === STATUTS PATIENT ===

export type PatientStatus = 
  | 'scheduled'      // RDV prévu, patient pas encore arrivé
  | 'arrived'        // Patient arrivé à l'accueil
  | 'waiting'        // En salle d'attente
  | 'in_progress'    // En consultation
  | 'completed'      // Consultation terminée
  | 'no_show';       // Patient absent

// === SALLE D'ATTENTE ===

export interface WaitingPatient {
  appointmentId: number;
  customerId: number;
  customerName: string;
  customerInitials: string;
  scheduledTime: string;      // Heure du RDV
  arrivedAt: string;          // Heure d'arrivée
  status: PatientStatus;
  assignedTo: number;         // employee_id de l'ostéo
  assignedToName: string;     // Nom de l'ostéo
  notes?: string;             // Notes rapides de l'accueil
}

// === PLANNING OSTÉO ===

export interface OsteoSchedule {
  employeeId: number;
  employeeName: string;
  date: string;               // YYYY-MM-DD
  appointments: ScheduleSlot[];
}

export interface ScheduleSlot {
  appointmentId: number;
  customerId: number;
  customerName: string;
  customerInitials: string;
  startTime: string;          // HH:MM
  endTime: string;
  duration: number;           // minutes
  status: PatientStatus;
  hasArrived: boolean;
  notes?: string;
}

// === CONSULTATION EN COURS ===

export interface ActiveConsultation {
  appointmentId: number;
  customerId: number;
  customer: AgendaCustomer;
  appointment: AgendaAppointment;
  startedAt: string;
  // Sections de la consultation
  anamnesis: ConsultationSection;
  examination: ConsultationSection;
  treatment: ConsultationSection;
  // État
  aiAlerts: AIAlert[];
  exportReady: boolean;
}

export interface ConsultationSection {
  context: string;            // Antécédents pré-remplis
  audioRecording?: Blob;      // Enregistrement audio
  transcription: string;      // Transcription
  aiAnalysis?: string;        // Analyse IA
  isRecording: boolean;
  isTranscribing: boolean;
}

export interface AIAlert {
  type: 'warning' | 'info' | 'critical';
  message: string;
  source: 'anamnesis' | 'examination' | 'treatment';
}

// === WEBSOCKET MESSAGES ===

export type WSMessageType = 
  | 'patient_arrived'         // Accueil → Ostéo: patient arrivé
  | 'patient_waiting'         // Accueil → Ostéo: patient en salle d'attente
  | 'consultation_started'    // Ostéo → Accueil: consultation démarrée
  | 'consultation_ended'      // Ostéo → Accueil: consultation terminée
  | 'status_update'           // Mise à jour générale
  | 'schedule_refresh'        // Demande de rafraîchissement
  | 'ping'                    // Keepalive
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  timestamp: string;
  senderId: number;           // employee_id de l'émetteur
  senderRole: 'reception' | 'osteo' | 'admin';
}

export interface WSPatientArrivedPayload {
  appointmentId: number;
  customerId: number;
  customerName: string;
  assignedTo: number;         // employee_id de l'ostéo
}

export interface WSStatusUpdatePayload {
  appointmentId: number;
  newStatus: PatientStatus;
  updatedBy: number;
}

// === EXPORT POUR AGENDA.CH ===

export interface ConsultationExport {
  // Format prêt à copier-coller
  anamnesis: string;
  examination: string;
  treatment: string;
  fullText: string;           // Tout combiné
}

// === PARAMÈTRES IA ===

export interface AIPromptSettings {
  anamnesisPrompt: string;    // Prompt pour analyser l'anamnèse
  examinationPrompt: string;  // Prompt pour l'examen
  treatmentPrompt: string;    // Prompt pour le traitement
  alertsPrompt: string;       // Prompt pour détecter les alertes
  updatedAt: string;
  updatedBy: number;
}

export const DEFAULT_AI_PROMPTS: AIPromptSettings = {
  anamnesisPrompt: `Tu es un assistant médical pour ostéopathes. Analyse l'anamnèse suivante et :
1. Résume les points clés de manière structurée
2. Identifie les red flags ou points à vérifier impérativement
3. Suggère des questions complémentaires si nécessaire

IMPORTANT: Ne jamais mentionner le nom ou la date de naissance du patient.`,

  examinationPrompt: `Analyse l'examen clinique suivant et :
1. Structure les observations par région anatomique
2. Identifie les dysfonctions principales
3. Suggère des tests complémentaires si pertinent`,

  treatmentPrompt: `Analyse le traitement effectué et :
1. Liste les techniques utilisées
2. Note les réactions du patient
3. Suggère un plan de suivi`,

  alertsPrompt: `Analyse le contenu de cette consultation et identifie :
- Les RED FLAGS nécessitant une attention immédiate ou un avis médical
- Les précautions à prendre
- Les contre-indications potentielles
Réponds uniquement avec les alertes, une par ligne, préfixée par [CRITICAL], [WARNING] ou [INFO].`,

  updatedAt: new Date().toISOString(),
  updatedBy: 0
};

