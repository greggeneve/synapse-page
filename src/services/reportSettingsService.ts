import { query } from './mariadb';

export interface ReportSettings {
  // Données de l'entreprise (depuis company_settings)
  company_name: string;
  footer_address: string;
  footer_city: string;
  footer_phone: string;
  
  // Paramètres spécifiques au rapport (configurables séparément)
  slogan_line1: string;
  slogan_line2: string;
  slogan_line3: string;
  footer_phone_link: string;  // tel:+41227003577
  footer_fax: string;
  footer_email: string;       // Email de contact public (pas l'email de l'admin)
  footer_email_link: string;  // mailto:contact@poge.ch
  footer_website: string;
  footer_website_link: string; // https://www.poge.ch
  signature_website: string;      // Texte affiché
  signature_website_link: string; // URL cliquable
  
  // Mise en forme du pied de page
  footer_font_size: string;      // Taille en points (7, 8, 9, 10...)
  footer_alignment: string;      // left, center, right
  footer_line_spacing: string;   // Interligne (1, 1.2, 1.5...)
  footer_format_line1: string;   // Format ligne 1 avec variables
  footer_format_line2: string;   // Format ligne 2 avec variables
}

// Valeurs par défaut (utilisées si rien en DB)
const DEFAULT_REPORT_PARAMS = {
  slogan_line1: 'Pour toute urgence, un',
  slogan_line2: 'rdv vous est proposé',
  slogan_line3: 'dans la journée.',
  footer_phone_link: 'tel:+41227003577',
  footer_fax: '',
  footer_email: 'contact@poge.ch',       // Email de contact PUBLIC
  footer_email_link: 'mailto:contact@poge.ch',
  footer_website: 'www.poge.ch',
  footer_website_link: 'https://www.poge.ch',
  signature_website: 'www.poge.ch',
  signature_website_link: 'https://www.poge.ch',
  // Mise en forme du pied de page
  footer_font_size: '7',                 // Taille en points
  footer_alignment: 'left',              // left, center, right
  footer_line_spacing: '1.2',            // Interligne
  footer_format_line1: '{address} - {city}    Tél : {phone}',
  footer_format_line2: 'E-mail : {email}    Site : {website}    Page {page}',
};

// Données par défaut de l'entreprise (fallback)
const DEFAULT_COMPANY = {
  company_name: 'Permanence Ostéopathique de Genève SA',
  footer_address: 'Rue de la Terrassière, 58',
  footer_city: 'CH-1207 Genève',
  footer_phone: '+41 (0)22 700 35 77',
};

interface CompanySettingsRow {
  company_name: string;
  address: string;
  postal_code: string;
  city: string;
  phone: string;
}

/**
 * Charge les données de l'entreprise depuis la table company_settings principale
 * Note: L'email de contact est configurable séparément (pas celui de l'admin)
 */
async function loadCompanyData(): Promise<typeof DEFAULT_COMPANY> {
  try {
    const result = await query<CompanySettingsRow>(
      `SELECT company_name, address, postal_code, city, phone 
       FROM company_settings 
       WHERE is_active = TRUE 
       ORDER BY version DESC 
       LIMIT 1`,
      []
    );

    if (!result.success || !result.data || result.data.length === 0) {
      console.log('[ReportSettings] Aucune config entreprise en DB, utilisation des valeurs par défaut');
      return DEFAULT_COMPANY;
    }

    const row = result.data[0];
    return {
      company_name: row.company_name || DEFAULT_COMPANY.company_name,
      footer_address: row.address || DEFAULT_COMPANY.footer_address,
      footer_city: `CH-${row.postal_code} ${row.city}` || DEFAULT_COMPANY.footer_city,
      footer_phone: row.phone || DEFAULT_COMPANY.footer_phone,
    };
  } catch (error) {
    console.error('Erreur chargement données entreprise:', error);
    return DEFAULT_COMPANY;
  }
}

/**
 * Charge les paramètres spécifiques au rapport (slogan, liens, etc.)
 */
async function loadReportParams(): Promise<typeof DEFAULT_REPORT_PARAMS> {
  try {
    const result = await query<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value 
       FROM report_settings 
       WHERE setting_key LIKE 'report_%'`,
      []
    );

    if (!result.success || !result.data || result.data.length === 0) {
      return DEFAULT_REPORT_PARAMS;
    }

    const params = { ...DEFAULT_REPORT_PARAMS };
    
    for (const row of result.data) {
      const key = row.setting_key.replace('report_', '') as keyof typeof DEFAULT_REPORT_PARAMS;
      if (key in params) {
        (params as any)[key] = row.setting_value;
      }
    }

    return params;
  } catch (error) {
    // La table n'existe peut-être pas encore, ce n'est pas grave
    console.log('[ReportSettings] Table report_settings non trouvée, utilisation des valeurs par défaut');
    return DEFAULT_REPORT_PARAMS;
  }
}

/**
 * Récupère les paramètres de rapport complets
 * - Données entreprise depuis company_settings (source unique)
 * - Paramètres rapport depuis report_settings
 */
export async function getReportSettings(): Promise<ReportSettings> {
  const [companyData, reportParams] = await Promise.all([
    loadCompanyData(),
    loadReportParams()
  ]);

  return {
    // Données entreprise (lecture seule depuis company_settings)
    ...companyData,
    // Paramètres spécifiques au rapport
    ...reportParams,
  };
}

/**
 * Sauvegarde les paramètres spécifiques au rapport
 * Note: Les données de l'entreprise ne sont pas modifiables ici
 */
export async function saveReportSettings(settings: Partial<ReportSettings>): Promise<boolean> {
  try {
    // Créer la table si elle n'existe pas
    await query(`
      CREATE TABLE IF NOT EXISTS report_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, []);

    // Sauvegarder uniquement les paramètres du rapport (pas les données entreprise)
    const reportKeys = Object.keys(DEFAULT_REPORT_PARAMS);
    
    for (const [key, value] of Object.entries(settings)) {
      // Ne sauvegarder que les paramètres du rapport, pas les données entreprise
      if (reportKeys.includes(key)) {
        await query(
          `INSERT INTO report_settings (setting_key, setting_value, updated_at)
           VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
          [`report_${key}`, value, value]
        );
      }
    }
    return true;
  } catch (error) {
    console.error('Erreur sauvegarde paramètres rapport:', error);
    return false;
  }
}

