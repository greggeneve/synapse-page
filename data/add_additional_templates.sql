-- =====================================================
-- Masques de documents supplémentaires
-- =====================================================

-- Masque 2 : Grégory + Pascal uniquement
INSERT INTO document_templates (name, description, is_default)
VALUES (
  'Masque Direction',
  'Masque avec uniquement les directeurs (Grégory Nykiel et Pascal Pagano)',
  0
);

-- Masque 3 : Grégory uniquement
INSERT INTO document_templates (name, description, is_default)
VALUES (
  'Masque Grégory Nykiel',
  'Masque avec uniquement Grégory Nykiel',
  0
);

-- =====================================================
-- Vérification - Liste des masques disponibles
-- =====================================================

SELECT 
  id,
  name,
  description,
  IF(is_default, '✓', '') as defaut,
  created_at
FROM document_templates
ORDER BY id;

