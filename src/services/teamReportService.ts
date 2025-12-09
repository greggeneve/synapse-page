import { query } from './mariadb';
import { getEmployeePhoto } from './employeePhotoService';

/**
 * Membre de l'équipe pour les rapports PDF
 * Triés par hiérarchie puis ancienneté
 */
export interface ReportTeamMember {
  id: number;
  nom: string;
  prenom: string;
  fonction: string;
  photo_url?: string;
  date_entree: string;
  // Pour le tri
  hierarchyLevel: number;
  // Pour l'affichage sur le PDF
  displayTitle: string;       // Ex: "Responsable de Clinique"
  certifications: string[];   // Ex: ["Certifié C.D.S", "Membre OstéoSwiss"]
  rme_rcc?: string;          // Ex: "RME RCC U226560"
}

/**
 * Mapping des fonctions vers les niveaux hiérarchiques
 * Plus le niveau est bas, plus c'est haut dans la hiérarchie
 * 
 * ORDRE SPÉCIAL DEMANDÉ:
 * 1. Grégory Nykiel (toujours en premier)
 * 2. Pascal Pagano (toujours en second)
 * 3. Chefs de clinique adjoints (par ancienneté)
 * 4. Stagiaires CRS (par ancienneté)
 * 5. Stagiaires HedS (par ancienneté)
 */
const HIERARCHY_LEVELS: Record<string, number> = {
  'Directeur': 1,
  'Directeur adjoint': 1,  // Pascal Pagano
  'Responsable de Clinique': 1,
  'Resp. de Clinique': 1,
  'Responsable de Clinique Adjoint': 2,
  'Resp. de Clinique Adjoint': 2,
  'Cheffe de Clinique adjointe': 2,
  'Cheffe de Clinique Adjointe': 2,  // Alexia Rui
  'Cheffe de Clinique adjonte': 2,  // Faute de frappe dans la DB pour Pauline
  'Chef de Clinique adjoint': 2,
  'Chef de Clinique Adjoint': 2,  // Jonathan Spaens
  'Ostéopathe Senior': 3,
  'Ostéopathe': 4,
  'Stagiaire CRS': 5,
  'Stagiaire CDS': 5,
  'Stagiaire HedS': 6,
  'Stagiaire': 7,
  'Administratif': 99,
  'Administration': 99,
};

/**
 * Personnes avec un ordre fixe en tête de liste (prénom nom en minuscules)
 */
const FIXED_ORDER_NAMES: string[] = [
  'grégory nykiel',   // Toujours en premier
  'pascal pagano',    // Toujours en second
];

/**
 * Mapping des fonctions vers les titres d'affichage PDF
 */
/**
 * Titres d'affichage - peut être une seule ligne ou plusieurs lignes (séparées par \n)
 */
const DISPLAY_TITLES: Record<string, string> = {
  'Directeur': 'Directeur\nResponsable de Clinique',  // Grégory Nykiel - 2 lignes
  'Directeur adjoint': 'Directeur Adjoint\nResponsable de Clinique',  // Pascal Pagano - 2 lignes
  'Responsable de Clinique': 'Responsable de Clinique',
  'Resp. de Clinique': 'Responsable de Clinique',
  'Responsable de Clinique Adjoint': 'Resp. de Clinique Adjoint',
  'Resp. de Clinique Adjoint': 'Resp. de Clinique Adjoint',
  'Cheffe de Clinique adjointe': 'Resp. de Clinique Adjointe',
  'Cheffe de Clinique Adjointe': 'Resp. de Clinique Adjointe',  // Alexia Rui
  'Cheffe de Clinique adjonte': 'Resp. de Clinique Adjointe',  // Faute de frappe DB - Pauline
  'Chef de Clinique adjoint': 'Resp. de Clinique Adjoint',
  'Chef de Clinique Adjoint': 'Resp. de Clinique Adjoint',  // Jonathan Spaens
  'Ostéopathe Senior': 'Ostéopathe Senior',
  'Ostéopathe': 'Ostéopathe',
  'Stagiaire CRS': 'Stagiaire CRS',
  'Stagiaire CDS': 'Stagiaire CDS',
  'Stagiaire HedS': 'Stagiaire HedS',
  'Stagiaire': 'Stagiaire',
};

/**
 * Certifications par défaut selon le type de poste
 * À terme, à stocker dans la DB
 */
const DEFAULT_CERTIFICATIONS: Record<string, string[]> = {
  'Directeur\nResponsable de Clinique': ['Certifié C.D.S', 'Membre OstéoSwiss'],  // Grégory
  'Directeur Adjoint\nResponsable de Clinique': ['Certifié C.D.S', 'Membre OstéoSwiss'],  // Pascal
  'Responsable de Clinique': ['Certifié C.D.S', 'Membre OstéoSwiss'],
  'Resp. de Clinique Adjoint': ['Certifié C.D.S', 'Membre OstéoSwiss'],
  'Resp. de Clinique Adjointe': ['Certifié C.D.S'],
  'Ostéopathe Senior': ['Certifié C.D.S'],
  'Ostéopathe': ['Certifié C.D.S'],
  'Stagiaire CRS': [],  // Pas de certification affichée pour les stagiaires
  'Stagiaire CDS': [],
  'Stagiaire HedS': [],
};

/**
 * Récupère l'équipe active triée pour les rapports PDF
 */
export async function getReportTeam(): Promise<ReportTeamMember[]> {
  try {
    const result = await query<{ employee_id: number; profile_json: any }>(
      `SELECT employee_id, profile_json 
       FROM employees 
       WHERE JSON_EXTRACT(profile_json, '$.hrStatus.collaborateur_actif') = true
       ORDER BY employee_id`,
      []
    );

    if (!result.success || !result.data) {
      return [];
    }

    const members: ReportTeamMember[] = [];

    for (const row of result.data) {
      const profile = typeof row.profile_json === 'string' 
        ? JSON.parse(row.profile_json) 
        : row.profile_json;

      const fonction = profile.hrStatus?.statut_dans_societe || '';
      const hierarchyLevel = HIERARCHY_LEVELS[fonction] ?? 99;
      
      // Ne pas inclure les administratifs dans l'équipe médicale des rapports
      if (hierarchyLevel >= 8) continue;
      
      // Vérifier si l'employé a une date de sortie passée
      const dateSortie = profile.hrStatus?.date_sortie;
      if (dateSortie) {
        const sortieDate = new Date(dateSortie);
        const today = new Date();
        if (sortieDate <= today) {
          // L'employé est parti, on ne l'inclut pas
          continue;
        }
      }

      // Récupérer la photo
      const photoUrl = await getEmployeePhoto(row.employee_id);

      // Déterminer le titre d'affichage
      let displayTitle = DISPLAY_TITLES[fonction] || fonction;
      
      // Ajuster le genre si nécessaire (Adjointe au lieu d'Adjoint pour les femmes)
      if (profile.identification?.sexe === 'F' && displayTitle.includes('Adjoint') && !displayTitle.includes('Adjointe')) {
        displayTitle = displayTitle.replace('Adjoint', 'Adjointe');
      }

      // Certifications (accordées au genre)
      const baseCertifications = DEFAULT_CERTIFICATIONS[displayTitle] || [];
      const isFemale = profile.identification?.sexe === 'F';
      
      // Accorder "Certifié(e)" selon le genre
      const certifications = baseCertifications.map(cert => {
        if (cert === 'Certifié C.D.S') {
          return isFemale ? 'Certifiée C.D.S' : 'Certifié C.D.S';
        }
        return cert;
      });

      // RME RCC depuis externalIds
      const rme_rcc = profile.externalIds?.rme_rcc || profile.externalIds?.id_externe_RME;

      members.push({
        id: row.employee_id,
        nom: profile.identification?.nom || '',
        prenom: profile.identification?.prenom || '',
        fonction,
        photo_url: photoUrl || undefined,
        date_entree: profile.hrStatus?.date_entree || '',
        hierarchyLevel,
        displayTitle,
        certifications,
        rme_rcc,
      });
    }

    // Tri personnalisé:
    // 1. Grégory Nykiel toujours en premier
    // 2. Pascal Pagano toujours en second
    // 3. Puis par niveau hiérarchique
    // 4. Puis par ancienneté (plus ancien en premier)
    members.sort((a, b) => {
      const aFullName = `${a.prenom} ${a.nom}`.toLowerCase();
      const bFullName = `${b.prenom} ${b.nom}`.toLowerCase();
      
      // Vérifier si l'un des deux a un ordre fixe
      const aFixedIndex = FIXED_ORDER_NAMES.indexOf(aFullName);
      const bFixedIndex = FIXED_ORDER_NAMES.indexOf(bFullName);
      
      // Si les deux ont un ordre fixe, comparer leurs indices
      if (aFixedIndex !== -1 && bFixedIndex !== -1) {
        return aFixedIndex - bFixedIndex;
      }
      
      // Si seulement A a un ordre fixe, A passe en premier
      if (aFixedIndex !== -1) return -1;
      
      // Si seulement B a un ordre fixe, B passe en premier
      if (bFixedIndex !== -1) return 1;
      
      // Pour les autres, trier par niveau hiérarchique
      if (a.hierarchyLevel !== b.hierarchyLevel) {
        return a.hierarchyLevel - b.hierarchyLevel;
      }
      
      // Ensuite par ancienneté (date d'entrée la plus ancienne en premier)
      return new Date(a.date_entree).getTime() - new Date(b.date_entree).getTime();
    });

    return members;
  } catch (error) {
    console.error('Erreur chargement équipe rapport:', error);
    return [];
  }
}

/**
 * Récupère l'équipe formatée pour l'en-tête du PDF
 * Organisée en colonnes (gauche et droite)
 */
export async function getReportTeamForPDF(): Promise<{
  leftColumn: ReportTeamMember[];
  rightColumn: ReportTeamMember[];
}> {
  const team = await getReportTeam();
  
  // Diviser en deux colonnes équilibrées
  const midpoint = Math.ceil(team.length / 2);
  
  return {
    leftColumn: team.slice(0, midpoint),
    rightColumn: team.slice(midpoint),
  };
}

