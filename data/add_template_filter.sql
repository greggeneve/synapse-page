-- =====================================================
-- Ajouter le filtre de praticiens aux templates
-- =====================================================

-- Colonne pour filtrer les praticiens
-- Valeurs possibles:
--   'all' = tous les praticiens actifs
--   'direction' = Grégory + Pascal
--   'gregory_only' = Grégory uniquement
--   Ou une liste d'IDs: '54,42' (employee_ids séparés par virgule)
ALTER TABLE document_templates 
ADD COLUMN practitioner_filter VARCHAR(255) DEFAULT 'all' AFTER is_default;

-- Mettre à jour les filtres pour chaque masque
UPDATE document_templates 
SET practitioner_filter = 'all' 
WHERE name = 'Masque POGE Standard';

UPDATE document_templates 
SET practitioner_filter = 'direction' 
WHERE name = 'Masque Direction';

UPDATE document_templates 
SET practitioner_filter = 'gregory_only' 
WHERE name = 'Masque Grégory Nykiel';

-- =====================================================
-- Vérification
-- =====================================================

SELECT 
  id,
  name,
  practitioner_filter,
  IF(is_default, '✓ Défaut', '') as defaut
FROM document_templates
ORDER BY id;

