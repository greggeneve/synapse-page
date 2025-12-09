-- ============================================
-- IMPORT DES MOTS DE PASSE EMPLOYÉS
-- POGE Espace Collaborateurs
-- ============================================
-- 
-- Instructions :
-- 1. Remplacez 'MOT_DE_PASSE' par le vrai mot de passe de chaque employé
-- 2. Exécutez ce script sur votre base de données
-- 3. Les mots de passe seront hashés automatiquement avec SHA2-256
--
-- IMPORTANT : Ne commitez JAMAIS ce fichier avec les vrais mots de passe !
-- ============================================

-- D'abord, créer la table si elle n'existe pas
-- (exécuter create_employee_auth_table.sql d'abord)

-- Méthode 1 : Import individuel (recommandé)
-- Remplacez les emails et mots de passe ci-dessous

INSERT INTO employee_auth (employee_id, email, password_hash, must_change_password) 
SELECT 
    e.employee_id,
    'pauline.allamand@poge.ch',
    SHA2('MOT_DE_PASSE_PAULINE', 256),
    FALSE
FROM employees e 
WHERE JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel')) = 'pauline.allamand@poge.ch'
ON DUPLICATE KEY UPDATE password_hash = SHA2('MOT_DE_PASSE_PAULINE', 256);

INSERT INTO employee_auth (employee_id, email, password_hash, must_change_password) 
SELECT 
    e.employee_id,
    'bastien.alvarez@poge.ch',
    SHA2('MOT_DE_PASSE_BASTIEN', 256),
    FALSE
FROM employees e 
WHERE JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel')) = 'bastien.alvarez@poge.ch'
ON DUPLICATE KEY UPDATE password_hash = SHA2('MOT_DE_PASSE_BASTIEN', 256);

-- Ajoutez les autres employés ci-dessous...
-- Copiez le bloc ci-dessus et modifiez l'email et le mot de passe

/*
INSERT INTO employee_auth (employee_id, email, password_hash, must_change_password) 
SELECT 
    e.employee_id,
    'prenom.nom@poge.ch',
    SHA2('MOT_DE_PASSE', 256),
    FALSE
FROM employees e 
WHERE JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel')) = 'prenom.nom@poge.ch'
ON DUPLICATE KEY UPDATE password_hash = SHA2('MOT_DE_PASSE', 256);
*/


-- ============================================
-- Méthode 2 : Import en masse depuis CSV
-- ============================================
-- Si vous avez un fichier CSV avec les données, utilisez :
-- 
-- LOAD DATA INFILE '/path/to/passwords.csv'
-- INTO TABLE employee_auth
-- FIELDS TERMINATED BY ','
-- LINES TERMINATED BY '\n'
-- IGNORE 1 ROWS
-- (email, @password)
-- SET 
--     employee_id = (SELECT employee_id FROM employees WHERE JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.contact.email_professionnel')) = email),
--     password_hash = SHA2(@password, 256);


-- ============================================
-- Vérification après import
-- ============================================
-- SELECT email, LEFT(password_hash, 20) as hash_preview, must_change_password 
-- FROM employee_auth;

