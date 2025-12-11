/**
 * Service de notifications pour les employés
 */

import { query } from './mariadb';

export interface Notification {
  id: number;
  employee_id: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

/**
 * Créer une notification pour un employé
 */
export async function createNotification(
  employeeId: number,
  type: string,
  title: string,
  message?: string,
  link?: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO employee_notifications (employee_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
      [employeeId, type, title, message || null, link || null]
    );
    console.log(`[Notification] Créée pour employé ${employeeId}: ${title}`);
    return true;
  } catch (error) {
    console.error('[Notification] Erreur création:', error);
    return false;
  }
}

/**
 * Récupérer les notifications non lues d'un employé
 */
export async function getUnreadNotifications(employeeId: number): Promise<Notification[]> {
  const result = await query<Notification>(
    `SELECT * FROM employee_notifications 
     WHERE employee_id = ? AND is_read = FALSE 
     ORDER BY created_at DESC 
     LIMIT 20`,
    [employeeId]
  );
  return result.data || [];
}

/**
 * Compter les notifications non lues
 */
export async function getUnreadCount(employeeId: number): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM employee_notifications 
     WHERE employee_id = ? AND is_read = FALSE`,
    [employeeId]
  );
  return result.data?.[0]?.count || 0;
}

/**
 * Récupérer toutes les notifications d'un employé (lues et non lues)
 */
export async function getAllNotifications(employeeId: number, limit: number = 50): Promise<Notification[]> {
  const result = await query<Notification>(
    `SELECT * FROM employee_notifications 
     WHERE employee_id = ? 
     ORDER BY created_at DESC 
     LIMIT ?`,
    [employeeId, limit]
  );
  return result.data || [];
}

/**
 * Marquer une notification comme lue
 */
export async function markAsRead(notificationId: number): Promise<boolean> {
  try {
    await query(
      `UPDATE employee_notifications SET is_read = TRUE, read_at = NOW() WHERE id = ?`,
      [notificationId]
    );
    return true;
  } catch (error) {
    console.error('[Notification] Erreur markAsRead:', error);
    return false;
  }
}

/**
 * Marquer toutes les notifications comme lues
 */
export async function markAllAsRead(employeeId: number): Promise<boolean> {
  try {
    await query(
      `UPDATE employee_notifications SET is_read = TRUE, read_at = NOW() WHERE employee_id = ? AND is_read = FALSE`,
      [employeeId]
    );
    return true;
  } catch (error) {
    console.error('[Notification] Erreur markAllAsRead:', error);
    return false;
  }
}

/**
 * Supprimer les anciennes notifications (plus de 30 jours)
 */
export async function cleanupOldNotifications(): Promise<void> {
  await query(
    `DELETE FROM employee_notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND is_read = TRUE`
  );
}

// === Notifications spécifiques ===

/**
 * Notifier un ostéo qu'un rapport lui a été assigné
 */
export async function notifyReportAssigned(
  osteoId: number,
  patientName: string,
  insuranceName: string,
  reportId: number
): Promise<void> {
  await createNotification(
    osteoId,
    'insurance_report_assigned',
    'Nouveau rapport d\'assurance',
    `Rapport ${insuranceName} pour ${patientName} vous a été assigné`,
    `/insurance-report/${reportId}`
  );
}

/**
 * Notifier qu'un rapport nécessite des corrections
 */
export async function notifyReportNeedsCorrection(
  osteoId: number,
  patientName: string,
  reportId: number
): Promise<void> {
  await createNotification(
    osteoId,
    'insurance_report_correction',
    'Rapport à corriger',
    `Le rapport pour ${patientName} nécessite des corrections`,
    `/insurance-report/${reportId}`
  );
}

/**
 * Notifier la direction qu'un rapport est soumis pour validation
 */
export async function notifyReportSubmitted(
  directorId: number,
  osteoName: string,
  patientName: string,
  reportId: number
): Promise<void> {
  await createNotification(
    directorId,
    'insurance_report_submitted',
    'Rapport à valider',
    `${osteoName} a soumis le rapport pour ${patientName}`,
    `/insurance-report/${reportId}`
  );
}
