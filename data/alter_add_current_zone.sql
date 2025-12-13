-- =====================================================
-- Ajout de la colonne current_zone à appointment_status
-- Pour tracker la position du patient sur le plan
-- =====================================================

ALTER TABLE poge_erp.appointment_status 
ADD COLUMN IF NOT EXISTS current_zone VARCHAR(50) DEFAULT 'outside' 
AFTER status;

-- Vérification
SELECT 'Colonne current_zone ajoutée !' as status;

DESCRIBE poge_erp.appointment_status;
