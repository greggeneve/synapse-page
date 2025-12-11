/**
 * Service de gestion des rapports d'assurance
 * Workflow: Accueil → Ostéo → Direction → Accueil → Envoi
 */

import { query } from './mariadb';

// ===== TYPES =====

export type InsuranceType = 'maladie' | 'accident' | 'ai' | 'autre';

export type ReportStatus = 
  | 'pending_assignment'    // En attente d'attribution
  | 'assigned'              // Assigné à un ostéo
  | 'in_progress'           // En cours de remplissage
  | 'submitted_for_review'  // Soumis pour validation
  | 'needs_correction'      // À corriger
  | 'approved'              // Validé
  | 'ready_to_send'         // Prêt à envoyer
  | 'sent'                  // Envoyé
  | 'archived';             // Archivé

export interface InsuranceReport {
  id: number;
  reference_number?: string;
  insurance_name?: string;
  insurance_type: InsuranceType;
  
  // Patient
  patient_firstname?: string;
  patient_lastname?: string;
  patient_birthdate?: string;
  patient_avs?: string;
  
  // Fichiers
  original_pdf?: string;      // Base64
  original_filename?: string;
  filled_pdf?: string;        // Base64
  filled_filename?: string;
  
  // Attribution
  assigned_osteo_id?: number;
  assigned_osteo_name?: string;
  status: ReportStatus;
  
  // Validation
  reviewer_id?: number;
  reviewer_name?: string;
  review_comment?: string;
  review_audio_url?: string;
  
  // Envoi
  assigned_sender_id?: number;
  sender_name?: string;
  sent_date?: string;
  sent_method?: 'courrier' | 'email' | 'fax';
  
  // Dates
  received_date?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  
  // IA
  ai_extraction_data?: AIExtractionData;
  ai_confidence_score?: number;
  
  // Compteurs
  annotation_count?: number;
}

export interface AIExtractionData {
  detected_insurance?: string;
  detected_patient_name?: string;
  detected_patient_birthdate?: string;
  detected_osteo_name?: string;
  detected_reference?: string;
  detected_treatment_dates?: string;
  raw_text?: string;
  confidence_details?: Record<string, number>;
}

export interface ReportAnnotation {
  id?: number;
  report_id: number;
  page_number: number;
  annotation_type: 'text' | 'checkbox' | 'signature' | 'date' | 'drawing';
  x_position: number;
  y_position: number;
  width?: number;
  height?: number;
  content: string;
  font_size?: number;
  font_family?: string;
  color?: string;
  created_by?: number;
}

export interface ReportHistoryEntry {
  id: number;
  report_id: number;
  action: string;
  performed_by?: number;
  performer_name?: string;
  comment?: string;
  created_at: string;
}

// ===== CRÉATION & UPLOAD =====

/**
 * Créer un nouveau rapport d'assurance (upload depuis l'accueil)
 */
export async function createInsuranceReport(data: {
  original_pdf: string;        // Base64
  original_filename: string;
  received_date?: string;
  due_date?: string;
  ai_extraction?: AIExtractionData;
  uploaded_by: number;
}): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    // Parser le nom du patient si présent
    let patientFirstname = null;
    let patientLastname = null;
    if (data.ai_extraction?.detected_patient_name) {
      const parts = data.ai_extraction.detected_patient_name.trim().split(' ');
      patientFirstname = parts[0] || null;
      patientLastname = parts.slice(1).join(' ') || null;
    }

    const result = await query<any>(`
      INSERT INTO insurance_reports (
        original_pdf, original_filename, 
        received_date, due_date,
        patient_firstname, patient_lastname, patient_birthdate,
        insurance_name, reference_number,
        ai_extraction_data, ai_confidence_score,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_assignment')
    `, [
      data.original_pdf,
      data.original_filename,
      data.received_date || new Date().toISOString().split('T')[0],
      data.due_date,
      patientFirstname,
      patientLastname,
      data.ai_extraction?.detected_patient_birthdate || null,
      data.ai_extraction?.detected_insurance || null,
      data.ai_extraction?.detected_reference || null,
      JSON.stringify(data.ai_extraction || {}),
      data.ai_extraction ? 0.8 : null  // Score par défaut si extraction IA
    ]);

    if (result.success && result.insertId) {
      // Enregistrer dans l'historique (ignorer si table n'existe pas)
      try {
        await addHistoryEntry(result.insertId, 'created', data.uploaded_by, 'Rapport uploadé');
      } catch (histError) {
        console.warn('[InsuranceReport] Historique non enregistré:', histError);
      }
      return { success: true, id: result.insertId };
    }

    // Vérifier si c'est une erreur de table manquante
    if (result.error && (result.error.includes("doesn't exist") || result.error.includes('ER_NO_SUCH_TABLE'))) {
      return { success: false, error: 'Table insurance_reports non trouvée. Créez les tables SQL.' };
    }

    return { success: false, error: result.error || 'Erreur lors de la création' };
  } catch (error: any) {
    console.error('[InsuranceReport] Erreur création:', error);
    
    // Message d'erreur plus explicite pour table manquante
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes('ER_NO_SUCH_TABLE'))) {
      return { success: false, error: 'Table insurance_reports non trouvée. Exécutez data/create_insurance_reports_tables.sql' };
    }
    
    return { success: false, error: error.message };
  }
}

// ===== RÉCUPÉRATION =====

/**
 * Récupérer les rapports en attente d'attribution
 */
export async function getPendingAssignmentReports(): Promise<InsuranceReport[]> {
  const result = await query<any>(`
    SELECT 
      id, reference_number, insurance_name, insurance_type,
      patient_firstname, patient_lastname, patient_birthdate,
      original_filename, status, received_date, due_date,
      ai_extraction_data, ai_confidence_score,
      created_at, updated_at
    FROM insurance_reports
    WHERE status = 'pending_assignment'
    ORDER BY COALESCE(due_date, '9999-12-31') ASC, created_at ASC
  `);

  return (result.data || []).map(parseReport);
}

/**
 * Récupérer les rapports assignés à un ostéo
 */
export async function getOsteoReports(osteoId: number): Promise<InsuranceReport[]> {
  const result = await query<any>(`
    SELECT 
      ir.*,
      (SELECT COUNT(*) FROM insurance_report_annotations WHERE report_id = ir.id) AS annotation_count
    FROM insurance_reports ir
    WHERE ir.assigned_osteo_id = ?
      AND ir.status IN ('assigned', 'in_progress', 'needs_correction')
    ORDER BY 
      CASE ir.status 
        WHEN 'needs_correction' THEN 1 
        WHEN 'in_progress' THEN 2 
        ELSE 3 
      END,
      COALESCE(ir.due_date, '9999-12-31') ASC
  `, [osteoId]);

  return (result.data || []).map(parseReport);
}

/**
 * Récupérer les rapports soumis pour validation (direction)
 */
export async function getReportsForReview(): Promise<InsuranceReport[]> {
  const result = await query<any>(`
    SELECT 
      ir.*,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) AS osteo_prenom,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom')) AS osteo_nom,
      (SELECT COUNT(*) FROM insurance_report_annotations WHERE report_id = ir.id) AS annotation_count
    FROM insurance_reports ir
    LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
    WHERE ir.status = 'submitted_for_review'
    ORDER BY COALESCE(ir.due_date, '9999-12-31') ASC, ir.updated_at ASC
  `);

  return (result.data || []).map((row: any) => ({
    ...parseReport(row),
    assigned_osteo_name: row.osteo_prenom && row.osteo_nom 
      ? `${row.osteo_prenom} ${row.osteo_nom}` 
      : undefined
  }));
}

/**
 * Récupérer les rapports prêts à envoyer (accueil)
 */
export async function getReportsReadyToSend(): Promise<InsuranceReport[]> {
  const result = await query<any>(`
    SELECT 
      ir.*,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) AS osteo_prenom,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom')) AS osteo_nom
    FROM insurance_reports ir
    LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
    WHERE ir.status = 'ready_to_send'
    ORDER BY COALESCE(ir.due_date, '9999-12-31') ASC
  `);

  return (result.data || []).map((row: any) => ({
    ...parseReport(row),
    assigned_osteo_name: row.osteo_prenom && row.osteo_nom 
      ? `${row.osteo_prenom} ${row.osteo_nom}` 
      : undefined
  }));
}

/**
 * Récupérer un rapport par ID avec toutes ses données
 */
export async function getReportById(reportId: number): Promise<InsuranceReport | null> {
  const result = await query<any>(`
    SELECT 
      ir.*,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) AS osteo_prenom,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom')) AS osteo_nom,
      JSON_UNQUOTE(JSON_EXTRACT(r.profile_json, '$.identification.prenom')) AS reviewer_prenom,
      JSON_UNQUOTE(JSON_EXTRACT(r.profile_json, '$.identification.nom')) AS reviewer_nom,
      (SELECT COUNT(*) FROM insurance_report_annotations WHERE report_id = ir.id) AS annotation_count
    FROM insurance_reports ir
    LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
    LEFT JOIN employees r ON ir.reviewer_id = r.employee_id
    WHERE ir.id = ?
  `, [reportId]);

  if (!result.data || result.data.length === 0) return null;

  const row = result.data[0];
  return {
    ...parseReport(row),
    assigned_osteo_name: row.osteo_prenom && row.osteo_nom 
      ? `${row.osteo_prenom} ${row.osteo_nom}` 
      : undefined,
    reviewer_name: row.reviewer_prenom && row.reviewer_nom
      ? `${row.reviewer_prenom} ${row.reviewer_nom}`
      : undefined
  };
}

// ===== ACTIONS WORKFLOW =====

/**
 * Assigner un rapport à un ostéo
 */
export async function assignToOsteo(
  reportId: number, 
  osteoId: number, 
  assignedBy: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const reportResult = await query<any>(
      `SELECT patient_firstname, patient_lastname, insurance_name FROM insurance_reports WHERE id = ?`,
      [reportId]
    );
    const report = reportResult.data?.[0];

    await query(`
      UPDATE insurance_reports 
      SET assigned_osteo_id = ?, status = 'assigned'
      WHERE id = ?
    `, [osteoId, reportId]);

    await addHistoryEntry(reportId, 'assigned', assignedBy);
    
    if (report) {
      const patientName = `${report.patient_firstname || ''} ${report.patient_lastname || ''}`.trim() || 'Patient';
      const { notifyReportAssigned } = await import('./notificationService');
      await notifyReportAssigned(osteoId, patientName, report.insurance_name || 'Assurance', reportId);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


/**
 * Marquer un rapport comme "en cours" (ostéo commence à le remplir)
 */
export async function startFilling(reportId: number, osteoId: number): Promise<{ success: boolean }> {
  await query(`
    UPDATE insurance_reports SET status = 'in_progress' WHERE id = ? AND assigned_osteo_id = ?
  `, [reportId, osteoId]);
  
  await addHistoryEntry(reportId, 'started_filling', osteoId);
  return { success: true };
}

/**
 * Soumettre un rapport pour validation
 */
export async function submitForReview(
  reportId: number, 
  osteoId: number,
  filledPdf?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates = filledPdf 
      ? `SET status = 'submitted_for_review', filled_pdf = ?, filled_filename = CONCAT('rapport_rempli_', id, '.pdf')`
      : `SET status = 'submitted_for_review'`;
    
    const params = filledPdf ? [filledPdf, reportId, osteoId] : [reportId, osteoId];
    
    await query(`
      UPDATE insurance_reports ${updates}
      WHERE id = ? AND assigned_osteo_id = ?
    `, params);

    await addHistoryEntry(reportId, 'submitted', osteoId, 'Rapport soumis pour validation');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Ajouter un commentaire de review (direction)
 */
export async function addReviewComment(
  reportId: number,
  reviewerId: number,
  comment: string,
  audioUrl?: string
): Promise<{ success: boolean }> {
  await query(`
    UPDATE insurance_reports 
    SET reviewer_id = ?, review_comment = ?, review_audio_url = ?
    WHERE id = ?
  `, [reviewerId, comment, audioUrl, reportId]);

  await addHistoryEntry(reportId, 'review_comment_added', reviewerId, comment);
  return { success: true };
}

/**
 * Demander une correction (direction → ostéo)
 */
export async function requestCorrection(
  reportId: number,
  reviewerId: number,
  comment: string
): Promise<{ success: boolean }> {
  await query(`
    UPDATE insurance_reports 
    SET status = 'needs_correction', reviewer_id = ?, review_comment = ?
    WHERE id = ?
  `, [reviewerId, comment, reportId]);

  await addHistoryEntry(reportId, 'correction_requested', reviewerId, comment);
  return { success: true };
}

/**
 * Approuver un rapport et l'attribuer à l'accueil pour envoi
 */
export async function approveAndAssignForSending(
  reportId: number,
  reviewerId: number,
  senderId?: number
): Promise<{ success: boolean }> {
  await query(`
    UPDATE insurance_reports 
    SET status = 'ready_to_send', reviewer_id = ?, assigned_sender_id = ?
    WHERE id = ?
  `, [reviewerId, senderId, reportId]);

  await addHistoryEntry(reportId, 'approved', reviewerId, 'Rapport validé');
  if (senderId) {
    await addHistoryEntry(reportId, 'assigned_for_sending', reviewerId, `Attribué pour envoi`);
  }
  return { success: true };
}

/**
 * Marquer un rapport comme envoyé
 */
export async function markAsSent(
  reportId: number,
  senderId: number,
  method: 'courrier' | 'email' | 'fax' = 'courrier'
): Promise<{ success: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  
  await query(`
    UPDATE insurance_reports 
    SET status = 'sent', sent_date = ?, sent_method = ?
    WHERE id = ?
  `, [today, method, reportId]);

  await addHistoryEntry(reportId, 'sent', senderId, `Envoyé par ${method}`);
  return { success: true };
}

/**
 * Archiver un rapport
 */
export async function archiveReport(reportId: number, archivedBy: number): Promise<{ success: boolean }> {
  await query(`UPDATE insurance_reports SET status = 'archived' WHERE id = ?`, [reportId]);
  await addHistoryEntry(reportId, 'archived', archivedBy);
  return { success: true };
}

// ===== ANNOTATIONS =====

/**
 * Récupérer les annotations d'un rapport
 */
export async function getReportAnnotations(reportId: number): Promise<ReportAnnotation[]> {
  const result = await query<any>(`
    SELECT * FROM insurance_report_annotations
    WHERE report_id = ?
    ORDER BY page_number, id
  `, [reportId]);

  return result.data || [];
}

/**
 * Sauvegarder les annotations d'un rapport
 */
export async function saveAnnotations(
  reportId: number,
  annotations: ReportAnnotation[],
  userId: number
): Promise<{ success: boolean }> {
  try {
    // Supprimer les anciennes annotations
    await query(`DELETE FROM insurance_report_annotations WHERE report_id = ?`, [reportId]);

    // Insérer les nouvelles
    for (const ann of annotations) {
      await query(`
        INSERT INTO insurance_report_annotations 
        (report_id, page_number, annotation_type, x_position, y_position, 
         width, height, content, font_size, font_family, color, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        reportId, ann.page_number, ann.annotation_type,
        ann.x_position, ann.y_position, ann.width, ann.height,
        ann.content, ann.font_size || 12, ann.font_family || 'Helvetica',
        ann.color || '#000000', userId
      ]);
    }

    await addHistoryEntry(reportId, 'saved_draft', userId, `${annotations.length} annotations sauvegardées`);
    return { success: true };
  } catch (error: any) {
    console.error('[InsuranceReport] Erreur sauvegarde annotations:', error);
    return { success: false };
  }
}

// ===== HISTORIQUE =====

/**
 * Récupérer l'historique d'un rapport
 */
export async function getReportHistory(reportId: number): Promise<ReportHistoryEntry[]> {
  const result = await query<any>(`
    SELECT 
      h.*,
      CONCAT(
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')), ' ',
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom'))
      ) AS performer_name
    FROM insurance_report_history h
    LEFT JOIN employees e ON h.performed_by = e.employee_id
    WHERE h.report_id = ?
    ORDER BY h.created_at DESC
  `, [reportId]);

  return result.data || [];
}

/**
 * Ajouter une entrée à l'historique
 */
async function addHistoryEntry(
  reportId: number,
  action: string,
  performedBy: number,
  comment?: string
): Promise<void> {
  await query(`
    INSERT INTO insurance_report_history (report_id, action, performed_by, comment)
    VALUES (?, ?, ?, ?)
  `, [reportId, action, performedBy, comment]);
}

// ===== STATISTIQUES =====

/**
 * Compter les rapports par statut
 */
export async function getReportCounts(): Promise<Record<ReportStatus, number>> {
  const result = await query<any>(`
    SELECT status, COUNT(*) as count
    FROM insurance_reports
    GROUP BY status
  `);

  const counts: Record<string, number> = {};
  for (const row of (result.data || [])) {
    counts[row.status] = row.count;
  }
  return counts as Record<ReportStatus, number>;
}

/**
 * Compter les rapports d'un ostéo
 */
export async function getOsteoReportCounts(osteoId: number): Promise<{ pending: number; inProgress: number; needsCorrection: number }> {
  const result = await query<any>(`
    SELECT 
      SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'needs_correction' THEN 1 ELSE 0 END) as needs_correction
    FROM insurance_reports
    WHERE assigned_osteo_id = ?
  `, [osteoId]);

  const row = result.data?.[0] || {};
  return {
    pending: row.pending || 0,
    inProgress: row.in_progress || 0,
    needsCorrection: row.needs_correction || 0
  };
}

// ===== UTILITAIRES =====

function parseReport(row: any): InsuranceReport {
  return {
    ...row,
    ai_extraction_data: row.ai_extraction_data 
      ? (typeof row.ai_extraction_data === 'string' 
          ? JSON.parse(row.ai_extraction_data) 
          : row.ai_extraction_data)
      : undefined,
    original_pdf: row.original_pdf 
      ? (typeof row.original_pdf === "object" 
          ? btoa(String.fromCharCode(...new Uint8Array(row.original_pdf))) 
          : row.original_pdf)
      : undefined,
    filled_pdf: row.filled_pdf
      ? (typeof row.filled_pdf === "object"
          ? btoa(String.fromCharCode(...new Uint8Array(row.filled_pdf)))
          : row.filled_pdf)
      : undefined
  };
}

// ===== LISTE DES OSTÉOS =====

/**
 * Récupérer la liste des ostéos pour l'attribution
 */
export async function getOsteoList(): Promise<{ id: number; name: string; pending_reports: number }[]> {
  const result = await query<any>(`
    SELECT 
      e.employee_id as id,
      CONCAT(
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')), ' ',
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom'))
      ) AS name,
      (SELECT COUNT(*) FROM insurance_reports ir 
       WHERE ir.assigned_osteo_id = e.employee_id 
       AND ir.status IN ('assigned', 'in_progress', 'needs_correction')) AS pending_reports
    FROM employees e
    WHERE JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif')) = 'true'
    ORDER BY name
  `);

  return result.data || [];
}

/**
 * Récupérer la liste des membres de l'accueil pour l'envoi
 */
export async function getReceptionList(): Promise<{ id: number; name: string }[]> {
  const result = await query<any>(`
    SELECT 
      e.employee_id as id,
      CONCAT(
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')), ' ',
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom'))
      ) AS name
    FROM employees e
    WHERE JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif')) = 'true'
    ORDER BY name
  `);

  return result.data || [];
}

