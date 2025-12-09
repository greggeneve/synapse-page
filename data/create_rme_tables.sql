-- ============================================
-- Tables RME/ASCA pour poge_erp
-- ============================================

-- Table des affiliations RME/ASCA
CREATE TABLE IF NOT EXISTS employee_rme_affiliations (
  id VARCHAR(36) PRIMARY KEY,
  employee_id INT NOT NULL,
  type ENUM('RME', 'ASCA') NOT NULL,
  numero_membre VARCHAR(50) NOT NULL,
  date_adhesion DATE NOT NULL,
  date_expiration DATE NOT NULL,
  statut ENUM('actif', 'suspendu', 'expire') DEFAULT 'actif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  UNIQUE KEY unique_affiliation (employee_id, type)
);

-- Table des formations continues
CREATE TABLE IF NOT EXISTS rme_continuing_education (
  id VARCHAR(36) PRIMARY KEY,
  employee_id INT NOT NULL,
  titre VARCHAR(255) NOT NULL,
  organisme VARCHAR(255) NOT NULL,
  formateur VARCHAR(255) NOT NULL,
  qualification_formateur VARCHAR(255),
  date_debut DATE NOT NULL,
  date_fin DATE,
  heures_total DECIMAL(5,2) NOT NULL,
  heures_autonomes DECIMAL(5,2) DEFAULT 0,
  modalite ENUM('presentiel', 'mixte', 'en_ligne') DEFAULT 'presentiel',
  est_enseignement BOOLEAN DEFAULT FALSE,
  heures_enseignement_brutes DECIMAL(5,2),
  facture_url LONGTEXT,
  attestation_url LONGTEXT NOT NULL,
  ai_validation_status ENUM('pending', 'conforme', 'incomplet', 'non_conforme', 'validation_humaine') DEFAULT 'pending',
  ai_validation_details JSON,
  admin_validation_status ENUM('pending', 'approuve', 'refuse') DEFAULT 'pending',
  admin_commentaire TEXT,
  montant_facture DECIMAL(10,2) DEFAULT 0,
  prise_en_charge_employeur BOOLEAN DEFAULT TRUE,
  statut_paiement ENUM('non_applicable', 'soumis', 'approuve', 'paye', 'refuse') DEFAULT 'non_applicable',
  date_paiement DATE,
  engagement_prorata_accepte BOOLEAN DEFAULT FALSE,
  date_engagement DATETIME,
  periode_rme VARCHAR(4) NOT NULL,
  heures_creditees DECIMAL(5,2),
  created_by VARCHAR(50) DEFAULT 'employee_self',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  INDEX idx_employee_periode (employee_id, periode_rme),
  INDEX idx_validation_status (ai_validation_status, admin_validation_status)
);

-- Table des cotisations annuelles
CREATE TABLE IF NOT EXISTS rme_cotisations (
  id VARCHAR(36) PRIMARY KEY,
  employee_id INT NOT NULL,
  type ENUM('RME', 'ASCA') NOT NULL,
  annee INT NOT NULL,
  montant DECIMAL(10,2) NOT NULL,
  date_echeance DATE NOT NULL,
  date_paiement DATE,
  statut ENUM('a_payer', 'paye', 'rembourse_prorata') DEFAULT 'a_payer',
  prise_en_charge_employeur BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  UNIQUE KEY unique_cotisation (employee_id, type, annee)
);

-- Table des certificats annuels
CREATE TABLE IF NOT EXISTS rme_certificats (
  id VARCHAR(36) PRIMARY KEY,
  employee_id INT NOT NULL,
  type ENUM('RME', 'ASCA') NOT NULL,
  annee INT NOT NULL,
  date_expiration DATE NOT NULL,
  document_url LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  UNIQUE KEY unique_certificat (employee_id, type, annee)
);

-- Table des transactions d'heures
CREATE TABLE IF NOT EXISTS rme_hours_transactions (
  id VARCHAR(36) PRIMARY KEY,
  employee_id INT NOT NULL,
  type ENUM('credit_formation', 'credit_enseignement', 'report_entrant', 'report_sortant', 'ajustement') NOT NULL,
  heures DECIMAL(5,2) NOT NULL,
  formation_id VARCHAR(36),
  periode_rme VARCHAR(4) NOT NULL,
  description TEXT,
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  FOREIGN KEY (formation_id) REFERENCES rme_continuing_education(id) ON DELETE SET NULL,
  INDEX idx_employee_periode (employee_id, periode_rme)
);

-- Vue pour le dashboard admin
CREATE OR REPLACE VIEW v_rme_employee_summary AS
SELECT 
  e.employee_id,
  JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) as prenom,
  JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom')) as nom,
  JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.externalIds.rme_rcc')) as rme_rcc,
  a.date_expiration as rme_expiration,
  a.statut as rme_statut,
  COALESCE(SUM(CASE WHEN t.type IN ('credit_formation', 'credit_enseignement', 'report_entrant') THEN t.heures ELSE 0 END), 0) as heures_validees,
  (SELECT COUNT(*) FROM rme_continuing_education f 
   WHERE f.employee_id = e.employee_id 
   AND f.admin_validation_status = 'pending') as formations_en_attente
FROM employees e
LEFT JOIN employee_rme_affiliations a ON e.employee_id = a.employee_id AND a.type = 'RME'
LEFT JOIN rme_hours_transactions t ON e.employee_id = t.employee_id AND t.periode_rme = YEAR(CURDATE())
WHERE JSON_EXTRACT(e.profile_json, '$.externalIds.rme_rcc') IS NOT NULL
GROUP BY e.employee_id, a.date_expiration, a.statut;

