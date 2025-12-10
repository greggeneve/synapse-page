/**
 * Service SMS pour l'envoi de codes de vérification (OTP)
 * Utilise Twilio comme provider
 */

import { query } from './mariadb';

interface SmsConfig {
  provider: 'twilio' | 'vonage' | 'other';
  account_sid: string;
  auth_token: string;
  from_number: string;
  is_active: boolean;
}

interface SendSmsResult {
  success: boolean;
  message_sid?: string;
  error?: string;
}

/**
 * Récupère la configuration SMS depuis la base de données
 */
async function getSmsConfig(): Promise<SmsConfig | null> {
  const result = await query<SmsConfig>(
    `SELECT provider, account_sid, auth_token, from_number, is_active 
     FROM sms_config 
     WHERE is_active = true 
     LIMIT 1`
  );
  
  if (!result.success || !result.data?.[0]) {
    console.error('[SMS] Aucune configuration SMS active trouvée');
    return null;
  }
  
  return result.data[0];
}

/**
 * Génère un code OTP à 6 chiffres
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Envoie un SMS via Twilio
 */
export async function sendSms(
  phoneNumber: string,
  message: string,
  employeeId: number,
  messageType: 'bank_otp' | 'login_otp' | 'notification' = 'bank_otp'
): Promise<SendSmsResult> {
  const config = await getSmsConfig();
  
  if (!config) {
    return { success: false, error: 'Configuration SMS non trouvée' };
  }
  
  // Formater le numéro de téléphone (ajouter +41 si besoin pour la Suisse)
  let formattedPhone = phoneNumber.replace(/\s/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '+41' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+41' + formattedPhone;
  }
  
  try {
    // Appel API Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.account_sid}:${config.auth_token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: formattedPhone,
        From: config.from_number,
        Body: message,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[SMS] Erreur Twilio:', data);
      
      // Log l'échec
      await logSms(employeeId, formattedPhone, messageType, null, 'failed', data.message || 'Erreur Twilio');
      
      return { success: false, error: data.message || 'Erreur envoi SMS' };
    }
    
    // Log le succès
    await logSms(employeeId, formattedPhone, messageType, data.sid, 'sent');
    
    return { success: true, message_sid: data.sid };
  } catch (error: any) {
    console.error('[SMS] Erreur:', error);
    await logSms(employeeId, formattedPhone, messageType, null, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Log l'envoi SMS dans la base de données
 */
async function logSms(
  employeeId: number,
  phoneNumber: string,
  messageType: 'bank_otp' | 'login_otp' | 'notification',
  messageSid: string | null,
  status: 'sent' | 'delivered' | 'failed',
  errorMessage?: string
): Promise<void> {
  await query(
    `INSERT INTO sms_logs (employee_id, phone_number, message_type, message_sid, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [employeeId, phoneNumber, messageType, messageSid, status, errorMessage || null]
  );
}

/**
 * Vérifie si on peut envoyer un SMS (limite anti-abus)
 * Max 5 SMS par heure par employé
 */
export async function canSendSms(employeeId: number): Promise<{ allowed: boolean; reason?: string }> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM sms_logs 
     WHERE employee_id = ? 
     AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [employeeId]
  );
  
  if (result.success && result.data?.[0]) {
    if (result.data[0].count >= 5) {
      return { allowed: false, reason: 'Trop de SMS envoyés. Réessayez dans 1 heure.' };
    }
  }
  
  return { allowed: true };
}

/**
 * Envoie un code OTP pour validation de changement bancaire
 */
export async function sendBankChangeOtp(
  employeeId: number,
  phoneNumber: string,
  otpCode: string
): Promise<SendSmsResult> {
  const message = `POGE - Code de vérification: ${otpCode}\n\nCe code expire dans 10 minutes.\nNe partagez jamais ce code.`;
  
  return sendSms(phoneNumber, message, employeeId, 'bank_otp');
}
