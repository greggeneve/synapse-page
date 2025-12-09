/**
 * Service d'intégration avec agenda.ch
 * API Documentation: https://pro.agenda.ch/api
 * 
 * CONFIGURATION REQUISE:
 * Ajoutez dans .env.local : VITE_AGENDA_API_TOKEN=votre_cle_api
 * 
 * LIMITES: 100 requêtes/heure
 */

const API_BASE = 'https://pro.agenda.ch/api';
const API_TOKEN = import.meta.env.VITE_AGENDA_API_TOKEN;

// Types pour agenda.ch
export interface AgendaCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  birthdate?: string;
  gender?: 'male' | 'female';
  address?: string;
  zip?: string;
  city?: string;
  country?: string;
  notes?: string;           // Antécédents et notes importantes
  created_at: string;
  updated_at: string;
}

export interface AgendaAppointment {
  id: number;
  customer_id: number;
  employee_id?: number;     // ID de l'ostéo dans agenda.ch
  service_id?: number;
  start_at: string;         // ISO datetime
  end_at: string;
  duration: number;         // minutes
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relations
  customer?: AgendaCustomer;
}

export interface AgendaEmployee {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
}

// Cache pour limiter les appels API (100/h max)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Appel API générique
async function apiCall<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!API_TOKEN) {
    console.error('VITE_AGENDA_API_TOKEN non configuré dans .env.local');
    return null;
  }

  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('token', API_TOKEN);
  
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const cacheKey = url.toString();
  const cached = getCached<T>(cacheKey);
  if (cached) {
    console.log(`[agenda.ch] Cache hit: ${endpoint}`);
    return cached;
  }

  try {
    console.log(`[agenda.ch] API call: ${endpoint}`);
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error(`[agenda.ch] Erreur ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    setCache(cacheKey, data);
    return data as T;
  } catch (error) {
    console.error('[agenda.ch] Erreur réseau:', error);
    return null;
  }
}

// === PATIENTS ===

/**
 * Récupérer tous les patients (avec cache)
 */
export async function getCustomers(updatedAfter?: string): Promise<AgendaCustomer[]> {
  const params: Record<string, string> = {};
  if (updatedAfter) params.updated_after = updatedAfter;
  
  const result = await apiCall<AgendaCustomer[]>('customers_v3', params);
  return result || [];
}

/**
 * Récupérer un patient par ID
 */
export async function getCustomerById(customerId: number): Promise<AgendaCustomer | null> {
  const customers = await getCustomers();
  return customers.find(c => c.id === customerId) || null;
}

/**
 * Rechercher un patient par nom
 */
export async function searchCustomers(query: string): Promise<AgendaCustomer[]> {
  const customers = await getCustomers();
  const lowerQuery = query.toLowerCase();
  
  return customers.filter(c => 
    c.first_name?.toLowerCase().includes(lowerQuery) ||
    c.last_name?.toLowerCase().includes(lowerQuery) ||
    c.email?.toLowerCase().includes(lowerQuery)
  );
}

// === RENDEZ-VOUS ===

/**
 * Récupérer les rendez-vous du jour pour un ostéo
 */
export async function getTodayAppointments(employeeId?: number): Promise<AgendaAppointment[]> {
  const today = new Date();
  const dateFrom = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const dateTo = new Date(today.setHours(23, 59, 59, 999)).toISOString();
  
  return getAppointments({ dateFrom, dateTo, employeeId });
}

/**
 * Récupérer les rendez-vous avec filtres
 */
export async function getAppointments(filters: {
  dateFrom?: string;
  dateTo?: string;
  customerId?: number;
  employeeId?: number;
  updatedAfter?: string;
}): Promise<AgendaAppointment[]> {
  const params: Record<string, string> = {};
  
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  if (filters.customerId) params.customer_id = filters.customerId.toString();
  if (filters.updatedAfter) params.updated_after = filters.updatedAfter;
  
  const result = await apiCall<AgendaAppointment[]>('appointments', params);
  let appointments = result || [];
  
  // Filtrer par employé côté client si nécessaire
  if (filters.employeeId) {
    appointments = appointments.filter(a => a.employee_id === filters.employeeId);
  }
  
  // Trier par heure de début
  appointments.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  
  return appointments;
}

/**
 * Récupérer les rendez-vous d'un patient avec ses antécédents
 */
export async function getPatientHistory(customerId: number): Promise<{
  customer: AgendaCustomer | null;
  appointments: AgendaAppointment[];
}> {
  const [customer, appointments] = await Promise.all([
    getCustomerById(customerId),
    getAppointments({ customerId })
  ]);
  
  return { customer, appointments };
}

// === MAPPING EMPLOYÉS agenda.ch <-> poge_erp ===

// Cache du mapping (à configurer dans les settings admin)
let employeeMapping: Map<number, number> | null = null; // agenda.ch ID -> poge_erp ID

/**
 * Configurer le mapping des employés
 * À appeler au démarrage avec les données de la DB
 */
export function setEmployeeMapping(mapping: Map<number, number>): void {
  employeeMapping = mapping;
}

/**
 * Obtenir l'ID agenda.ch d'un employé poge_erp
 */
export function getAgendaEmployeeId(pogeEmployeeId: number): number | null {
  if (!employeeMapping) return null;
  
  for (const [agendaId, pogeId] of employeeMapping.entries()) {
    if (pogeId === pogeEmployeeId) return agendaId;
  }
  return null;
}

// === UTILITAIRES ===

/**
 * Formater un patient pour l'affichage (sans données sensibles pour l'IA)
 */
export function formatPatientForDisplay(customer: AgendaCustomer): {
  displayName: string;
  initials: string;
  age: number | null;
  notes: string;
} {
  const displayName = `${customer.first_name} ${customer.last_name}`;
  const initials = `${customer.first_name?.[0] || ''}${customer.last_name?.[0] || ''}`.toUpperCase();
  
  let age: number | null = null;
  if (customer.birthdate) {
    const birth = new Date(customer.birthdate);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }
  
  return {
    displayName,
    initials,
    age,
    notes: customer.notes || ''
  };
}

/**
 * Extraire les antécédents pour pré-remplir l'anamnèse (sans données sensibles)
 */
export function extractAntecedentsForAI(customer: AgendaCustomer): string {
  const parts: string[] = [];
  
  // Âge et genre (pas de nom ni date exacte)
  const { age } = formatPatientForDisplay(customer);
  if (age) parts.push(`Patient de ${age} ans`);
  if (customer.gender) {
    parts.push(customer.gender === 'male' ? '(homme)' : '(femme)');
  }
  
  // Notes/antécédents
  if (customer.notes) {
    parts.push(`\nAntécédents connus: ${customer.notes}`);
  }
  
  return parts.join(' ');
}

/**
 * Formater l'heure d'un RDV
 */
export function formatAppointmentTime(appointment: AgendaAppointment): string {
  const start = new Date(appointment.start_at);
  return start.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Vérifier si l'API est configurée
 */
export function isAgendaConfigured(): boolean {
  return !!API_TOKEN;
}

/**
 * Vider le cache (utile pour forcer un refresh)
 */
export function clearCache(): void {
  cache.clear();
  console.log('[agenda.ch] Cache vidé');
}

