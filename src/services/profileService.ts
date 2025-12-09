import { query } from './mariadb';
import { getEmployeePhoto } from './employeePhotoService';

// Types pour les historiques
export interface SalaryStructureEntry {
  id: string;
  date_debut_effet: string;
  mode: 'Mensuel' | 'Horaire' | 'Commission';
  montant: number;
  commentaire?: string;
}

export interface UnpaidLeaveEntry {
  id: string;
  date_debut: string;
  date_fin: string;
  motif: string;
}

export interface ChildAllowanceInfo {
  childFirstName: string;
  childLastName: string;
  childBirthDate: string;
  childSex: 'M' | 'F';
  allocationType: string;
  rightUntil: string;
}

export interface EmployeeProfile {
  employee_id: number;
  identification: {
    nom: string;
    prenom: string;
    sexe: 'M' | 'F' | 'A' | '';
    date_naissance: string;
    nationalite_principale: string;
    autres_nationalites?: string;
    avss_numero: string;
    photo_url?: string;
  };
  contact: {
    email_professionnel: string;
    email_prive: string;
    telephone_portable: string;
    adresse_rue: string;
    adresse_complement?: string;
    code_postal: string;
    ville: string;
    pays: string;
    contact_urgence_nom?: string;
    contact_urgence_telephone?: string;
    residence_fiscale: 'CH' | 'FR' | 'Autre' | '';
    soumis_impot_source: boolean;
    code_tarif_IaS_actuel: string;
    beneficiaire_allocations_familiales: boolean;
    nombre_enfants_a_charge: number;
  };
  hrStatus: {
    statut_dans_societe: string;
    date_entree: string;
    date_sortie?: string | null;
    collaborateur_actif: boolean;
    taux_activite_contractuel_reference: number;
    temps_travail_type: string;
    droit_vacances_semaines?: number;
    // Structure salariale actuelle
    salaryMode?: 'Mensuel' | 'Horaire' | 'Commission';
    salaryAmount?: number;
    salaryStructureHistory?: SalaryStructureEntry[];
    // Congés sans solde
    unpaidLeaveHistory?: UnpaidLeaveEntry[];
  };
  lpp: {
    plan_LPP: string;
    categorie_LPP: string;
    soumis_LPP: boolean;
    cle_repartition_LPP?: string;
    part_employe_pourcent?: number;
    part_employeur_pourcent?: number;
  };
  bonuses: {
    // 13ème salaire
    has_thirteenth_salary?: boolean;
    thirteenth_salary_mode?: string;
    // Primes diverses
    a_prime_assiduite?: boolean;
    montant_prime_assiduite?: number;
    a_prime_natel?: boolean;
    a_prime_entretien_blouses?: boolean;
    montant_blouses?: number;
    a_prime_interessement_CA?: boolean;
    taux_interessement_CA?: number;
    // Clause de non-concurrence
    soumis_clause_non_concurrence?: boolean;
    taux_clause_NC?: number;
    // Rapports assurance
    remunere_pour_rapports?: boolean;
    taux_rapports?: number;
    // Prestations en nature
    beneficie_prestations_nature?: boolean;
    description_prestations_nature?: string;
    montant_prestations_nature?: number;
    // Prime direction
    a_prime_direction?: boolean;
    montant_prime_direction?: number;
    // Prime supervision
    a_prime_supervision?: boolean;
    montant_supervision?: number;
  };
  bankInfo?: {
    current_iban?: string;
    current_bank_name?: string;
    titulaire_compte?: string;
  };
  familyAllowances?: {
    children: ChildAllowanceInfo[];
  };
  externalIds?: {
    id_externe_RH?: string;
    id_externe_agenda?: string;
    id_externe_facturation?: string;
    id_externe_LPP?: string;
    id_externe_IJM?: string;
  };
}

/**
 * Récupère le profil complet d'un employé
 */
export async function getEmployeeProfile(employeeId: number): Promise<EmployeeProfile | null> {
  try {
    const result = await query<{ employee_id: number; profile_json: any }>(
      `SELECT employee_id, profile_json FROM employees WHERE employee_id = ?`,
      [employeeId]
    );

    if (!result.success || !result.data || result.data.length === 0) {
      return null;
    }

    const row = result.data[0];
    const profile = typeof row.profile_json === 'string' 
      ? JSON.parse(row.profile_json) 
      : row.profile_json;

    // Récupérer la photo
    const photoUrl = await getEmployeePhoto(employeeId);

    // Récupérer la structure salariale actuelle (plus récente)
    const salaryHistory = profile.hrStatus?.salaryStructureHistory || [];
    const currentSalary = salaryHistory.length > 0 
      ? salaryHistory.sort((a: any, b: any) => new Date(b.date_debut_effet).getTime() - new Date(a.date_debut_effet).getTime())[0]
      : null;

    // 13ème salaire actuel
    const thirteenthHistory = profile.bonuses?.thirteenthSalaryHistory || [];
    const current13th = thirteenthHistory.length > 0
      ? thirteenthHistory.sort((a: any, b: any) => new Date(b.date_debut_effet).getTime() - new Date(a.date_debut_effet).getTime())[0]
      : null;

    return {
      employee_id: row.employee_id,
      identification: {
        nom: profile.identification?.nom || '',
        prenom: profile.identification?.prenom || '',
        sexe: profile.identification?.sexe || '',
        date_naissance: profile.identification?.date_naissance || '',
        nationalite_principale: profile.identification?.nationalite_principale || '',
        autres_nationalites: profile.identification?.autres_nationalites,
        avss_numero: profile.identification?.avss_numero || '',
        photo_url: photoUrl || undefined,
      },
      contact: {
        email_professionnel: profile.contact?.email_professionnel || '',
        email_prive: profile.contact?.email_prive || '',
        telephone_portable: profile.contact?.telephone_portable || '',
        adresse_rue: profile.contact?.adresse_rue || '',
        adresse_complement: profile.contact?.adresse_complement,
        code_postal: profile.contact?.code_postal || '',
        ville: profile.contact?.ville || '',
        pays: profile.contact?.pays || 'Suisse',
        contact_urgence_nom: profile.contact?.contact_urgence_nom,
        contact_urgence_telephone: profile.contact?.contact_urgence_telephone,
        residence_fiscale: profile.contact?.residence_fiscale || '',
        soumis_impot_source: profile.contact?.soumis_impot_source || false,
        code_tarif_IaS_actuel: profile.contact?.code_tarif_IaS_actuel || '',
        beneficiaire_allocations_familiales: profile.contact?.beneficiaire_allocations_familiales || false,
        nombre_enfants_a_charge: profile.contact?.nombre_enfants_a_charge || 0,
      },
      hrStatus: {
        statut_dans_societe: profile.hrStatus?.statut_dans_societe || '',
        date_entree: profile.hrStatus?.date_entree || '',
        date_sortie: profile.hrStatus?.date_sortie,
        collaborateur_actif: profile.hrStatus?.collaborateur_actif || false,
        taux_activite_contractuel_reference: profile.hrStatus?.taux_activite_contractuel_reference || 100,
        temps_travail_type: profile.hrStatus?.temps_travail_type || '',
        droit_vacances_semaines: profile.hrStatus?.droit_vacances_semaines,
        salaryMode: currentSalary?.mode,
        salaryAmount: currentSalary?.montant,
        salaryStructureHistory: salaryHistory,
        unpaidLeaveHistory: profile.hrStatus?.unpaidLeaveHistory || [],
      },
      lpp: {
        plan_LPP: profile.lpp?.plan_LPP || '',
        categorie_LPP: profile.lpp?.categorie_LPP || '',
        soumis_LPP: profile.lpp?.soumis_LPP || false,
        cle_repartition_LPP: profile.lpp?.cle_repartition_LPP,
        part_employe_pourcent: profile.lpp?.part_employe_pourcent,
        part_employeur_pourcent: profile.lpp?.part_employeur_pourcent,
      },
      bonuses: {
        // 13ème salaire
        has_thirteenth_salary: current13th?.actif ?? true,
        thirteenth_salary_mode: current13th?.mode_calcul || 'Automatique',
        // Primes
        a_prime_assiduite: profile.bonuses?.a_prime_assiduite,
        montant_prime_assiduite: profile.bonuses?.montant_prime_assiduite_mensuelle,
        a_prime_natel: profile.bonuses?.a_prime_natel,
        a_prime_entretien_blouses: profile.bonuses?.a_prime_entretien_blouses,
        montant_blouses: profile.bonuses?.montant_blouses_100pct,
        a_prime_interessement_CA: profile.bonuses?.a_prime_interessement_CA,
        taux_interessement_CA: profile.bonuses?.taux_interessement_CA,
        // Non-concurrence
        soumis_clause_non_concurrence: profile.bonuses?.soumis_clause_non_concurrence,
        taux_clause_NC: profile.bonuses?.taux_renumeration_clause_NC,
        // Rapports
        remunere_pour_rapports: profile.bonuses?.remunere_pour_rapports_assurance,
        taux_rapports: profile.bonuses?.taux_remuneration_rapports,
        // Prestations en nature
        beneficie_prestations_nature: profile.bonuses?.beneficie_prestations_en_nature,
        description_prestations_nature: profile.bonuses?.description_prestations_nature,
        montant_prestations_nature: profile.bonuses?.montant_prestations_nature_mensuel_reference,
        // Direction
        a_prime_direction: profile.bonuses?.a_prime_direction,
        montant_prime_direction: profile.bonuses?.montant_prime_direction,
        // Supervision
        a_prime_supervision: profile.bonuses?.a_prime_supervision_assistant,
        montant_supervision: profile.bonuses?.montant_supervision_assistant,
      },
      bankInfo: profile.bankInfo ? {
        current_iban: profile.bankInfo.current_iban || profile.bankInfo.bankAccountHistory?.[0]?.iban,
        current_bank_name: profile.bankInfo.current_bank_name || profile.bankInfo.bankAccountHistory?.[0]?.nom_banque,
        titulaire_compte: profile.bankInfo.bankAccountHistory?.[0]?.titulaire_compte,
      } : undefined,
      familyAllowances: profile.familyAllowances?.children?.length > 0 ? {
        children: profile.familyAllowances.children.map((c: any) => ({
          childFirstName: c.childFirstName,
          childLastName: c.childLastName,
          childBirthDate: c.childBirthDate,
          childSex: c.childSex,
          allocationType: c.allocationType,
          rightUntil: c.rightUntil,
        })),
      } : undefined,
      externalIds: {
        id_externe_RH: profile.externalIds?.id_externe_RH,
        id_externe_agenda: profile.externalIds?.id_externe_agenda,
        id_externe_facturation: profile.externalIds?.id_externe_facturation,
        id_externe_LPP: profile.externalIds?.id_externe_LPP,
        id_externe_IJM: profile.externalIds?.id_externe_IJM,
      },
    };
  } catch (error) {
    console.error('Erreur chargement profil:', error);
    return null;
  }
}
