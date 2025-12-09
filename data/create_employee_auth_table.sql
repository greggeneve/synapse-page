-- ============================================
-- Table d'authentification des employés
-- POGE Espace Collaborateurs
-- ============================================

CREATE TABLE IF NOT EXISTS employee_auth (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,  -- NULL = doit utiliser "mot de passe oublié"
    
    -- Rôles et permissions
    is_super_admin BOOLEAN DEFAULT FALSE,  -- Peut se connecter en tant que n'importe qui
    is_admin BOOLEAN DEFAULT FALSE,        -- Accès aux fonctions admin
    
    -- Sécurité
    must_change_password BOOLEAN DEFAULT TRUE,
    password_never_set BOOLEAN DEFAULT TRUE,  -- Jamais défini de mot de passe
    failed_attempts INT DEFAULT 0,
    locked_until DATETIME NULL,
    last_login DATETIME NULL,
    
    -- Récupération mot de passe
    reset_token VARCHAR(100) NULL,
    reset_token_expires DATETIME NULL,
    
    -- Métadonnées
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'system',
    
    -- Index
    INDEX idx_email (email),
    INDEX idx_employee_id (employee_id),
    INDEX idx_reset_token (reset_token),
    
    -- Clé étrangère (si la table employees existe)
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Fonction pour hasher les mots de passe
-- Utilise SHA2-256 (simple mais fonctionnel)
-- En production, préférer bcrypt via PHP
-- ============================================

-- Exemple d'insertion (remplacer par vos vrais mots de passe)
-- Le hash est SHA2-256 du mot de passe

-- INSERT INTO employee_auth (employee_id, email, password_hash) VALUES
-- ('emp_001', 'prenom.nom@poge.ch', SHA2('motdepasse123', 256));

-- ============================================
-- Vue pour faciliter la vérification de login
-- ============================================

CREATE OR REPLACE VIEW v_employee_login AS
SELECT 
    ea.id AS auth_id,
    ea.employee_id,
    ea.email,
    ea.password_hash,
    ea.must_change_password,
    ea.failed_attempts,
    ea.locked_until,
    ea.last_login,
    e.profile_json,
    JSON_EXTRACT(e.profile_json, '$.identification.nom') AS nom,
    JSON_EXTRACT(e.profile_json, '$.identification.prenom') AS prenom,
    JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif') AS actif
FROM employee_auth ea
JOIN employees e ON ea.employee_id = e.employee_id;

-- ============================================
-- Procédure pour enregistrer un login réussi
-- ============================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS sp_record_login_success(IN p_employee_id VARCHAR(50))
BEGIN
    UPDATE employee_auth 
    SET 
        last_login = NOW(),
        failed_attempts = 0,
        locked_until = NULL
    WHERE employee_id = p_employee_id;
END //

CREATE PROCEDURE IF NOT EXISTS sp_record_login_failure(IN p_email VARCHAR(255))
BEGIN
    DECLARE v_attempts INT;
    
    -- Incrémenter les tentatives
    UPDATE employee_auth 
    SET failed_attempts = failed_attempts + 1
    WHERE email = p_email;
    
    -- Récupérer le nombre de tentatives
    SELECT failed_attempts INTO v_attempts 
    FROM employee_auth 
    WHERE email = p_email;
    
    -- Bloquer après 5 tentatives (15 minutes)
    IF v_attempts >= 5 THEN
        UPDATE employee_auth 
        SET locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
        WHERE email = p_email;
    END IF;
END //

DELIMITER ;

-- ============================================
-- Script pour importer les mots de passe
-- À exécuter après avoir rempli le template
-- ============================================

-- Template d'import (à personnaliser avec vos données) :
/*
INSERT INTO employee_auth (employee_id, email, password_hash, must_change_password) 
SELECT 
    e.employee_id,
    JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel')),
    SHA2('MotDePasseTemporaire', 256),
    TRUE  -- Forcer le changement au premier login
FROM employees e
WHERE JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif') = true
AND JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel') IS NOT NULL;
*/

