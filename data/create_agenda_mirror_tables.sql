-- =====================================================
-- MIROIR LOCAL AGENDA.CH
-- Tables pour répliquer les données patients
-- =====================================================

-- =====================================================
-- Table principale : agenda_customers (patients)
-- =====================================================

CREATE TABLE IF NOT EXISTS agenda_customers (
  -- Identifiant agenda.ch
  id INT PRIMARY KEY,
  
  -- Identité
  firstname VARCHAR(100),
  lastname VARCHAR(100),
  sex ENUM('m', 'f') DEFAULT NULL,
  gender VARCHAR(20) DEFAULT NULL,
  birthdate DATE DEFAULT NULL,
  locale VARCHAR(10) DEFAULT 'fr',
  
  -- Contact
  email VARCHAR(255),
  mobile VARCHAR(50),
  phone VARCHAR(50),
  
  -- Adresse
  address TEXT,
  zip VARCHAR(20),
  city VARCHAR(100),
  country VARCHAR(10) DEFAULT 'CH',
  
  -- Assurance
  avs_no VARCHAR(20),
  insurance_number VARCHAR(100),
  insurance_company VARCHAR(255),
  
  -- Statut
  blocked TINYINT(1) DEFAULT 0,
  verified TINYINT(1) DEFAULT 0,
  disabled TINYINT(1) DEFAULT 0,
  send_email TINYINT(1) DEFAULT 1,
  send_sms TINYINT(1) DEFAULT 1,
  
  -- Notes et attributs personnalisés
  comment TEXT,
  custom_attributes JSON,
  
  -- Derniers RDV (info agenda.ch)
  last_appointment DATETIME DEFAULT NULL,
  next_appointment DATETIME DEFAULT NULL,
  
  -- Timestamps agenda.ch
  created_at_agenda DATETIME,
  updated_at_agenda DATETIME,
  
  -- Timestamp local
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Index pour recherches rapides
  INDEX idx_name (lastname, firstname),
  INDEX idx_email (email),
  INDEX idx_mobile (mobile),
  INDEX idx_updated (updated_at_agenda),
  INDEX idx_birthdate (birthdate),
  FULLTEXT idx_search (firstname, lastname, email, city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- Table de suivi des synchronisations
-- =====================================================

CREATE TABLE IF NOT EXISTS agenda_sync_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Type de sync
  sync_type ENUM('full', 'incremental', 'manual') NOT NULL,
  entity VARCHAR(50) NOT NULL DEFAULT 'customers',
  
  -- Timing
  started_at DATETIME NOT NULL,
  finished_at DATETIME DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  
  -- Paramètres utilisés
  updated_after DATETIME,
  
  -- Résultats
  records_fetched INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_unchanged INT DEFAULT 0,
  
  -- Statut
  status ENUM('running', 'success', 'error', 'partial') DEFAULT 'running',
  error_message TEXT,
  
  -- Index
  INDEX idx_entity_date (entity, started_at DESC),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================
-- Vue pour extraire les antécédents médicaux
-- =====================================================

CREATE OR REPLACE VIEW agenda_customers_antecedents AS
SELECT 
  id,
  firstname,
  lastname,
  birthdate,
  -- Extraction des antécédents depuis custom_attributes
  JSON_UNQUOTE(
    JSON_EXTRACT(
      JSON_EXTRACT(custom_attributes, '$[0]'),
      '$.value'
    )
  ) as antecedents_raw,
  JSON_UNQUOTE(
    JSON_EXTRACT(
      JSON_EXTRACT(custom_attributes, '$[0]'),
      '$.name'
    )
  ) as antecedents_type
FROM agenda_customers
WHERE custom_attributes IS NOT NULL
  AND JSON_LENGTH(custom_attributes) > 0;


-- =====================================================
-- Vérification
-- =====================================================

SELECT 'Tables créées avec succès !' as status;

SHOW TABLES LIKE 'agenda_%';

