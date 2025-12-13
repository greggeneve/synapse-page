-- =====================================================
-- Table room_ip_mapping
-- Mapping des adresses IP fixes vers les salles de soins
-- Permet de localiser automatiquement les ostéos
-- =====================================================

CREATE TABLE IF NOT EXISTS poge_erp.room_ip_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,          -- Adresse IP (v4 ou v6)
  room_id VARCHAR(20) NOT NULL,             -- ID de la salle (room-101, room-102, etc.)
  room_label VARCHAR(50) NOT NULL,          -- Nom affiché (101, 102, etc.)
  floor VARCHAR(20) DEFAULT 'rdc-inf',      -- Étage (rdc-inf, rdc-sup)
  description VARCHAR(255) DEFAULT NULL,    -- Description optionnelle
  is_active TINYINT(1) DEFAULT 1,           -- Si le mapping est actif
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_ip (ip_address),
  INDEX idx_room (room_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Configuration des IPs du cabinet POGE (réseau 10.10.20.x)
-- =====================================================

INSERT INTO poge_erp.room_ip_mapping (ip_address, room_id, room_label, floor, description) VALUES
('10.10.20.101', 'room-101', '101', 'rdc-inf', 'PC Salle 101'),
('10.10.20.102', 'room-102', '102', 'rdc-inf', 'PC Salle 102'),
('10.10.20.103', 'room-103', '103', 'rdc-inf', 'PC Salle 103'),
('10.10.20.104', 'room-104', '104', 'rdc-inf', 'PC Salle 104'),
('10.10.20.105', 'room-105', '105', 'rdc-inf', 'PC Salle 105'),
('10.10.20.106', 'room-106', '106', 'rdc-inf', 'PC Salle 106'),
('10.10.20.121', 'room-121', '121', 'rdc-sup', 'PC Salle 121'),
('10.10.20.122', 'room-122', '122', 'rdc-sup', 'PC Salle 122'),
('10.10.20.123', 'room-123', '123', 'rdc-sup', 'PC Salle 123'),
('10.10.20.124', 'room-124', '124', 'rdc-sup', 'PC Salle 124')
ON DUPLICATE KEY UPDATE room_id = VALUES(room_id), room_label = VALUES(room_label);

-- =====================================================
-- Table pour tracker la position actuelle des ostéos
-- =====================================================

CREATE TABLE IF NOT EXISTS poge_erp.osteo_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,                 -- ID de l'ostéo
  agenda_id INT NOT NULL,                   -- ID agenda de l'ostéo
  current_room_id VARCHAR(20) DEFAULT NULL, -- Salle actuelle (NULL = pas localisé)
  ip_address VARCHAR(45) DEFAULT NULL,      -- Dernière IP connue
  last_seen_at DATETIME DEFAULT NULL,       -- Dernière activité
  date_jour DATE NOT NULL,                  -- Date du jour (reset quotidien)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_osteo_date (employee_id, date_jour),
  INDEX idx_agenda (agenda_id),
  INDEX idx_room (current_room_id),
  INDEX idx_date (date_jour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Vérification
-- =====================================================
SELECT 'Tables room_ip_mapping et osteo_locations créées !' as status;
