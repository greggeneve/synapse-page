-- =====================================================
-- Table document_templates
-- Stocke les masques de documents réutilisables
-- =====================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- En-tête
  logo_url VARCHAR(255) DEFAULT '/logo-poge.png',
  slogan_line1 VARCHAR(255) DEFAULT 'Pour toute urgence, un',
  slogan_line2 VARCHAR(255) DEFAULT 'rdv vous est proposé',
  slogan_line3 VARCHAR(255) DEFAULT 'dans la journée.',
  
  -- Pied de page - Données
  footer_company_name VARCHAR(255) DEFAULT 'Permanence Ostéopathique de Genève',
  footer_address VARCHAR(255) DEFAULT 'Rue du Rhône 14',
  footer_city VARCHAR(100) DEFAULT '1204 Genève',
  footer_phone VARCHAR(50) DEFAULT '022 310 22 55',
  footer_phone_link VARCHAR(100) DEFAULT 'tel:+41223102255',
  footer_email VARCHAR(100) DEFAULT 'contact@poge.ch',
  footer_email_link VARCHAR(100) DEFAULT 'mailto:contact@poge.ch',
  footer_website VARCHAR(100) DEFAULT 'www.poge.ch',
  footer_website_link VARCHAR(255) DEFAULT 'https://www.poge.ch',
  
  -- Pied de page - Mise en forme
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
);

-- =====================================================
-- Insérer le template par défaut
-- =====================================================

INSERT INTO document_templates (name, description, is_default)
VALUES ('Masque POGE Standard', 'Masque par défaut pour tous les documents POGE', 1)
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- =====================================================
-- Vérification
-- =====================================================

SELECT 
  id,
  name,
  IF(is_default, '✓ Défaut', '') as defaut,
  footer_company_name,
  footer_phone,
  created_at
FROM document_templates;

