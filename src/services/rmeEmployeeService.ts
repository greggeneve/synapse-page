// ============================================
// services/rmeEmployeeService.ts - Service RME côté employé
// ============================================

import { query } from './mariadb';
import type {
  RmeAscaAffiliation,
  RmeContinuingEducation,
  RmeAscaCotisation,
  RmeAscaCertificat,
  RmeHoursBalance,
  EmployeeRmeData
} from '../types/rmeAsca';

/**
 * Charge toutes les données RME/ASCA d'un employé
 */
export async function loadEmployeeRmeData(employeeId: string): Promise<EmployeeRmeData> {
  // 1. Récupérer le numéro RME depuis profile_json
  const profileRes = await query<any>(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.externalIds.rme_rcc')) as rme_rcc
     FROM employees WHERE employee_id = ?`,
    [employeeId]
  );
  const rme_rcc = profileRes.data?.[0]?.rme_rcc || undefined;

  // 2. Affiliations
  const affiliationsRes = await query<RmeAscaAffiliation>(
    `SELECT * FROM employee_rme_affiliations WHERE employee_id = ? ORDER BY type`,
    [employeeId]
  );

  // 3. Formations
  const formationsRes = await query<any>(
    `SELECT * FROM rme_continuing_education WHERE employee_id = ? ORDER BY created_at DESC`,
    [employeeId]
  );
  const formations = (formationsRes.data || []).map((row: any) => ({
    ...row,
    dates_formation: { debut: row.date_debut, fin: row.date_fin },
    ai_validation_details: row.ai_validation_details ? JSON.parse(row.ai_validation_details) : undefined
  }));

  // 4. Cotisations
  const cotisationsRes = await query<RmeAscaCotisation>(
    `SELECT * FROM rme_cotisations WHERE employee_id = ? ORDER BY annee DESC`,
    [employeeId]
  );

  // 5. Certificats
  const certificatsRes = await query<RmeAscaCertificat>(
    `SELECT * FROM rme_certificats WHERE employee_id = ? ORDER BY annee DESC`,
    [employeeId]
  );

  // 6. Balance des heures
  const balance = await getEmployeeHoursBalance(employeeId);

  return {
    rme_rcc,
    affiliations: affiliationsRes.data || [],
    formations,
    cotisations: cotisationsRes.data || [],
    certificats: certificatsRes.data || [],
    balance: balance || undefined
  };
}

/**
 * Vérifie si un employé est ostéopathe (a un numéro RME)
 */
export async function isOsteopath(employeeId: string): Promise<boolean> {
  const result = await query<{ rme_rcc: string }>(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.externalIds.rme_rcc')) as rme_rcc
     FROM employees WHERE employee_id = ?`,
    [employeeId]
  );
  const rme = result.data?.[0]?.rme_rcc;
  return !!rme && rme !== 'null';
}

/**
 * Calcule la balance d'heures pour l'année en cours
 */
async function getEmployeeHoursBalance(employeeId: string): Promise<RmeHoursBalance | null> {
  const year = new Date().getFullYear();

  // Récupérer l'affiliation RME
  const affiliationRes = await query<RmeAscaAffiliation>(
    `SELECT * FROM employee_rme_affiliations WHERE employee_id = ? AND type = 'RME'`,
    [employeeId]
  );

  if (!affiliationRes.data?.length) return null;
  const affiliation = affiliationRes.data[0];

  // Calculer les heures
  const transactionsRes = await query<{ type: string; total: number }>(
    `SELECT type, SUM(heures) as total 
     FROM rme_hours_transactions 
     WHERE employee_id = ? AND periode_rme = ?
     GROUP BY type`,
    [employeeId, year]
  );

  let heuresValidees = 0;
  let heuresReportees = 0;

  for (const t of transactionsRes.data || []) {
    if (t.type === 'credit_formation' || t.type === 'credit_enseignement') {
      heuresValidees += t.total;
    } else if (t.type === 'report_entrant') {
      heuresReportees += t.total;
    }
  }

  // Heures en attente
  const pendingRes = await query<{ total: number }>(
    `SELECT COALESCE(SUM(
      CASE WHEN est_enseignement THEN heures_enseignement_brutes * 0.5 ELSE heures_total END
    ), 0) as total
     FROM rme_continuing_education 
     WHERE employee_id = ? AND periode_rme = ?
       AND admin_validation_status = 'pending'
       AND ai_validation_status IN ('conforme', 'validation_humaine')`,
    [employeeId, year]
  );

  const heuresEnAttente = pendingRes.data?.[0]?.total || 0;
  const heuresRequises = 20;
  const solde = heuresValidees + heuresReportees - heuresRequises;

  // Statut
  const total = heuresValidees + heuresReportees + heuresEnAttente;
  let statut: 'en_regle' | 'a_risque' | 'critique' | 'non_conforme';
  if (total >= heuresRequises) statut = 'en_regle';
  else if (total >= 15) statut = 'a_risque';
  else if (total >= 10) statut = 'critique';
  else statut = 'non_conforme';

  // Jours avant expiration
  const expDate = new Date(affiliation.date_expiration);
  const joursAvantExpiration = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return {
    periode_debut: affiliation.date_adhesion,
    periode_fin: affiliation.date_expiration,
    annee_rme: year,
    heures_requises: heuresRequises,
    heures_validees: heuresValidees,
    heures_en_attente: heuresEnAttente,
    heures_reportees_precedent: heuresReportees,
    solde,
    statut,
    jours_avant_expiration: joursAvantExpiration
  };
}

/**
 * Soumet une nouvelle formation (depuis l'espace employé)
 */
export async function submitFormation(formation: Omit<RmeContinuingEducation, 'id' | 'created_at' | 'ai_validation_status' | 'admin_validation_status'>): Promise<{ success: boolean; id?: string; error?: string }> {
  const id = crypto.randomUUID();
  
  try {
    await query(
      `INSERT INTO rme_continuing_education 
       (id, employee_id, titre, organisme, formateur, qualification_formateur,
        date_debut, date_fin, heures_total, heures_autonomes, modalite,
        est_enseignement, heures_enseignement_brutes,
        facture_url, attestation_url,
        ai_validation_status, admin_validation_status,
        montant_facture, prise_en_charge_employeur, statut_paiement,
        engagement_prorata_accepte, date_engagement,
        periode_rme, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, 'soumis', ?, ?, ?, 'employee_self', NOW())`,
      [
        id,
        formation.employee_id,
        formation.titre,
        formation.organisme,
        formation.formateur,
        formation.qualification_formateur || null,
        formation.dates_formation.debut,
        formation.dates_formation.fin,
        formation.heures_total,
        formation.heures_autonomes,
        formation.modalite,
        formation.est_enseignement,
        formation.heures_enseignement_brutes || null,
        formation.facture_url || null,
        formation.attestation_url,
        formation.montant_facture,
        formation.prise_en_charge_employeur,
        formation.engagement_prorata_accepte,
        formation.date_engagement || null,
        formation.periode_rme
      ]
    );
    
    return { success: true, id };
  } catch (e: any) {
    console.error('Erreur submitFormation:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Génère le texte d'engagement prorata
 */
export function generateProrataEngagementText(
  formationTitle: string,
  montant: number,
  dateAnniversaire: string
): string {
  return `ENGAGEMENT DE REMBOURSEMENT PRORATA TEMPORIS

En soumettant cette demande de prise en charge, je reconnais et accepte :

1. FORMATION CONCERNÉE
   "${formationTitle}" - Montant : CHF ${montant.toFixed(2)}

2. ENGAGEMENT
   En cas de départ avant le ${new Date(dateAnniversaire).toLocaleDateString('fr-CH')}, 
   je m'engage à rembourser au prorata temporis.

3. CALCUL
   Montant à rembourser = Montant × (Mois restants / 12)

4. MODALITÉ
   Le montant sera déduit de mon dernier salaire.

En cochant "J'accepte", je confirme avoir lu et compris ces conditions.`;
}

