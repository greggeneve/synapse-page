import { query } from './mariadb';
import type { TeamMember } from '../types';

// Récupérer les membres de l'équipe actifs depuis la DB
// Utilise v_active_employees (règle: date_sortie NULL ou future)
export async function getActiveTeamMembers(): Promise<TeamMember[]> {
  const result = await query<any>(`
    SELECT 
      employee_id,
      profile_json
    FROM v_active_employees
    ORDER BY nom
  `);

  if (!result.success || !result.data) {
    console.error('Erreur chargement équipe:', result.error);
    return [];
  }

  return result.data.map(row => {
    const profile = typeof row.profile_json === 'string' 
      ? JSON.parse(row.profile_json) 
      : row.profile_json;
    
    return {
      id: row.employee_id,
      nom: profile.identification?.nom || '',
      prenom: profile.identification?.prenom || '',
      fonction: profile.hrStatus?.statut_dans_societe || 'Ostéopathe',
      photo_url: profile.identification?.photo_url,
      email_professionnel: profile.contact?.email_professionnel,
      actif: profile.hrStatus?.collaborateur_actif ?? true
    };
  });
}

// Récupérer un membre spécifique
export async function getTeamMember(employeeId: string): Promise<TeamMember | null> {
  const result = await query<any>(`
    SELECT employee_id, profile_json
    FROM employees 
    WHERE employee_id = ?
  `, [employeeId]);

  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }

  const row = result.data[0];
  const profile = typeof row.profile_json === 'string' 
    ? JSON.parse(row.profile_json) 
    : row.profile_json;

  return {
    id: row.employee_id,
    nom: profile.identification?.nom || '',
    prenom: profile.identification?.prenom || '',
    fonction: profile.hrStatus?.statut_dans_societe || 'Ostéopathe',
    photo_url: profile.identification?.photo_url,
    email_professionnel: profile.contact?.email_professionnel,
    actif: profile.hrStatus?.collaborateur_actif ?? true
  };
}

