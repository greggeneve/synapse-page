/**
 * Service de planning - Récupère les données depuis le miroir local agenda.ch
 */

import { query } from './mariadb';

export interface PlanningAppointment {
  id: number;
  start_at: string;
  end_at: string;
  title: string;
  enabled: boolean;
  agenda_id: number;
  customer_id: number;
  customer_confirmed: boolean;
  customer_no_show: boolean;
  // Données patient
  patient_firstname: string;
  patient_lastname: string;
  patient_mobile: string;
  patient_phone: string;
  patient_email: string;
  patient_birthdate: string;
  patient_city: string;
  // Statut salle d'attente (géré côté client via WebSocket)
  waitingRoom?: boolean;
  inConsultation?: boolean;
}

export interface DaySchedule {
  date: string;
  appointments: PlanningAppointment[];
  startHour: number;
  endHour: number;
}

/**
 * Récupérer les RDV d'une journée pour un praticien
 */
export async function getDayAppointments(
  agendaId: number,
  date: Date
): Promise<PlanningAppointment[]> {
  const dateStr = date.toISOString().split('T')[0];
  
  const result = await query<any>(`
    SELECT 
      a.id,
      a.start_at,
      a.end_at,
      a.title,
      a.enabled,
      a.agenda_id,
      a.customer_id,
      a.customer_confirmed,
      a.customer_no_show,
      c.firstname as patient_firstname,
      c.lastname as patient_lastname,
      c.mobile as patient_mobile,
      c.phone as patient_phone,
      c.email as patient_email,
      c.birthdate as patient_birthdate,
      c.city as patient_city
    FROM poge_agenda.agenda_appointments a
    LEFT JOIN poge_agenda.agenda_customers c ON a.customer_id = c.id
    WHERE DATE(a.start_at) = ?
      AND a.agenda_id = ?
      AND a.enabled = 1
    ORDER BY a.start_at ASC
  `, [dateStr, agendaId]);

  if (!result.success || !result.data) {
    console.error('Erreur récupération planning:', result.error);
    return [];
  }

  return result.data.map(row => ({
    ...row,
    enabled: row.enabled === 1,
    customer_confirmed: row.customer_confirmed === 1,
    customer_no_show: row.customer_no_show === 1,
  }));
}

/**
 * Récupérer les RDV d'une semaine
 */
export async function getWeekAppointments(
  agendaId: number,
  startDate: Date
): Promise<Map<string, PlanningAppointment[]>> {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  const result = await query<any>(`
    SELECT 
      a.id,
      DATE(a.start_at) as day_date,
      a.start_at,
      a.end_at,
      a.title,
      a.enabled,
      a.agenda_id,
      a.customer_id,
      a.customer_confirmed,
      a.customer_no_show,
      c.firstname as patient_firstname,
      c.lastname as patient_lastname,
      c.mobile as patient_mobile,
      c.phone as patient_phone,
      c.email as patient_email,
      c.birthdate as patient_birthdate,
      c.city as patient_city
    FROM poge_agenda.agenda_appointments a
    LEFT JOIN poge_agenda.agenda_customers c ON a.customer_id = c.id
    WHERE DATE(a.start_at) BETWEEN ? AND ?
      AND a.agenda_id = ?
      AND a.enabled = 1
    ORDER BY a.start_at ASC
  `, [startStr, endStr, agendaId]);

  const byDay = new Map<string, PlanningAppointment[]>();
  
  if (result.success && result.data) {
    for (const row of result.data) {
      const dayKey = row.day_date;
      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, []);
      }
      byDay.get(dayKey)!.push({
        ...row,
        enabled: row.enabled === 1,
        customer_confirmed: row.customer_confirmed === 1,
        customer_no_show: row.customer_no_show === 1,
      });
    }
  }

  return byDay;
}

/**
 * Récupérer les RDV d'un mois
 */
export async function getMonthAppointments(
  agendaId: number,
  year: number,
  month: number
): Promise<Map<string, PlanningAppointment[]>> {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  const result = await query<any>(`
    SELECT 
      a.id,
      DATE(a.start_at) as day_date,
      a.start_at,
      a.end_at,
      a.title,
      a.enabled,
      a.agenda_id,
      a.customer_id,
      a.customer_confirmed,
      a.customer_no_show,
      c.firstname as patient_firstname,
      c.lastname as patient_lastname,
      c.mobile as patient_mobile,
      c.phone as patient_phone,
      c.email as patient_email,
      c.birthdate as patient_birthdate,
      c.city as patient_city
    FROM poge_agenda.agenda_appointments a
    LEFT JOIN poge_agenda.agenda_customers c ON a.customer_id = c.id
    WHERE DATE(a.start_at) BETWEEN ? AND ?
      AND a.agenda_id = ?
      AND a.enabled = 1
    ORDER BY a.start_at ASC
  `, [startStr, endStr, agendaId]);

  const byDay = new Map<string, PlanningAppointment[]>();
  
  if (result.success && result.data) {
    for (const row of result.data) {
      const dayKey = row.day_date;
      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, []);
      }
      byDay.get(dayKey)!.push({
        ...row,
        enabled: row.enabled === 1,
        customer_confirmed: row.customer_confirmed === 1,
        customer_no_show: row.customer_no_show === 1,
      });
    }
  }

  return byDay;
}

/**
 * Compter les RDV par jour pour un mois (pour la vue mensuelle)
 */
export async function getMonthSummary(
  agendaId: number,
  year: number,
  month: number
): Promise<Map<string, number>> {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  const result = await query<any>(`
    SELECT 
      DATE(start_at) as day_date,
      COUNT(*) as count
    FROM poge_agenda.agenda_appointments
    WHERE DATE(start_at) BETWEEN ? AND ?
      AND agenda_id = ?
      AND enabled = 1
    GROUP BY DATE(start_at)
  `, [startStr, endStr, agendaId]);

  const summary = new Map<string, number>();
  
  if (result.success && result.data) {
    for (const row of result.data) {
      summary.set(row.day_date, row.count);
    }
  }

  return summary;
}

/**
 * Calculer l'âge à partir de la date de naissance
 */
export function calculateAge(birthdate: string | null): number | null {
  if (!birthdate) return null;
  
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Formater l'heure
 */
export function formatTime(datetime: string): string {
  const date = new Date(datetime);
  return date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formater la date
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-CH', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long',
    year: 'numeric'
  });
}

