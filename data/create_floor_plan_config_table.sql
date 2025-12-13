-- =====================================================
-- Table floor_plan_config
-- Stocke la configuration des zones du plan du cabinet
-- =====================================================

CREATE TABLE IF NOT EXISTS floor_plan_config (
  floor_id VARCHAR(20) PRIMARY KEY,        -- 'rdc-inf' ou 'rdc-sup'
  zones_config JSON NOT NULL,               -- Configuration JSON des zones
  updated_by INT DEFAULT NULL,              -- Dernier utilisateur à avoir modifié
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Vérification
-- =====================================================
SELECT 'Table floor_plan_config créée !' as status;
