-- =====================================================
-- Tables pour le workflow des rapports d'assurance
-- =====================================================

-- Table principale des rapports d'assurance
CREATE TABLE IF NOT EXISTS insurance_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Identification du rapport
  reference_number VARCHAR(100),           -- Numéro de référence du dossier assurance
  insurance_name VARCHAR(255),             -- Nom de l'assurance
  insurance_type ENUM('maladie', 'accident', 'ai', 'autre') DEFAULT 'maladie',
  
  -- Patient concerné
  patient_firstname VARCHAR(100),
  patient_lastname VARCHAR(100),
  patient_birthdate DATE,
  patient_avs VARCHAR(20),                 -- Numéro AVS si disponible
  treatment_dates TEXT,                    -- Dates des traitements concernés
  
  -- Fichiers
  original_pdf LONGBLOB,                   -- PDF original scanné
  original_filename VARCHAR(255),
  filled_pdf LONGBLOB,                     -- PDF rempli par l'ostéo
  filled_filename VARCHAR(255),
  
  -- Attribution et workflow
  assigned_osteo_id INT,                   -- Ostéopathe assigné
  status ENUM(
    'pending_assignment',                  -- En attente d'attribution (vient d'être uploadé)
    'assigned',                            -- Assigné à un ostéo
    'in_progress',                         -- En cours de remplissage
    'submitted_for_review',                -- Soumis pour validation
    'needs_correction',                    -- À corriger
    'approved',                            -- Validé par direction
    'ready_to_send',                       -- Prêt à envoyer (attribué à l'accueil)
    'sent',                                -- Envoyé
    'archived'                             -- Archivé
  ) DEFAULT 'pending_assignment',
  
  -- Validation direction
  reviewer_id INT,                         -- ID du directeur qui valide
  review_comment TEXT,                     -- Commentaire/avis du directeur
  review_audio_url TEXT,                   -- URL/données audio de l'avis dicté
  
  -- Envoi
  assigned_sender_id INT,                  -- Membre de l'accueil assigné pour l'envoi
  sent_date DATE,
  sent_method ENUM('courrier', 'email', 'fax') DEFAULT 'courrier',
  
  -- Dates de suivi
  received_date DATE,                      -- Date de réception du formulaire
  due_date DATE,                           -- Date limite de réponse
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Lien avec agenda.ch (si patient identifié)
  agenda_customer_id INT,
  
  -- Métadonnées IA
  ai_extraction_data JSON,                 -- Données extraites par l'IA
  ai_confidence_score DECIMAL(3,2),        -- Score de confiance de l'extraction
  
  -- Index
  INDEX idx_status (status),
  INDEX idx_assigned_osteo (assigned_osteo_id),
  INDEX idx_reviewer (reviewer_id),
  INDEX idx_patient (patient_lastname, patient_firstname),
  INDEX idx_due_date (due_date),
  
  -- Clés étrangères
  FOREIGN KEY (assigned_osteo_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_sender_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

-- Table historique des actions sur les rapports
CREATE TABLE IF NOT EXISTS insurance_report_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  action ENUM(
    'created',
    'assigned',
    'started_filling',
    'saved_draft',
    'submitted',
    'review_requested',
    'review_comment_added',
    'correction_requested',
    'approved',
    'assigned_for_sending',
    'sent',
    'archived'
  ) NOT NULL,
  performed_by INT,                        -- employee_id de l'auteur de l'action
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (report_id) REFERENCES insurance_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES employees(employee_id) ON DELETE SET NULL,
  INDEX idx_report (report_id),
  INDEX idx_date (created_at)
);

-- Table des annotations PDF (pour le remplissage)
CREATE TABLE IF NOT EXISTS insurance_report_annotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  page_number INT NOT NULL,
  annotation_type ENUM('text', 'checkbox', 'signature', 'date', 'drawing') NOT NULL,
  x_position DECIMAL(10,4) NOT NULL,       -- Position X en pourcentage
  y_position DECIMAL(10,4) NOT NULL,       -- Position Y en pourcentage
  width DECIMAL(10,4),
  height DECIMAL(10,4),
  content TEXT,                            -- Texte ou données de l'annotation
  font_size INT DEFAULT 12,
  font_family VARCHAR(50) DEFAULT 'Helvetica',
  color VARCHAR(20) DEFAULT '#000000',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (report_id) REFERENCES insurance_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES employees(employee_id) ON DELETE SET NULL,
  INDEX idx_report_page (report_id, page_number)
);

-- Vue pour les rapports assignés aux ostéos
CREATE OR REPLACE VIEW v_osteo_insurance_reports AS
SELECT 
  ir.*,
  CONCAT(e.profile_json->>'$.identification.prenom', ' ', e.profile_json->>'$.identification.nom') AS osteo_name,
  (SELECT COUNT(*) FROM insurance_report_annotations WHERE report_id = ir.id) AS annotation_count
FROM insurance_reports ir
LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
WHERE ir.status IN ('assigned', 'in_progress', 'needs_correction');

-- Vue pour les rapports à valider (direction)
CREATE OR REPLACE VIEW v_review_insurance_reports AS
SELECT 
  ir.*,
  CONCAT(e.profile_json->>'$.identification.prenom', ' ', e.profile_json->>'$.identification.nom') AS osteo_name,
  (SELECT MAX(created_at) FROM insurance_report_history WHERE report_id = ir.id AND action = 'submitted') AS submitted_at
FROM insurance_reports ir
LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
WHERE ir.status = 'submitted_for_review';

-- Vue pour les rapports à envoyer (accueil)
CREATE OR REPLACE VIEW v_send_insurance_reports AS
SELECT 
  ir.*,
  CONCAT(e.profile_json->>'$.identification.prenom', ' ', e.profile_json->>'$.identification.nom') AS osteo_name,
  CONCAT(s.profile_json->>'$.identification.prenom', ' ', s.profile_json->>'$.identification.nom') AS sender_name
FROM insurance_reports ir
LEFT JOIN employees e ON ir.assigned_osteo_id = e.employee_id
LEFT JOIN employees s ON ir.assigned_sender_id = s.employee_id
WHERE ir.status = 'ready_to_send';

