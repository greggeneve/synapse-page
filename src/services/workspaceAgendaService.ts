/**
 * Service pour récupérer les RDV depuis la DB locale (miroir agenda.ch)
 */

import { query } from './mariadb';

export interface DBAppointment {
  id: number;
  start_at: string;
  end_at: string;
  duration: number;
  title: string | null;
  comment: string | null;
  agenda_id: number;
  customer_id: number;
  customer_confirmed: boolean;
  customer_no_show: boolean;
  price: number | null;
  // Infos patient jointes
  customer_firstname: string | null;
  customer_lastname: string | null;
  customer_sex: 'm' | 'f' | null;
  customer_birthdate: string | null;
  customer_mobile: string | null;
  customer_phone: string | null;
  customer_comment: string | null;
}

export interface DayAppointment {
  appointmentId: number;
  customerId: number;
  agendaId: number;
  customerName: string;
  customerFirstName: string;
  customerLastName: string;
  customerInitials: string;
  customerSex: 'm' | 'f' | null;
  customerPhone: string | null;
  customerBirthdate: string | null;
  customerNotes: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'no_show';
  hasArrived: boolean;
  notes: string | null;
  price: number | null;
}

/**
 * Récupérer les RDV d'une date donnée depuis la DB
 */
export async function getAppointmentsByDate(
  date: Date,
  agendaId?: number
): Promise<DayAppointment[]> {
  // Formater la date en local (pas UTC) pour éviter les décalages de timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  console.log('[workspaceAgenda] Chargement RDV pour:', dateStr);
  
  let sql = `
    SELECT 
      a.id,
      a.start_at,
      a.end_at,
      a.duration,
      a.title,
      a.comment,
      a.agenda_id,
      a.customer_id,
      a.customer_confirmed,
      a.customer_no_show,
      a.price,
      c.firstname as customer_firstname,
      c.lastname as customer_lastname,
      c.sex as customer_sex,
      c.birthdate as customer_birthdate,
      c.mobile as customer_mobile,
      c.phone as customer_phone,
      c.comment as customer_comment
    FROM poge_agenda.agenda_appointments a
    LEFT JOIN poge_agenda.agenda_customers c ON a.customer_id = c.id
    WHERE DATE(a.start_at) = ?
      AND a.enabled = 1
  `;
  
  const params: any[] = [dateStr];
  
  if (agendaId) {
    sql += ` AND a.agenda_id = ?`;
    params.push(agendaId);
  }
  
  sql += ` ORDER BY a.start_at ASC`;
  
  const result = await query<DBAppointment>(sql, params);
  
  console.log('[workspaceAgenda] Résultat DB:', {
    success: result.success,
    count: result.data?.length || 0,
    error: result.error
  });
  
  if (!result.success || !result.data) {
    console.error('[workspaceAgenda] Erreur:', result.error);
    return [];
  }
  
  // Transformer en format DayAppointment
  return result.data.map(apt => {
    const firstName = apt.customer_firstname || '';
    const lastName = apt.customer_lastname || '';
    const displayName = `${firstName} ${lastName}`.trim() || 'Patient inconnu';
    const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || '??';
    
    // Déterminer le statut
    let status: DayAppointment['status'] = 'scheduled';
    if (apt.customer_no_show) {
      status = 'no_show';
    }
    
    return {
      appointmentId: apt.id,
      customerId: apt.customer_id,
      agendaId: apt.agenda_id,
      customerName: displayName,
      customerFirstName: firstName,
      customerLastName: lastName,
      customerInitials: initials,
      customerSex: apt.customer_sex || null,
      customerPhone: apt.customer_mobile || apt.customer_phone,
      customerBirthdate: apt.customer_birthdate,
      customerNotes: apt.customer_comment,
      startTime: new Date(apt.start_at).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }),
      endTime: new Date(apt.end_at).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }),
      duration: apt.duration || Math.round((new Date(apt.end_at).getTime() - new Date(apt.start_at).getTime()) / 60000),
      status,
      hasArrived: false,
      notes: apt.comment || apt.title,
      price: apt.price
    };
  });
}

/**
 * Récupérer les stats d'une période
 */
export async function getAppointmentsStats(
  startDate: Date,
  endDate: Date,
  agendaId?: number
): Promise<{
  total: number;
  completed: number;
  noShow: number;
  totalCA: number;
}> {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  let sql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN customer_no_show = 1 THEN 1 ELSE 0 END) as no_show,
      SUM(COALESCE(price, 0)) as total_ca
    FROM poge_agenda.agenda_appointments
    WHERE DATE(start_at) BETWEEN ? AND ?
      AND enabled = 1
  `;
  
  const params: any[] = [startStr, endStr];
  
  if (agendaId) {
    sql += ` AND agenda_id = ?`;
    params.push(agendaId);
  }
  
  const result = await query<any>(sql, params);
  
  if (!result.success || !result.data || result.data.length === 0) {
    return { total: 0, completed: 0, noShow: 0, totalCA: 0 };
  }
  
  const row = result.data[0];
  return {
    total: row.total || 0,
    completed: (row.total || 0) - (row.no_show || 0),
    noShow: row.no_show || 0,
    totalCA: parseFloat(row.total_ca) || 0
  };
}

/**
 * Récupérer les infos d'un patient par son ID
 */
export async function getCustomerById(customerId: number): Promise<{
  id: number;
  firstName: string;
  lastName: string;
  birthdate: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
} | null> {
  const result = await query<any>(
    `SELECT id, firstname, lastname, birthdate, mobile, phone, email, comment 
     FROM poge_agenda.agenda_customers WHERE id = ?`,
    [customerId]
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }
  
  const c = result.data[0];
  return {
    id: c.id,
    firstName: c.firstname || '',
    lastName: c.lastname || '',
    birthdate: c.birthdate,
    phone: c.mobile || c.phone,
    email: c.email,
    notes: c.comment
  };
}
