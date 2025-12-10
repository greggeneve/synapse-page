/**
 * Service Mail Synapse
 * 
 * Ce service gère la communication avec le backend pour les opérations IMAP/SMTP.
 * Il accède aux données PayFlow en LECTURE SEULE.
 * 
 * L'API backend (PHP) gère les connexions IMAP/SMTP réelles.
 */

import { query } from './mariadb';

// ============================================================================
// Types
// ============================================================================

export interface EmailSettings {
  imap_host: string;
  imap_port: number;
  imap_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_tls: boolean;
}

export interface EmailCredentials {
  email_address: string;
  email_login: string;
  email_password: string;
  email_signature_category: string;
}

export interface EmailSignatureTemplate {
  id: number;
  category: string;
  name: string;
  template_html: string;
}

export interface EmailFolder {
  name: string;
  path: string;
  delimiter: string;
  unread_count: number;
  total_count: number;
  has_children: boolean;
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  content_id?: string;
}

export interface EmailMessage {
  id: string;
  uid: number;
  folder: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  preview: string;
}

export interface EmailMessageDetail extends EmailMessage {
  body_html: string;
  body_text: string;
  attachments: EmailAttachment[];
  in_reply_to?: string;
  references?: string[];
}

export interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
  attachments?: {
    filename: string;
    mime_type: string;
    base64_content: string;
  }[];
  in_reply_to?: string;
  references?: string[];
}

export interface MailApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Configuration API
// ============================================================================

const getMailApiEndpoint = () => {
  // Appeler directement l'API PHP sans passer par le proxy Vite
  // pour éviter les problèmes de réponses vides
  const phpApiUrl = import.meta.env.VITE_PHP_API_URL || 'http://10.10.10.140:8081/php-api.php';
  return phpApiUrl.replace(/php-api\.php$/, 'mail-api.php');
};

async function mailApiRequest<T>(
  action: string,
  params: Record<string, any> = {},
  retries: number = 2
): Promise<MailApiResponse<T>> {
  const endpoint = getMailApiEndpoint();
  
  if (!endpoint) {
    return {
      success: false,
      error: 'API mail non configurée'
    };
  }

  try {
    console.log('[MailAPI] Envoi requête:', action, 'vers', endpoint);
    const startTime = Date.now();
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...params }),
    });

    const duration = Date.now() - startTime;
    console.log('[MailAPI] Réponse reçue:', action, 'status:', res.status, 'durée:', duration, 'ms');
    
    const text = await res.text();
    console.log('[MailAPI] Contenu brut:', action, 'length:', text.length, 'début:', text.slice(0, 100));
    
    if (!res.ok) {
      return {
        success: false,
        error: `HTTP ${res.status}: ${text.slice(0, 300)}`
      };
    }

    if (!text || text.trim() === '') {
      // Retry si réponse vide
      if (retries > 0) {
        console.log('[MailAPI] Réponse vide pour', action, '- retry', retries);
        await new Promise(r => setTimeout(r, 1500)); // Augmenté à 1.5s
        return mailApiRequest<T>(action, params, retries - 1);
      }
      return {
        success: false,
        error: 'Réponse vide du serveur'
      };
    }

    try {
      const json = JSON.parse(text);
      return json;
    } catch (parseError) {
      return {
        success: false,
        error: `JSON invalide: ${text.slice(0, 200)}`
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: e?.message ?? 'Erreur réseau'
    };
  }
}

// ============================================================================
// Récupération des paramètres depuis PayFlow (LECTURE SEULE)
// ============================================================================

export async function getEmailSettings(): Promise<EmailSettings | null> {
  const result = await query<EmailSettings>(
    'SELECT imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls FROM email_settings_global LIMIT 1'
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    console.error('[MailService] Impossible de récupérer les paramètres email:', result.error);
    return null;
  }
  
  return result.data[0];
}

export async function getEmployeeEmailCredentials(employeeId: string): Promise<EmailCredentials | null> {
  // Les données email sont stockées dans profile_json.emailSettings
  const result = await query<any>(
    `SELECT 
       JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.emailSettings.email_address')) as email_address,
       JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.emailSettings.email_login')) as email_login,
       JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.emailSettings.email_password')) as email_password,
       JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.emailSettings.email_signature_category')) as email_signature_category
     FROM employees 
     WHERE employee_id = ?`,
    [employeeId]
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    console.error('[MailService] Credentials email non trouvés pour employé:', employeeId, result.error);
    return null;
  }
  
  const row = result.data[0];
  
  // JSON_UNQUOTE retourne "null" (string) pour les valeurs null, on doit les convertir
  return {
    email_address: row.email_address === 'null' ? '' : (row.email_address || ''),
    email_login: row.email_login === 'null' ? '' : (row.email_login || ''),
    email_password: row.email_password === 'null' ? '' : (row.email_password || ''),
    email_signature_category: row.email_signature_category === 'null' ? '' : (row.email_signature_category || '')
  };
}

export async function getSignatureTemplate(category: string): Promise<EmailSignatureTemplate | null> {
  const result = await query<any>(
    'SELECT id, category, template_html FROM email_signature_templates WHERE category = ?',
    [category]
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    const defaultResult = await query<any>(
      'SELECT id, category, template_html FROM email_signature_templates WHERE is_default = 1 LIMIT 1'
    );
    
    if (!defaultResult.success || !defaultResult.data || defaultResult.data.length === 0) {
      return null;
    }
    const row = defaultResult.data[0];
    return { ...row, name: row.category };
  }
  
  const row = result.data[0];
  return { ...row, name: row.category };
}

export async function getAllSignatureTemplates(): Promise<EmailSignatureTemplate[]> {
  const result = await query<any>(
    'SELECT id, category, template_html FROM email_signature_templates ORDER BY category'
  );
  
  if (!result.success || !result.data) {
    return [];
  }
  
  return result.data.map((row: any) => ({ ...row, name: row.category }));
}

// ============================================================================
// Génération de signature
// ============================================================================

export interface SignatureVariables {
  prenom: string;
  nom: string;
  titre: string;
  telephone: string;
  email: string;
}

export function generateSignature(template: string, variables: SignatureVariables): string {
  let signature = template;
  
  signature = signature.replace(/\{\{prenom\}\}/g, variables.prenom || '');
  signature = signature.replace(/\{\{nom\}\}/g, variables.nom || '');
  signature = signature.replace(/\{\{titre\}\}/g, variables.titre || '');
  signature = signature.replace(/\{\{telephone\}\}/g, variables.telephone || '');
  signature = signature.replace(/\{\{email\}\}/g, variables.email || '');
  
  return signature;
}

// ============================================================================
// API IMAP (via backend PHP)
// ============================================================================

export async function getMailFolders(credentials: EmailCredentials): Promise<EmailFolder[]> {
  const settings = await getEmailSettings();
  if (!settings) return [];

  const response = await mailApiRequest<EmailFolder[]>('getFolders', {
    credentials,
    settings
  });

  if (!response.success) {
    console.error('[MailService] Erreur getFolders:', response.error);
    return [];
  }

  return response.data || [];
}

export async function getUnreadCount(credentials: EmailCredentials): Promise<number> {
  const settings = await getEmailSettings();
  if (!settings) return 0;

  const response = await mailApiRequest<{ count: number }>('getUnreadCount', {
    credentials,
    settings
  });

  if (!response.success) {
    console.error('[MailService] Erreur getUnreadCount:', response.error);
    return 0;
  }

  return response.data?.count || 0;
}

export async function getMessages(
  credentials: EmailCredentials,
  folder: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ messages: EmailMessage[]; total: number }> {
  const settings = await getEmailSettings();
  if (!settings) return { messages: [], total: 0 };

  const response = await mailApiRequest<{ messages: EmailMessage[]; total: number }>('getMessages', {
    credentials,
    settings,
    folder,
    offset,
    limit
  });

  if (!response.success) {
    console.error('[MailService] Erreur getMessages:', response.error);
    return { messages: [], total: 0 };
  }

  return response.data || { messages: [], total: 0 };
}

export async function getMessage(
  credentials: EmailCredentials,
  folder: string,
  uid: number
): Promise<EmailMessageDetail | null> {
  const settings = await getEmailSettings();
  if (!settings) return null;

  const response = await mailApiRequest<EmailMessageDetail>('getMessage', {
    credentials,
    settings,
    folder,
    uid
  });

  if (!response.success) {
    console.error('[MailService] Erreur getMessage:', response.error);
    return null;
  }

  return response.data || null;
}

export async function getAttachment(
  credentials: EmailCredentials,
  folder: string,
  uid: number,
  attachmentId: string
): Promise<{ filename: string; mime_type: string; base64_content: string } | null> {
  const settings = await getEmailSettings();
  if (!settings) return null;

  const response = await mailApiRequest<{ filename: string; mime_type: string; base64_content: string }>('getAttachment', {
    credentials,
    settings,
    folder,
    uid,
    attachmentId
  });

  if (!response.success) {
    console.error('[MailService] Erreur getAttachment:', response.error);
    return null;
  }

  return response.data || null;
}

export async function markAsRead(
  credentials: EmailCredentials,
  folder: string,
  uid: number
): Promise<boolean> {
  const settings = await getEmailSettings();
  if (!settings) return false;

  const response = await mailApiRequest<{ success: boolean }>('markAsRead', {
    credentials,
    settings,
    folder,
    uid
  });

  return response.success && response.data?.success === true;
}

export async function markAsUnread(
  credentials: EmailCredentials,
  folder: string,
  uid: number
): Promise<boolean> {
  const settings = await getEmailSettings();
  if (!settings) return false;

  const response = await mailApiRequest<{ success: boolean }>('markAsUnread', {
    credentials,
    settings,
    folder,
    uid
  });

  return response.success && response.data?.success === true;
}

export async function deleteMessage(
  credentials: EmailCredentials,
  folder: string,
  uid: number
): Promise<boolean> {
  const settings = await getEmailSettings();
  if (!settings) return false;

  const response = await mailApiRequest<{ success: boolean }>('deleteMessage', {
    credentials,
    settings,
    folder,
    uid
  });

  return response.success && response.data?.success === true;
}

export async function moveMessage(
  credentials: EmailCredentials,
  folder: string,
  uid: number,
  targetFolder: string
): Promise<boolean> {
  const settings = await getEmailSettings();
  if (!settings) return false;

  const response = await mailApiRequest<{ success: boolean }>('moveMessage', {
    credentials,
    settings,
    folder,
    uid,
    targetFolder
  });

  return response.success && response.data?.success === true;
}

// ============================================================================
// API SMTP (via backend PHP)
// ============================================================================

export async function sendEmail(
  credentials: EmailCredentials,
  request: SendEmailRequest
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const settings = await getEmailSettings();
  if (!settings) {
    return { success: false, error: 'Paramètres email non disponibles' };
  }

  const response = await mailApiRequest<{ message_id: string }>('sendEmail', {
    credentials,
    settings,
    ...request
  });

  if (!response.success) {
    return { success: false, error: response.error };
  }

  return { success: true, message_id: response.data?.message_id };
}

export async function saveDraft(
  credentials: EmailCredentials,
  request: SendEmailRequest
): Promise<{ success: boolean; uid?: number; error?: string }> {
  const settings = await getEmailSettings();
  if (!settings) {
    return { success: false, error: 'Paramètres email non disponibles' };
  }

  const response = await mailApiRequest<{ uid: number }>('saveDraft', {
    credentials,
    settings,
    ...request
  });

  if (!response.success) {
    return { success: false, error: response.error };
  }

  return { success: true, uid: response.data?.uid };
}

// ============================================================================
// Helpers
// ============================================================================

export function formatEmailAddress(address: EmailAddress): string {
  if (address.name && address.name !== address.email) {
    return `${address.name} <${address.email}>`;
  }
  return address.email;
}

export function parseEmailAddresses(input: string): string[] {
  if (!input) return [];
  
  const addresses = input.split(/[,;]/).map(a => a.trim()).filter(a => a.length > 0);
  
  return addresses.map(addr => {
    const match = addr.match(/<([^>]+)>/);
    return match ? match[1] : addr;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}
