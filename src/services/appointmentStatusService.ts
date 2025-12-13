/**
 * Service de gestion des statuts de rendez-vous
 * Permet de tracker l'arrivée des patients, début/fin de consultation
 */

import { query } from './mariadb';

export type AppointmentStatus = 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'no_show';

export type PatientZone = 'outside' | 'waiting-room-inf' | 'waiting-room-sup' | 'reception' | string;

export interface AppointmentStatusRecord {
  id: number;
  appointment_id: number;
  date_rdv: string;
  agenda_id: number;
  status: AppointmentStatus;
  current_zone: PatientZone;
  arrived_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  marked_arrived_by: number | null;
  marked_started_by: number | null;
  marked_ended_by: number | null;
  notes: string | null;
}

/**
 * Récupérer le statut d'un RDV
 */
export async function getAppointmentStatus(
  appointmentId: number,
  dateRdv: string
): Promise<AppointmentStatusRecord | null> {
  const result = await query<AppointmentStatusRecord>(
    `SELECT * FROM poge_erp.appointment_status WHERE appointment_id = ? AND date_rdv = ?`,
    [appointmentId, dateRdv]
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }
  
  return result.data[0];
}

/**
 * Récupérer tous les statuts pour une date (tous les praticiens)
 */
export async function getStatusesByDate(dateRdv: string): Promise<AppointmentStatusRecord[]> {
  const result = await query<AppointmentStatusRecord>(
    `SELECT * FROM poge_erp.appointment_status WHERE date_rdv = ? ORDER BY arrived_at DESC`,
    [dateRdv]
  );
  
  return result.success && result.data ? result.data : [];
}

/**
 * Récupérer les statuts pour un praticien à une date
 */
export async function getStatusesByAgenda(
  agendaId: number,
  dateRdv: string
): Promise<AppointmentStatusRecord[]> {
  const result = await query<AppointmentStatusRecord>(
    `SELECT * FROM poge_erp.appointment_status WHERE agenda_id = ? AND date_rdv = ?`,
    [agendaId, dateRdv]
  );
  
  return result.success && result.data ? result.data : [];
}

/**
 * Récupérer les patients en salle d'attente (status = 'arrived')
 */
export async function getWaitingPatients(dateRdv: string): Promise<AppointmentStatusRecord[]> {
  const result = await query<AppointmentStatusRecord>(
    `SELECT * FROM poge_erp.appointment_status 
     WHERE date_rdv = ? AND status = 'arrived'
     ORDER BY arrived_at ASC`,
    [dateRdv]
  );
  
  return result.success && result.data ? result.data : [];
}

/**
 * Récupérer les patients en salle d'attente pour un praticien
 */
export async function getWaitingPatientsForAgenda(
  agendaId: number,
  dateRdv: string
): Promise<AppointmentStatusRecord[]> {
  const result = await query<AppointmentStatusRecord>(
    `SELECT * FROM poge_erp.appointment_status 
     WHERE agenda_id = ? AND date_rdv = ? AND status = 'arrived'
     ORDER BY arrived_at ASC`,
    [agendaId, dateRdv]
  );
  
  return result.success && result.data ? result.data : [];
}

/**
 * Marquer un patient comme arrivé (appelé par l'accueil)
 */
export async function markPatientArrived(
  appointmentId: number,
  dateRdv: string,
  agendaId: number,
  markedBy: number,
  zone: PatientZone = 'waiting-room-inf'
): Promise<boolean> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const result = await query(
    `INSERT INTO poge_erp.appointment_status 
       (appointment_id, date_rdv, agenda_id, status, current_zone, arrived_at, marked_arrived_by)
     VALUES (?, ?, ?, 'arrived', ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       status = 'arrived',
       current_zone = VALUES(current_zone),
       arrived_at = COALESCE(arrived_at, VALUES(arrived_at)),
       marked_arrived_by = VALUES(marked_arrived_by),
       updated_at = CURRENT_TIMESTAMP`,
    [appointmentId, dateRdv, agendaId, zone, now, markedBy]
  );
  
  return result.success;
}

/**
 * Mettre à jour la zone d'un patient (déplacement sur le plan)
 */
export async function updatePatientZone(
  appointmentId: number,
  dateRdv: string,
  agendaId: number,
  zone: PatientZone,
  markedBy?: number
): Promise<boolean> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // Déterminer le statut en fonction de la zone
  let status: AppointmentStatus = 'scheduled';
  if (zone === 'outside') {
    status = 'scheduled';
  } else if (zone.startsWith('waiting-room') || zone === 'reception') {
    status = 'arrived';
  } else if (zone.startsWith('room-') || zone.startsWith('101') || zone.startsWith('102') || 
             zone.startsWith('103') || zone.startsWith('104') || zone.startsWith('105') || 
             zone.startsWith('106') || zone.startsWith('121') || zone.startsWith('122') ||
             zone.startsWith('123') || zone.startsWith('124')) {
    status = 'in_progress';
  }
  
  const result = await query(
    `INSERT INTO poge_erp.appointment_status 
       (appointment_id, date_rdv, agenda_id, status, current_zone, arrived_at, marked_arrived_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       status = VALUES(status),
       current_zone = VALUES(current_zone),
       arrived_at = CASE 
         WHEN VALUES(status) IN ('arrived', 'in_progress', 'completed') AND arrived_at IS NULL 
         THEN VALUES(arrived_at) 
         ELSE arrived_at 
       END,
       started_at = CASE 
         WHEN VALUES(status) = 'in_progress' AND started_at IS NULL 
         THEN VALUES(arrived_at) 
         ELSE started_at 
       END,
       updated_at = CURRENT_TIMESTAMP`,
    [appointmentId, dateRdv, agendaId, status, zone, now, markedBy || null]
  );
  
  return result.success;
}

/**
 * Récupérer toutes les zones des patients pour une date
 */
export async function getPatientZones(dateRdv: string): Promise<{ appointmentId: number; zone: PatientZone }[]> {
  const result = await query<{ appointment_id: number; current_zone: PatientZone }>(
    `SELECT appointment_id, current_zone FROM poge_erp.appointment_status WHERE date_rdv = ?`,
    [dateRdv]
  );
  
  if (!result.success || !result.data) {
    return [];
  }
  
  return result.data.map(row => ({
    appointmentId: row.appointment_id,
    zone: row.current_zone || 'outside'
  }));
}

/**
 * Démarrer une consultation (appelé par l'ostéo)
 */
export async function startConsultation(
  appointmentId: number,
  dateRdv: string,
  agendaId: number,
  markedBy: number
): Promise<boolean> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // D'abord vérifier si le patient est arrivé
  const existing = await getAppointmentStatus(appointmentId, dateRdv);
  
  if (existing) {
    // Mettre à jour le statut existant
    const result = await query(
      `UPDATE poge_erp.appointment_status 
       SET status = 'in_progress', 
           started_at = ?,
           marked_started_by = ?
       WHERE appointment_id = ? AND date_rdv = ?`,
      [now, markedBy, appointmentId, dateRdv]
    );
    return result.success;
  } else {
    // Créer un nouveau record (patient pas marqué arrivé, démarrage direct)
    const result = await query(
      `INSERT INTO poge_erp.appointment_status 
         (appointment_id, date_rdv, agenda_id, status, started_at, marked_started_by)
       VALUES (?, ?, ?, 'in_progress', ?, ?)`,
      [appointmentId, dateRdv, agendaId, now, markedBy]
    );
    return result.success;
  }
}

/**
 * Terminer une consultation
 */
export async function endConsultation(
  appointmentId: number,
  dateRdv: string,
  markedBy: number
): Promise<boolean> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const result = await query(
    `UPDATE poge_erp.appointment_status 
     SET status = 'completed', 
         ended_at = ?,
         marked_ended_by = ?
     WHERE appointment_id = ? AND date_rdv = ?`,
    [now, markedBy, appointmentId, dateRdv]
  );
  
  return result.success;
}

/**
 * Marquer un patient comme absent (no-show)
 */
export async function markNoShow(
  appointmentId: number,
  dateRdv: string,
  agendaId: number,
  markedBy: number
): Promise<boolean> {
  const result = await query(
    `INSERT INTO poge_erp.appointment_status 
       (appointment_id, date_rdv, agenda_id, status, marked_arrived_by)
     VALUES (?, ?, ?, 'no_show', ?)
     ON DUPLICATE KEY UPDATE 
       status = 'no_show',
       marked_arrived_by = VALUES(marked_arrived_by),
       updated_at = CURRENT_TIMESTAMP`,
    [appointmentId, dateRdv, agendaId, markedBy]
  );
  
  return result.success;
}

/**
 * Annuler l'arrivée d'un patient (erreur de saisie)
 */
export async function cancelArrival(
  appointmentId: number,
  dateRdv: string
): Promise<boolean> {
  const result = await query(
    `UPDATE poge_erp.appointment_status 
     SET status = 'scheduled', 
         arrived_at = NULL,
         marked_arrived_by = NULL
     WHERE appointment_id = ? AND date_rdv = ? AND status = 'arrived'`,
    [appointmentId, dateRdv]
  );
  
  return result.success;
}

/**
 * Obtenir les statistiques du jour
 */
export async function getDayStats(dateRdv: string): Promise<{
  total: number;
  arrived: number;
  inProgress: number;
  completed: number;
  noShow: number;
}> {
  const result = await query<{ status: AppointmentStatus; count: number }>(
    `SELECT status, COUNT(*) as count 
     FROM poge_erp.appointment_status 
     WHERE date_rdv = ?
     GROUP BY status`,
    [dateRdv]
  );
  
  const stats = {
    total: 0,
    arrived: 0,
    inProgress: 0,
    completed: 0,
    noShow: 0
  };
  
  if (result.success && result.data) {
    for (const row of result.data) {
      stats.total += row.count;
      switch (row.status) {
        case 'arrived': stats.arrived = row.count; break;
        case 'in_progress': stats.inProgress = row.count; break;
        case 'completed': stats.completed = row.count; break;
        case 'no_show': stats.noShow = row.count; break;
      }
    }
  }
  
  return stats;
}
