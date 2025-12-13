-- =====================================================
-- Table appointment_status
-- Tracking des statuts patients (arrivée, consultation, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS appointment_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Référence au RDV
  appointment_id INT NOT NULL,          -- ID du RDV dans poge_agenda.agenda_appointments
  date_rdv DATE NOT NULL,               -- Date du RDV (pour requêtes rapides)
  agenda_id INT NOT NULL,               -- ID de l'ostéo/praticien
  
  -- Statut
  status ENUM('scheduled', 'arrived', 'in_progress', 'completed', 'no_show') DEFAULT 'scheduled',
  
  -- Timestamps des étapes
  arrived_at DATETIME DEFAULT NULL,     -- Quand le patient est arrivé
  started_at DATETIME DEFAULT NULL,     -- Quand la consultation a commencé
  ended_at DATETIME DEFAULT NULL,       -- Quand la consultation s'est terminée
  
  -- Traçabilité
  marked_arrived_by INT DEFAULT NULL,   -- Employee qui a marqué l'arrivée
  marked_started_by INT DEFAULT NULL,   -- Employee qui a démarré la consultation
  marked_ended_by INT DEFAULT NULL,     -- Employee qui a terminé
  
  -- Notes optionnelles
  notes TEXT DEFAULT NULL,
  
  -- Timestamps système
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Contraintes
  UNIQUE KEY unique_appointment_date (appointment_id, date_rdv),
  INDEX idx_date_status (date_rdv, status),
  INDEX idx_date_agenda (date_rdv, agenda_id),
  INDEX idx_agenda_status (agenda_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Vérification
-- =====================================================
SELECT 'Table appointment_status créée !' as status;
