-- Table pour stocker les préférences utilisateur (positions des dossiers mail, etc.)
-- À exécuter sur la base de données poge_employes

CREATE TABLE IF NOT EXISTS user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_employee_preference (employee_id, preference_key),
    INDEX idx_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exemples de preference_key :
-- 'mail_folder_order' : ordre des dossiers mail (JSON array)
-- 'dashboard_layout' : layout du dashboard
-- 'theme' : préférences de thème
