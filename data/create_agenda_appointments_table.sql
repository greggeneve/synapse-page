-- =====================================================
-- Table agenda_appointments (rendez-vous)
-- Miroir local des RDV agenda.ch
-- =====================================================

CREATE TABLE IF NOT EXISTS agenda_appointments (
  -- Identifiant agenda.ch
  id INT PRIMARY KEY,
  
  -- Horaires
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  duration INT DEFAULT 0,
  
  -- Informations
  title VARCHAR(255),
  comment TEXT,
  enabled TINYINT(1) DEFAULT 1,
  
  -- Relations agenda.ch
  agenda_id INT,                    -- ID du praticien/agenda
  location_id INT,                  -- ID du lieu
  resource_id INT DEFAULT NULL,     -- ID ressource (optionnel)
  
  -- Patient (premier customer)
  customer_id INT,                  -- Lien vers agenda_customers
  customer_confirmed TINYINT(1) DEFAULT 0,
  customer_booked_online TINYINT(1) DEFAULT 0,
  customer_no_show TINYINT(1) DEFAULT 0,
  customer_comment TEXT,
  price DECIMAL(10,2) DEFAULT NULL,
  currency VARCHAR(10) DEFAULT 'CHF',
  
  -- Données brutes (si plusieurs customers)
  customers_json JSON,
  
  -- Timestamps agenda.ch
  created_at_agenda DATETIME,
  updated_at_agenda DATETIME,
  
  -- Timestamp local
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Index
  INDEX idx_customer (customer_id),
  INDEX idx_agenda (agenda_id),
  INDEX idx_start (start_at),
  INDEX idx_date_agenda (start_at, agenda_id),
  INDEX idx_updated (updated_at_agenda),
  
  -- Clé étrangère vers patients
  FOREIGN KEY (customer_id) REFERENCES agenda_customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Vérification
-- =====================================================

SELECT 'Table agenda_appointments créée !' as status;

SHOW TABLES LIKE 'agenda_%';

