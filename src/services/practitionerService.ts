/**
 * Service pour récupérer les praticiens (ostéos) avec leurs infos
 */

import { query } from './mariadb';
import { getAllEmployeePhotos } from './employeePhotoService';

export interface Practitioner {
  employeeId: number;
  agendaId: number;
  nom: string;
  prenom: string;
  initials: string;
  color: string;
  photoUrl?: string;
}

// Couleurs pour les praticiens
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ec4899', 
  '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
  '#ef4444', '#84cc16', '#06b6d4', '#a855f7',
];

/**
 * Récupérer tous les praticiens actifs avec leur agenda_id
 */
export async function getAllPractitioners(): Promise<Practitioner[]> {
  // Récupérer les employés avec agenda_id
  const result = await query<any>(`
    SELECT 
      employee_id,
      profile_json
    FROM poge_erp.employees
    WHERE JSON_EXTRACT(profile_json, '$.hrStatus.collaborateur_actif') = true
      AND JSON_EXTRACT(profile_json, '$.externalIds.id_externe_agenda') IS NOT NULL
    ORDER BY JSON_EXTRACT(profile_json, '$.identification.nom')
  `);

  if (!result.success || !result.data) {
    console.error('[PractitionerService] Erreur:', result.error);
    return [];
  }
  
  // Récupérer toutes les photos
  const photos = await getAllEmployeePhotos();
  
  // Map pour dédupliquer par agenda_id (garder le premier = celui avec le plus petit employee_id)
  const seenAgendaIds = new Map<number, boolean>();

  const practitioners: Practitioner[] = [];
  
  result.data.forEach((row: any, index: number) => {
    const profile = typeof row.profile_json === 'string' 
      ? JSON.parse(row.profile_json) 
      : row.profile_json;
    
    const nom = profile.identification?.nom || '';
    const prenom = profile.identification?.prenom || '';
    const agendaIdStr = profile.externalIds?.id_externe_agenda;
    const agendaId = agendaIdStr ? parseInt(agendaIdStr, 10) : 0;
    
    // Éviter les doublons d'agenda_id (ex: Grégory vs Thibaut Nykiel)
    if (seenAgendaIds.has(agendaId)) {
      console.log(`[PractitionerService] Doublon agenda_id ${agendaId}: ${prenom} ${nom} ignoré`);
      return;
    }
    seenAgendaIds.set(agendaId, true);
    
    // Initiales : première lettre prénom + première lettre nom
    const initials = `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
    
    // Photo depuis employee_photos
    const photoData = photos.get(String(row.employee_id));
    
    practitioners.push({
      employeeId: row.employee_id,
      agendaId,
      nom,
      prenom,
      initials,
      color: COLORS[practitioners.length % COLORS.length],
      photoUrl: photoData || undefined,
    });
  });
  
  console.log(`[PractitionerService] ${practitioners.length} praticiens chargés`);
  return practitioners;
}

/**
 * Récupérer un praticien par son agenda_id
 */
export async function getPractitionerByAgendaId(agendaId: number): Promise<Practitioner | null> {
  const practitioners = await getAllPractitioners();
  return practitioners.find(p => p.agendaId === agendaId) || null;
}

/**
 * Créer un map agenda_id -> Practitioner pour accès rapide
 */
export async function getPractitionersMap(): Promise<Map<number, Practitioner>> {
  const practitioners = await getAllPractitioners();
  const map = new Map<number, Practitioner>();
  
  practitioners.forEach(p => {
    map.set(p.agendaId, p);
  });
  
  return map;
}
