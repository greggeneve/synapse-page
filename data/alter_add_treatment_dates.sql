-- Ajouter la colonne treatment_dates si elle n'existe pas
ALTER TABLE insurance_reports 
ADD COLUMN IF NOT EXISTS treatment_dates TEXT AFTER patient_avs;
