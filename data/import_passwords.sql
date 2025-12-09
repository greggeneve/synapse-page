-- ============================================
-- IMPORT DES COMPTES POGE
-- ============================================
-- 
-- Configuration :
-- - Gregory Nykiel : Super Admin avec mot de passe "Griotte24"
-- - Tous les autres : Doivent utiliser "Mot de passe oublié"
--
-- ============================================

-- ============================================
-- 1. SUPER ADMIN - Gregory Nykiel
-- ============================================

INSERT INTO employee_auth (employee_id, email, password_hash, is_super_admin, is_admin, must_change_password, password_never_set)
SELECT 
    e.employee_id,
    LOWER(JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel'))),
    SHA2('Griotte24', 256),
    TRUE,   -- Super admin
    TRUE,   -- Admin
    FALSE,  -- Pas besoin de changer
    FALSE   -- Mot de passe défini
FROM employees e
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel'))) = 'gregory.nykiel@poge.ch'
ON DUPLICATE KEY UPDATE 
    password_hash = SHA2('Griotte24', 256),
    is_super_admin = TRUE,
    is_admin = TRUE,
    must_change_password = FALSE,
    password_never_set = FALSE,
    updated_at = NOW();

-- ============================================
-- 2. TOUS LES AUTRES EMPLOYÉS ACTIFS
-- Sans mot de passe (doivent utiliser "mot de passe oublié")
-- ============================================

INSERT INTO employee_auth (employee_id, email, password_hash, is_super_admin, is_admin, must_change_password, password_never_set)
SELECT 
    e.employee_id,
    LOWER(JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel'))),
    NULL,   -- Pas de mot de passe
    FALSE,  -- Pas super admin
    FALSE,  -- Pas admin
    TRUE,   -- Devra changer
    TRUE    -- Jamais défini
FROM employees e
WHERE JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif') = true
AND JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel')) IS NOT NULL
AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.contact.email_professionnel'))) != 'gregory.nykiel@poge.ch'
ON DUPLICATE KEY UPDATE 
    updated_at = NOW();

-- ============================================
-- 3. VÉRIFICATION
-- ============================================

SELECT 
    email,
    CASE 
        WHEN password_hash IS NOT NULL THEN '✓ Défini'
        ELSE '⏳ En attente'
    END AS mot_de_passe,
    CASE WHEN is_super_admin THEN '👑 Super Admin' 
         WHEN is_admin THEN '🔧 Admin' 
         ELSE '👤 Utilisateur' 
    END AS role,
    created_at
FROM employee_auth
ORDER BY is_super_admin DESC, is_admin DESC, email;

-- Résumé
SELECT 
    CONCAT('👑 Super Admin: ', SUM(is_super_admin)) AS super_admins,
    CONCAT('🔧 Admins: ', SUM(is_admin)) AS admins,
    CONCAT('✓ Avec mot de passe: ', SUM(password_hash IS NOT NULL)) AS avec_mdp,
    CONCAT('⏳ En attente: ', SUM(password_hash IS NULL)) AS en_attente,
    CONCAT('📊 Total: ', COUNT(*)) AS total
FROM employee_auth;
