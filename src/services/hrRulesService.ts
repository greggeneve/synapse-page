/**
 * Service pour gérer les règles RH et légales
 * Ces règles sont utilisées par l'IA pour valider les plannings, congés, etc.
 */

import { query } from './mariadb';

export interface HRRules {
  // Règles générales en texte libre
  general_rules: string;
  
  // Paramètres numériques clés
  max_hours_per_week: number;
  max_hours_per_day: number;
  min_rest_between_shifts: number; // en heures
  min_break_duration: number; // en minutes pour journée > 9h
  max_consecutive_days: number;
  min_annual_leave_days: number;
  notice_period_leave_days: number; // préavis pour demande de congé
  
  // Règles spécifiques textuelles
  overtime_rules: string;
  night_work_rules: string;
  weekend_rules: string;
  holiday_rules: string;
  sick_leave_rules: string;
  maternity_rules: string;
  special_leave_rules: string;
  
  // Contraintes métier spécifiques
  min_staff_per_shift: number;
  roles_required: string; // JSON ou texte descriptif
  
  // Métadonnées
  last_updated: string;
  updated_by: string;
}

const DEFAULT_HR_RULES: HRRules = {
  general_rules: `# Règles du travail - Droit suisse (LTr)

## Durée du travail
- Durée maximale hebdomadaire : 45h (industrie, personnel de bureau, technique)
- Durée maximale journalière : 9h (peut être étendue à 10h avec compensation)
- Pause obligatoire : 15 min si journée > 5h30, 30 min si > 7h, 1h si > 9h

## Repos
- Repos journalier minimum : 11 heures consécutives
- Repos hebdomadaire : 1 jour complet (généralement dimanche)
- Maximum 6 jours consécutifs de travail

## Heures supplémentaires
- Maximum 2h/jour et 170h/an (45h hebdo) ou 140h/an (50h hebdo)
- Compensation : repos équivalent ou majoration de 25% minimum

## Travail de nuit et dimanche
- Travail de nuit (23h-6h) : majoration de 25% du temps
- Travail du dimanche : soumis à autorisation, repos compensatoire

## Congés et absences
- Vacances : minimum 4 semaines/an (5 semaines si < 20 ans)
- Congé maternité : 14 semaines à 80% du salaire
- Congé paternité : 2 semaines
- Jours fériés : selon canton (Genève : 9 jours)`,

  max_hours_per_week: 45,
  max_hours_per_day: 10,
  min_rest_between_shifts: 11,
  min_break_duration: 60,
  max_consecutive_days: 6,
  min_annual_leave_days: 20,
  notice_period_leave_days: 14,
  
  overtime_rules: `- Maximum 2h supplémentaires par jour
- Maximum 170h supplémentaires par année
- Compensation : repos équivalent dans les 14 semaines OU paiement avec majoration de 25%
- Les heures supplémentaires doivent être approuvées préalablement par la direction`,
  
  night_work_rules: `- Le travail de nuit est défini entre 23h et 6h
- Majoration de 25% en temps pour le travail de nuit
- Examen médical obligatoire pour les travailleurs de nuit réguliers
- Non applicable si travail de nuit < 25 nuits/an`,
  
  weekend_rules: `- Le dimanche est jour de repos obligatoire
- Travail du dimanche uniquement avec autorisation
- Repos compensatoire obligatoire dans la semaine suivante
- Maximum 6 dimanches travaillés par année sans autorisation spéciale`,
  
  holiday_rules: `Jours fériés (Canton de Genève) :
- 1er janvier (Nouvel An)
- Vendredi Saint
- Lundi de Pâques
- Jeudi de l'Ascension
- Lundi de Pentecôte
- 1er août (Fête nationale)
- Jeûne genevois (jeudi après 1er dimanche de septembre)
- 25 décembre (Noël)
- 31 décembre (Restauration)

Les jours fériés travaillés donnent droit à un jour de repos compensatoire.`,
  
  sick_leave_rules: `- Certificat médical obligatoire dès le 3ème jour d'absence
- Informer l'employeur le plus tôt possible (avant le début du shift)
- Échelle bernoise pour le maintien du salaire :
  • 1ère année : 3 semaines
  • 2ème année : 1 mois
  • 3-4ème année : 2 mois
  • etc.`,
  
  maternity_rules: `- Congé maternité : 14 semaines (98 jours)
- 80% du salaire (APG)
- Interdiction de travailler les 8 semaines suivant l'accouchement
- Protection contre le licenciement pendant la grossesse et 16 semaines après`,
  
  special_leave_rules: `Congés spéciaux (selon usage) :
- Mariage : 2-3 jours
- Naissance d'un enfant : 2 semaines (congé paternité légal)
- Décès proche parent : 1-3 jours
- Déménagement : 1 jour
- Examen professionnel : selon durée`,
  
  min_staff_per_shift: 2,
  roles_required: `Au minimum pendant les heures d'ouverture :
- 1 ostéopathe diplômé
- 1 personne à la réception

Idéalement :
- 2 ostéopathes diplômés aux heures de pointe (10h-12h, 14h-18h)`,
  
  last_updated: new Date().toISOString(),
  updated_by: 'système'
};

/**
 * Assure que la table existe
 */
async function ensureTableExists(): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS hr_rules (
      id INT PRIMARY KEY DEFAULT 1,
      general_rules TEXT,
      max_hours_per_week INT DEFAULT 45,
      max_hours_per_day INT DEFAULT 10,
      min_rest_between_shifts INT DEFAULT 11,
      min_break_duration INT DEFAULT 60,
      max_consecutive_days INT DEFAULT 6,
      min_annual_leave_days INT DEFAULT 20,
      notice_period_leave_days INT DEFAULT 14,
      overtime_rules TEXT,
      night_work_rules TEXT,
      weekend_rules TEXT,
      holiday_rules TEXT,
      sick_leave_rules TEXT,
      maternity_rules TEXT,
      special_leave_rules TEXT,
      min_staff_per_shift INT DEFAULT 2,
      roles_required TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(100),
      CHECK (id = 1)
    )
  `;
  
  await query(createTableSQL);
}

/**
 * Récupère les règles RH
 */
export async function getHRRules(): Promise<HRRules> {
  try {
    await ensureTableExists();
    
    const result = await query<any>('SELECT * FROM hr_rules WHERE id = 1');
    
    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      return {
        general_rules: row.general_rules || DEFAULT_HR_RULES.general_rules,
        max_hours_per_week: row.max_hours_per_week || DEFAULT_HR_RULES.max_hours_per_week,
        max_hours_per_day: row.max_hours_per_day || DEFAULT_HR_RULES.max_hours_per_day,
        min_rest_between_shifts: row.min_rest_between_shifts || DEFAULT_HR_RULES.min_rest_between_shifts,
        min_break_duration: row.min_break_duration || DEFAULT_HR_RULES.min_break_duration,
        max_consecutive_days: row.max_consecutive_days || DEFAULT_HR_RULES.max_consecutive_days,
        min_annual_leave_days: row.min_annual_leave_days || DEFAULT_HR_RULES.min_annual_leave_days,
        notice_period_leave_days: row.notice_period_leave_days || DEFAULT_HR_RULES.notice_period_leave_days,
        overtime_rules: row.overtime_rules || DEFAULT_HR_RULES.overtime_rules,
        night_work_rules: row.night_work_rules || DEFAULT_HR_RULES.night_work_rules,
        weekend_rules: row.weekend_rules || DEFAULT_HR_RULES.weekend_rules,
        holiday_rules: row.holiday_rules || DEFAULT_HR_RULES.holiday_rules,
        sick_leave_rules: row.sick_leave_rules || DEFAULT_HR_RULES.sick_leave_rules,
        maternity_rules: row.maternity_rules || DEFAULT_HR_RULES.maternity_rules,
        special_leave_rules: row.special_leave_rules || DEFAULT_HR_RULES.special_leave_rules,
        min_staff_per_shift: row.min_staff_per_shift || DEFAULT_HR_RULES.min_staff_per_shift,
        roles_required: row.roles_required || DEFAULT_HR_RULES.roles_required,
        last_updated: row.last_updated || new Date().toISOString(),
        updated_by: row.updated_by || 'système'
      };
    }
    
    // Pas de données, retourner les valeurs par défaut
    return DEFAULT_HR_RULES;
    
  } catch (error) {
    console.error('Erreur lors de la récupération des règles RH:', error);
    return DEFAULT_HR_RULES;
  }
}

/**
 * Sauvegarde les règles RH
 */
export async function saveHRRules(rules: HRRules, updatedBy: string): Promise<boolean> {
  try {
    await ensureTableExists();
    
    const sql = `
      INSERT INTO hr_rules (
        id, general_rules, max_hours_per_week, max_hours_per_day,
        min_rest_between_shifts, min_break_duration, max_consecutive_days,
        min_annual_leave_days, notice_period_leave_days,
        overtime_rules, night_work_rules, weekend_rules, holiday_rules,
        sick_leave_rules, maternity_rules, special_leave_rules,
        min_staff_per_shift, roles_required, updated_by
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON DUPLICATE KEY UPDATE
        general_rules = VALUES(general_rules),
        max_hours_per_week = VALUES(max_hours_per_week),
        max_hours_per_day = VALUES(max_hours_per_day),
        min_rest_between_shifts = VALUES(min_rest_between_shifts),
        min_break_duration = VALUES(min_break_duration),
        max_consecutive_days = VALUES(max_consecutive_days),
        min_annual_leave_days = VALUES(min_annual_leave_days),
        notice_period_leave_days = VALUES(notice_period_leave_days),
        overtime_rules = VALUES(overtime_rules),
        night_work_rules = VALUES(night_work_rules),
        weekend_rules = VALUES(weekend_rules),
        holiday_rules = VALUES(holiday_rules),
        sick_leave_rules = VALUES(sick_leave_rules),
        maternity_rules = VALUES(maternity_rules),
        special_leave_rules = VALUES(special_leave_rules),
        min_staff_per_shift = VALUES(min_staff_per_shift),
        roles_required = VALUES(roles_required),
        updated_by = VALUES(updated_by)
    `;
    
    const result = await query(sql, [
      rules.general_rules,
      rules.max_hours_per_week,
      rules.max_hours_per_day,
      rules.min_rest_between_shifts,
      rules.min_break_duration,
      rules.max_consecutive_days,
      rules.min_annual_leave_days,
      rules.notice_period_leave_days,
      rules.overtime_rules,
      rules.night_work_rules,
      rules.weekend_rules,
      rules.holiday_rules,
      rules.sick_leave_rules,
      rules.maternity_rules,
      rules.special_leave_rules,
      rules.min_staff_per_shift,
      rules.roles_required,
      updatedBy
    ]);
    
    return result.success;
    
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des règles RH:', error);
    return false;
  }
}

/**
 * Génère un résumé des règles pour l'IA
 */
export function generateAIRulesSummary(rules: HRRules): string {
  return `
=== RÈGLES RH ET LÉGALES À RESPECTER ===

${rules.general_rules}

=== PARAMÈTRES CLÉS ===
- Heures max/semaine: ${rules.max_hours_per_week}h
- Heures max/jour: ${rules.max_hours_per_day}h
- Repos minimum entre shifts: ${rules.min_rest_between_shifts}h
- Pause minimum (journée > 9h): ${rules.min_break_duration} min
- Jours consécutifs max: ${rules.max_consecutive_days}
- Congés annuels minimum: ${rules.min_annual_leave_days} jours
- Préavis demande congé: ${rules.notice_period_leave_days} jours

=== HEURES SUPPLÉMENTAIRES ===
${rules.overtime_rules}

=== TRAVAIL DE NUIT ===
${rules.night_work_rules}

=== WEEK-ENDS ===
${rules.weekend_rules}

=== JOURS FÉRIÉS ===
${rules.holiday_rules}

=== MALADIE ===
${rules.sick_leave_rules}

=== MATERNITÉ ===
${rules.maternity_rules}

=== CONGÉS SPÉCIAUX ===
${rules.special_leave_rules}

=== EFFECTIFS MINIMUM ===
- Staff minimum par shift: ${rules.min_staff_per_shift}
${rules.roles_required}

=== IMPORTANT ===
Ces règles sont IMPÉRATIVES. Toute proposition de planning ou validation de congé
doit OBLIGATOIREMENT respecter ces contraintes. En cas de conflit, privilégier
le respect du droit du travail.

Dernière mise à jour: ${rules.last_updated}
Par: ${rules.updated_by}
`.trim();
}

