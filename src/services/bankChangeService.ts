/**
 * Service de gestion des demandes de modification de coordonnées bancaires
 * Avec validation par SMS (OTP)
 */

import { query } from './mariadb';
import { generateOtpCode, sendBankChangeOtp, canSendSms } from './smsService';

export interface BankChangeRequest {
  id: number;
  employee_id: number;
  new_iban: string;
  new_clearing?: string;
  new_bic_swift?: string;
  new_bank_name: string;
  new_account_holder: string;
  old_iban?: string;
  old_bank_name?: string;
  status: 'pending' | 'validated' | 'rejected' | 'expired';
  created_at: string;
  validated_at?: string;
  otp_attempts: number;
}

export interface CurrentBankAccount {
  iban: string;
  bank_name: string;
  account_holder: string;
  bic_swift?: string;
  clearing?: string;
  date_debut_effet: string;
  validation_method: string;
}

/**
 * Récupère les coordonnées bancaires actuelles d'un employé
 */
export async function getCurrentBankAccount(employeeId: number): Promise<CurrentBankAccount | null> {
  const result = await query<any>(
    `SELECT 
       JSON_EXTRACT(profile_json, '$.bankInfo.bankAccountHistory') as history
     FROM employees 
     WHERE employee_id = ?`,
    [employeeId]
  );
  
  if (!result.success || !result.data?.[0]?.history) {
    return null;
  }
  
  try {
    const history = typeof result.data[0].history === 'string' 
      ? JSON.parse(result.data[0].history) 
      : result.data[0].history;
    
    const activeAccount = history.find((acc: any) => acc.is_active);
    
    if (!activeAccount) {
      return null;
    }
    
    return {
      iban: activeAccount.iban,
      bank_name: activeAccount.nom_banque,
      account_holder: activeAccount.titulaire_compte,
      bic_swift: activeAccount.bic_swift,
      clearing: activeAccount.clearing,
      date_debut_effet: activeAccount.date_debut_effet,
      validation_method: activeAccount.validation_method
    };
  } catch (e) {
    console.error('[BankChange] Erreur parsing historique bancaire:', e);
    return null;
  }
}

/**
 * Récupère le numéro de téléphone de l'employé
 */
export async function getEmployeePhone(employeeId: number): Promise<string | null> {
  const result = await query<any>(
    `SELECT 
       JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.contact.telephone_portable')) as phone,
       JSON_EXTRACT(profile_json, '$.bankInfo.phone_locked') as phone_locked
     FROM employees 
     WHERE employee_id = ?`,
    [employeeId]
  );
  
  if (!result.success || !result.data?.[0]) {
    return null;
  }
  
  const { phone, phone_locked } = result.data[0];
  
  // Vérifier si le téléphone est verrouillé (protection anti-fraude)
  if (phone_locked === true || phone_locked === 'true' || phone_locked === 1) {
    console.warn('[BankChange] Téléphone verrouillé pour employé', employeeId);
    // On retourne quand même le numéro, mais on devra bloquer la modification
  }
  
  return phone && phone !== 'null' ? phone : null;
}

/**
 * Vérifie si le téléphone est verrouillé
 */
export async function isPhoneLocked(employeeId: number): Promise<boolean> {
  const result = await query<any>(
    `SELECT JSON_EXTRACT(profile_json, '$.bankInfo.phone_locked') as phone_locked
     FROM employees 
     WHERE employee_id = ?`,
    [employeeId]
  );
  
  if (!result.success || !result.data?.[0]) {
    return false;
  }
  
  const locked = result.data[0].phone_locked;
  return locked === true || locked === 'true' || locked === 1;
}

/**
 * Récupère les demandes de modification en cours pour un employé
 */
export async function getPendingRequests(employeeId: number): Promise<BankChangeRequest[]> {
  const result = await query<BankChangeRequest>(
    `SELECT id, employee_id, new_iban, new_clearing, new_bic_swift, new_bank_name, 
            new_account_holder, old_iban, old_bank_name, status, created_at, 
            validated_at, otp_attempts
     FROM bank_change_requests 
     WHERE employee_id = ? AND status = 'pending'
     ORDER BY created_at DESC`,
    [employeeId]
  );
  
  return result.success ? (result.data || []) : [];
}

/**
 * Crée une nouvelle demande de modification bancaire et envoie le code SMS
 */
export async function createBankChangeRequest(
  employeeId: number,
  newIban: string,
  newBankName: string,
  newAccountHolder: string,
  newClearing?: string,
  newBicSwift?: string,
  employeeComment?: string
): Promise<{ success: boolean; error?: string; requestId?: number }> {
  // Vérifier si le téléphone est verrouillé
  if (await isPhoneLocked(employeeId)) {
    return { 
      success: false, 
      error: 'Votre numéro de téléphone est verrouillé. Contactez votre administrateur pour modifier vos coordonnées bancaires.' 
    };
  }
  
  // Récupérer le numéro de téléphone
  const phone = await getEmployeePhone(employeeId);
  if (!phone) {
    return { 
      success: false, 
      error: 'Aucun numéro de téléphone portable configuré. Contactez votre administrateur.' 
    };
  }
  
  // Vérifier les limites anti-abus
  const canSend = await canSendSms(employeeId);
  if (!canSend.allowed) {
    return { success: false, error: canSend.reason };
  }
  
  // Annuler les demandes en cours non validées
  await query(
    `UPDATE bank_change_requests SET status = 'expired' 
     WHERE employee_id = ? AND status = 'pending'`,
    [employeeId]
  );
  
  // Récupérer les anciennes coordonnées
  const currentAccount = await getCurrentBankAccount(employeeId);
  
  // Générer le code OTP
  const otpCode = generateOtpCode();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  // Créer la demande
  const insertResult = await query<any>(
    `INSERT INTO bank_change_requests 
     (employee_id, new_iban, new_clearing, new_bic_swift, new_bank_name, new_account_holder,
      old_iban, old_bank_name, otp_code, otp_expires_at, phone_number, employee_comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId,
      newIban.replace(/\s/g, '').toUpperCase(),
      newClearing || null,
      newBicSwift || null,
      newBankName,
      newAccountHolder,
      currentAccount?.iban || null,
      currentAccount?.bank_name || null,
      otpCode,
      otpExpires.toISOString().slice(0, 19).replace('T', ' '),
      phone,
      employeeComment || null
    ]
  );
  
  if (!insertResult.success) {
    return { success: false, error: 'Erreur lors de la création de la demande' };
  }
  
  // Envoyer le SMS
  const smsResult = await sendBankChangeOtp(employeeId, phone, otpCode);
  
  if (!smsResult.success) {
    // Supprimer la demande si le SMS échoue
    await query(`DELETE FROM bank_change_requests WHERE id = ?`, [insertResult.data?.insertId]);
    return { success: false, error: `Impossible d'envoyer le SMS: ${smsResult.error}` };
  }
  
  return { success: true, requestId: insertResult.data?.insertId };
}

/**
 * Valide une demande de modification avec le code OTP
 */
export async function validateBankChangeRequest(
  employeeId: number,
  otpCode: string
): Promise<{ success: boolean; error?: string }> {
  // Récupérer la demande en cours
  const requestResult = await query<any>(
    `SELECT id, otp_code, otp_expires_at, otp_attempts, new_iban, new_clearing, 
            new_bic_swift, new_bank_name, new_account_holder
     FROM bank_change_requests 
     WHERE employee_id = ? AND status = 'pending'
     ORDER BY created_at DESC 
     LIMIT 1`,
    [employeeId]
  );
  
  if (!requestResult.success || !requestResult.data?.[0]) {
    return { success: false, error: 'Aucune demande de modification en cours' };
  }
  
  const request = requestResult.data[0];
  
  // Vérifier le nombre de tentatives
  if (request.otp_attempts >= 5) {
    await query(
      `UPDATE bank_change_requests SET status = 'rejected' WHERE id = ?`,
      [request.id]
    );
    return { success: false, error: 'Trop de tentatives. La demande a été annulée.' };
  }
  
  // Vérifier l'expiration
  if (new Date(request.otp_expires_at) < new Date()) {
    await query(
      `UPDATE bank_change_requests SET status = 'expired' WHERE id = ?`,
      [request.id]
    );
    return { success: false, error: 'Le code a expiré. Veuillez refaire une demande.' };
  }
  
  // Incrémenter le compteur de tentatives
  await query(
    `UPDATE bank_change_requests SET otp_attempts = otp_attempts + 1 WHERE id = ?`,
    [request.id]
  );
  
  // Vérifier le code
  if (request.otp_code !== otpCode) {
    const remaining = 5 - request.otp_attempts - 1;
    return { 
      success: false, 
      error: `Code incorrect. ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.` 
    };
  }
  
  // Code valide ! Mettre à jour les coordonnées bancaires
  const updateSuccess = await applyBankChange(employeeId, request);
  
  if (!updateSuccess) {
    return { success: false, error: 'Erreur lors de la mise à jour des coordonnées' };
  }
  
  // Marquer la demande comme validée
  await query(
    `UPDATE bank_change_requests 
     SET status = 'validated', validated_at = NOW() 
     WHERE id = ?`,
    [request.id]
  );
  
  return { success: true };
}

/**
 * Applique le changement de coordonnées bancaires dans le profil employé
 */
async function applyBankChange(employeeId: number, request: any): Promise<boolean> {
  // Récupérer le profil actuel
  const profileResult = await query<any>(
    `SELECT profile_json FROM employees WHERE employee_id = ?`,
    [employeeId]
  );
  
  if (!profileResult.success || !profileResult.data?.[0]) {
    return false;
  }
  
  try {
    const profile = typeof profileResult.data[0].profile_json === 'string'
      ? JSON.parse(profileResult.data[0].profile_json)
      : profileResult.data[0].profile_json;
    
    // Initialiser bankInfo si nécessaire
    if (!profile.bankInfo) {
      profile.bankInfo = { bankAccountHistory: [] };
    }
    if (!profile.bankInfo.bankAccountHistory) {
      profile.bankInfo.bankAccountHistory = [];
    }
    
    // Désactiver tous les comptes existants
    profile.bankInfo.bankAccountHistory = profile.bankInfo.bankAccountHistory.map((acc: any) => ({
      ...acc,
      is_active: false
    }));
    
    // Ajouter le nouveau compte
    const newEntry = {
      id: `bank_${Date.now()}`,
      date_debut_effet: new Date().toISOString().split('T')[0],
      iban: request.new_iban,
      clearing: request.new_clearing,
      bic_swift: request.new_bic_swift,
      nom_banque: request.new_bank_name,
      titulaire_compte: request.new_account_holder,
      is_active: true,
      validation_method: 'sms',
      validated_at: new Date().toISOString(),
      validated_by: 'employee_sms',
      commentaire: 'Modifié par l\'employé via validation SMS'
    };
    
    profile.bankInfo.bankAccountHistory.push(newEntry);
    profile.bankInfo.current_iban = request.new_iban;
    profile.bankInfo.current_bank_name = request.new_bank_name;
    
    // Sauvegarder
    const updateResult = await query(
      `UPDATE employees SET profile_json = ? WHERE employee_id = ?`,
      [JSON.stringify(profile), employeeId]
    );
    
    return updateResult.success === true;
  } catch (e) {
    console.error('[BankChange] Erreur application changement:', e);
    return false;
  }
}

/**
 * Renvoie le code OTP (nouvelle demande)
 */
export async function resendOtp(employeeId: number): Promise<{ success: boolean; error?: string }> {
  // Vérifier les limites
  const canSend = await canSendSms(employeeId);
  if (!canSend.allowed) {
    return { success: false, error: canSend.reason };
  }
  
  // Récupérer la demande en cours
  const requestResult = await query<any>(
    `SELECT id, phone_number FROM bank_change_requests 
     WHERE employee_id = ? AND status = 'pending'
     ORDER BY created_at DESC 
     LIMIT 1`,
    [employeeId]
  );
  
  if (!requestResult.success || !requestResult.data?.[0]) {
    return { success: false, error: 'Aucune demande en cours' };
  }
  
  const request = requestResult.data[0];
  
  // Générer un nouveau code
  const newOtpCode = generateOtpCode();
  const newExpires = new Date(Date.now() + 10 * 60 * 1000);
  
  // Mettre à jour la demande
  await query(
    `UPDATE bank_change_requests 
     SET otp_code = ?, otp_expires_at = ?, otp_attempts = 0 
     WHERE id = ?`,
    [newOtpCode, newExpires.toISOString().slice(0, 19).replace('T', ' '), request.id]
  );
  
  // Envoyer le SMS
  const smsResult = await sendBankChangeOtp(employeeId, request.phone_number, newOtpCode);
  
  if (!smsResult.success) {
    return { success: false, error: `Impossible d'envoyer le SMS: ${smsResult.error}` };
  }
  
  return { success: true };
}

/**
 * Annule une demande en cours
 */
export async function cancelBankChangeRequest(employeeId: number): Promise<boolean> {
  const result = await query(
    `UPDATE bank_change_requests SET status = 'expired' 
     WHERE employee_id = ? AND status = 'pending'`,
    [employeeId]
  );
  
  return result.success === true;
}

/**
 * Récupère l'historique des modifications bancaires
 */
export async function getBankChangeHistory(employeeId: number): Promise<BankChangeRequest[]> {
  const result = await query<BankChangeRequest>(
    `SELECT id, employee_id, new_iban, new_bank_name, new_account_holder,
            old_iban, old_bank_name, status, created_at, validated_at
     FROM bank_change_requests 
     WHERE employee_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [employeeId]
  );
  
  return result.success ? (result.data || []) : [];
}
