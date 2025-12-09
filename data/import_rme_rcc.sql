-- ================================================
-- Import des numéros RME RCC pour chaque employé
-- À exécuter sur poge_erp
-- ================================================

-- ALLAMAND Pauline - F037063
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC F037063')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'allamand'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'pauline';

-- CHOLLET Tiphaine - V963563
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC V963563')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'chollet'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'tiphaine';

-- BATARD Coline - S452864
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC S452864')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'batard'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'coline';

-- DALMASSO Alexis - L616364
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC L616364')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'dalmasso'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'alexis';

-- FAVRE Nico - Z383664
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC Z383664')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'favre'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) LIKE 'nico%';

-- GORCHYNSKYY Vladyslav - X791764
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC X791764')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'gorchynskyy'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'vladyslav';

-- GACHET Maud - MO93664
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC MO93664')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'gachet'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'maud';

-- NYKIEL Gregory - U226560
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC U226560')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'nykiel'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) LIKE 'gr%gory';

-- PAGANO Pascal - G226960
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC G226960')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'pagano'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'pascal';

-- LOUIS CESAR Philippe - P361963
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC P361963')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) LIKE '%louis%c%sar%'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'philippe';

-- RAUBER Quentin - M854464
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC M854464')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'rauber'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'quentin';

-- PETIT Romain - N391364
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC N391364')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'petit'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'romain';

-- SPAENS Jonathan - R925862
UPDATE employees 
SET profile_json = JSON_SET(profile_json, '$.externalIds.rme_rcc', 'RME RCC R925862')
WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'))) = 'spaens'
  AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom'))) = 'jonathan';

-- ================================================
-- VÉRIFICATION
-- ================================================
SELECT 
  JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.prenom')) AS prenom,
  JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom')) AS nom,
  JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.externalIds.rme_rcc')) AS rme_rcc
FROM employees 
WHERE JSON_EXTRACT(profile_json, '$.hrStatus.collaborateur_actif') = true
ORDER BY 
  JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.identification.nom'));

