/**
 * Service de gestion des masques de documents
 * 
 * Stocke en DB un masque réutilisable avec :
 * - Infos entreprise (logo, slogan, pied de page)
 * - Liste des praticiens actifs (mise à jour automatique)
 * - Paramètres de mise en forme
 * 
 * Peut être appelé depuis n'importe quelle application
 */

import { query } from './mariadb';
import { getReportTeam, type ReportTeamMember } from './teamReportService';

// === TYPES ===

export interface DocumentTemplate {
  id: number;
  name: string;
  description?: string;
  // En-tête
  logo_url: string;
  slogan_line1: string;
  slogan_line2: string;
  slogan_line3: string;
  // Pied de page
  footer_company_name: string;
  footer_address: string;
  footer_city: string;
  footer_phone: string;
  footer_phone_link: string;
  footer_email: string;
  footer_email_link: string;
  footer_website: string;
  footer_website_link: string;
  // Mise en forme
  footer_font_size: string;
  footer_alignment: string;
  footer_line_spacing: string;
  footer_format_line1: string;
  footer_format_line2: string;
  // Métadonnées
  is_default: boolean;
  // Filtre praticiens: 'all', 'direction', 'gregory_only', ou IDs séparés par virgule
  practitioner_filter: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentMask {
  template: DocumentTemplate;
  practitioners: ReportTeamMember[];
  generatedAt: string;
}

// === CRÉATION DE LA TABLE ===

async function ensureTableExists(): Promise<void> {
  const result = await query(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      -- En-tête
      logo_url VARCHAR(255) DEFAULT '/logo-poge.png',
      slogan_line1 VARCHAR(255) DEFAULT 'Pour toute urgence, un',
      slogan_line2 VARCHAR(255) DEFAULT 'rdv vous est proposé',
      slogan_line3 VARCHAR(255) DEFAULT 'dans la journée.',
      -- Pied de page
      footer_company_name VARCHAR(255) DEFAULT 'Permanence Ostéopathique de Genève',
      footer_address VARCHAR(255) DEFAULT 'Rue du Rhône 14',
      footer_city VARCHAR(100) DEFAULT '1204 Genève',
      footer_phone VARCHAR(50) DEFAULT '022 310 22 55',
      footer_phone_link VARCHAR(100) DEFAULT 'tel:+41223102255',
      footer_email VARCHAR(100) DEFAULT 'contact@poge.ch',
      footer_email_link VARCHAR(100) DEFAULT 'mailto:contact@poge.ch',
      footer_website VARCHAR(100) DEFAULT 'www.poge.ch',
      footer_website_link VARCHAR(255) DEFAULT 'https://www.poge.ch',
      -- Mise en forme
      footer_font_size VARCHAR(10) DEFAULT '7',
      footer_alignment VARCHAR(20) DEFAULT 'center',
      footer_line_spacing VARCHAR(10) DEFAULT '1.4',
      footer_format_line1 VARCHAR(500) DEFAULT '{company} - {address}, {city}',
      footer_format_line2 VARCHAR(500) DEFAULT 'Tél: {phone} | Email: {email} | {website}',
      -- Métadonnées
      is_default TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_template_name (name)
    )
  `, []);

  if (!result.success) {
    console.error('Erreur création table document_templates:', result.error);
  }

  // Créer le template par défaut s'il n'existe pas
  await ensureDefaultTemplate();
}

async function ensureDefaultTemplate(): Promise<void> {
  const existing = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM document_templates WHERE is_default = 1`,
    []
  );

  if (existing.success && existing.data && existing.data[0]?.cnt === 0) {
    await query(`
      INSERT INTO document_templates (name, description, is_default)
      VALUES ('Masque POGE Standard', 'Masque par défaut pour tous les documents POGE', 1)
    `, []);
    console.log('[DocumentTemplate] Template par défaut créé');
  }
}

// === FONCTIONS PRINCIPALES ===

/**
 * Récupérer le masque de document complet (template + praticiens à jour)
 */
export async function getDocumentMask(templateId?: number): Promise<DocumentMask | null> {
  await ensureTableExists();

  // Récupérer le template
  let templateQuery = templateId
    ? `SELECT * FROM document_templates WHERE id = ?`
    : `SELECT * FROM document_templates WHERE is_default = 1 LIMIT 1`;
  
  const templateResult = await query<any>(
    templateQuery,
    templateId ? [templateId] : []
  );

  if (!templateResult.success || !templateResult.data || templateResult.data.length === 0) {
    console.error('Template non trouvé');
    return null;
  }

  const template = templateResult.data[0] as DocumentTemplate;

  // Récupérer les praticiens actifs (toujours à jour)
  let practitioners = await getReportTeam();

  // Appliquer le filtre selon le template
  const filter = template.practitioner_filter || 'all';
  practitioners = filterPractitioners(practitioners, filter);

  return {
    template,
    practitioners,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Filtrer les praticiens selon le type de filtre
 */
function filterPractitioners(practitioners: ReportTeamMember[], filter: string): ReportTeamMember[] {
  if (filter === 'all') {
    return practitioners;
  }

  if (filter === 'direction') {
    // Grégory Nykiel + Pascal Pagano uniquement
    return practitioners.filter(p => {
      const fullName = `${p.prenom} ${p.nom}`.toLowerCase();
      return fullName.includes('grégory') && fullName.includes('nykiel') ||
             fullName.includes('gregory') && fullName.includes('nykiel') ||
             fullName.includes('pascal') && fullName.includes('pagano');
    });
  }

  if (filter === 'gregory_only') {
    // Grégory Nykiel uniquement
    return practitioners.filter(p => {
      const fullName = `${p.prenom} ${p.nom}`.toLowerCase();
      return (fullName.includes('grégory') || fullName.includes('gregory')) && 
             fullName.includes('nykiel');
    });
  }

  // Filtre par IDs (ex: "54,42")
  if (filter.includes(',') || /^\d+$/.test(filter)) {
    const allowedIds = filter.split(',').map(id => parseInt(id.trim(), 10));
    return practitioners.filter(p => allowedIds.includes(p.employee_id));
  }

  return practitioners;
}

/**
 * Récupérer tous les templates disponibles
 */
export async function getAllTemplates(): Promise<DocumentTemplate[]> {
  await ensureTableExists();

  const result = await query<DocumentTemplate>(
    `SELECT * FROM document_templates ORDER BY is_default DESC, name ASC`,
    []
  );

  return result.success && result.data ? result.data : [];
}

/**
 * Récupérer un template par ID
 */
export async function getTemplateById(id: number): Promise<DocumentTemplate | null> {
  const result = await query<DocumentTemplate>(
    `SELECT * FROM document_templates WHERE id = ?`,
    [id]
  );

  return result.success && result.data && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Sauvegarder un template
 */
export async function saveTemplate(template: Partial<DocumentTemplate>): Promise<DocumentTemplate | null> {
  await ensureTableExists();

  // Si c'est le nouveau template par défaut, retirer le flag des autres
  if (template.is_default) {
    await query(`UPDATE document_templates SET is_default = 0`, []);
  }

  if (template.id) {
    // Mise à jour
    const result = await query(`
      UPDATE document_templates SET
        name = ?,
        description = ?,
        logo_url = ?,
        slogan_line1 = ?,
        slogan_line2 = ?,
        slogan_line3 = ?,
        footer_company_name = ?,
        footer_address = ?,
        footer_city = ?,
        footer_phone = ?,
        footer_phone_link = ?,
        footer_email = ?,
        footer_email_link = ?,
        footer_website = ?,
        footer_website_link = ?,
        footer_font_size = ?,
        footer_alignment = ?,
        footer_line_spacing = ?,
        footer_format_line1 = ?,
        footer_format_line2 = ?,
        is_default = ?
      WHERE id = ?
    `, [
      template.name,
      template.description || null,
      template.logo_url,
      template.slogan_line1,
      template.slogan_line2,
      template.slogan_line3,
      template.footer_company_name,
      template.footer_address,
      template.footer_city,
      template.footer_phone,
      template.footer_phone_link,
      template.footer_email,
      template.footer_email_link,
      template.footer_website,
      template.footer_website_link,
      template.footer_font_size,
      template.footer_alignment,
      template.footer_line_spacing,
      template.footer_format_line1,
      template.footer_format_line2,
      template.is_default ? 1 : 0,
      template.id
    ]);

    if (result.success) {
      return getTemplateById(template.id);
    }
  } else {
    // Création
    const result = await query(`
      INSERT INTO document_templates (
        name, description, logo_url,
        slogan_line1, slogan_line2, slogan_line3,
        footer_company_name, footer_address, footer_city,
        footer_phone, footer_phone_link,
        footer_email, footer_email_link,
        footer_website, footer_website_link,
        footer_font_size, footer_alignment, footer_line_spacing,
        footer_format_line1, footer_format_line2,
        is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      template.name,
      template.description || null,
      template.logo_url || '/logo-poge.png',
      template.slogan_line1 || 'Pour toute urgence, un',
      template.slogan_line2 || 'rdv vous est proposé',
      template.slogan_line3 || 'dans la journée.',
      template.footer_company_name || 'Permanence Ostéopathique de Genève',
      template.footer_address || 'Rue du Rhône 14',
      template.footer_city || '1204 Genève',
      template.footer_phone || '022 310 22 55',
      template.footer_phone_link || 'tel:+41223102255',
      template.footer_email || 'contact@poge.ch',
      template.footer_email_link || 'mailto:contact@poge.ch',
      template.footer_website || 'www.poge.ch',
      template.footer_website_link || 'https://www.poge.ch',
      template.footer_font_size || '7',
      template.footer_alignment || 'center',
      template.footer_line_spacing || '1.4',
      template.footer_format_line1 || '{company} - {address}, {city}',
      template.footer_format_line2 || 'Tél: {phone} | Email: {email} | {website}',
      template.is_default ? 1 : 0
    ]);

    if (result.success && result.insertId) {
      return getTemplateById(Number(result.insertId));
    }
  }

  return null;
}

/**
 * Supprimer un template (sauf le défaut)
 */
export async function deleteTemplate(id: number): Promise<boolean> {
  // Vérifier que ce n'est pas le template par défaut
  const template = await getTemplateById(id);
  if (template?.is_default) {
    console.error('Impossible de supprimer le template par défaut');
    return false;
  }

  const result = await query(`DELETE FROM document_templates WHERE id = ?`, [id]);
  return result.success;
}

// === FONCTIONS UTILITAIRES ===

/**
 * Formater une ligne de pied de page avec les variables
 */
export function formatFooterLine(format: string, template: DocumentTemplate): string {
  return format
    .replace('{company}', template.footer_company_name)
    .replace('{address}', template.footer_address)
    .replace('{city}', template.footer_city)
    .replace('{phone}', template.footer_phone)
    .replace('{email}', template.footer_email)
    .replace('{website}', template.footer_website);
}

/**
 * Générer le HTML du masque (pour prévisualisation ou export)
 */
export function generateMaskHTML(mask: DocumentMask): string {
  const { template, practitioners } = mask;
  
  const practitionersHTML = practitioners.map(p => `
    <div class="practitioner">
      <strong>${p.prenom} ${p.nom}</strong>
      ${p.displayTitle.split('\n').map(t => `<div>${t}</div>`).join('')}
      ${p.certifications.map(c => `<div class="cert">${c}</div>`).join('')}
      ${p.rme_rcc ? `<div class="rme">${p.rme_rcc}</div>` : ''}
    </div>
  `).join('');

  return `
    <div class="document-mask">
      <header class="mask-header">
        <img src="${template.logo_url}" alt="Logo" class="logo" />
        <div class="slogan">
          <em>${template.slogan_line1}</em>
          <em>${template.slogan_line2}</em>
          <em>${template.slogan_line3}</em>
        </div>
        <div class="practitioners">
          ${practitionersHTML}
        </div>
      </header>
      <footer class="mask-footer">
        <div>${formatFooterLine(template.footer_format_line1, template)}</div>
        <div>${formatFooterLine(template.footer_format_line2, template)}</div>
      </footer>
    </div>
  `;
}

/**
 * Exporter le masque en JSON (pour utilisation externe)
 */
export async function exportMaskAsJSON(): Promise<string> {
  const mask = await getDocumentMask();
  if (!mask) return '{}';
  
  return JSON.stringify(mask, null, 2);
}

