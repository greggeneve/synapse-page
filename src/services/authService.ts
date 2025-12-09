import { query } from './mariadb';
import { enqueueEmail, generatePasswordResetEmail, generateWelcomeEmail } from './emailService';
import { getEmployeePhoto } from './employeePhotoService';
import type { TeamMember } from '../types';

// URL de base de l'application (à configurer)
const APP_BASE_URL = import.meta.env.VITE_APP_URL || 'http://127.0.0.1:3010';

export interface AuthUser extends TeamMember {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  impersonating?: string; // ID de l'utilisateur qu'on impersonne
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  mustChangePassword?: boolean;
  passwordNeverSet?: boolean;
}

// Hash SHA-256 côté client (pour correspondre au hash SQL)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  try {
    // D'abord, vérifier si le compte existe et son état
    const accountCheck = await query<any>(`
      SELECT 
        ea.employee_id,
        ea.password_hash,
        ea.password_never_set,
        ea.locked_until,
        ea.failed_attempts,
        ea.is_super_admin,
        ea.is_admin,
        ea.must_change_password
      FROM employee_auth ea
      WHERE ea.email = ?
    `, [email.toLowerCase()]);

    if (!accountCheck.success || !accountCheck.data || accountCheck.data.length === 0) {
      return { success: false, error: 'Email non trouvé' };
    }

    const account = accountCheck.data[0];

    // Vérifier si le mot de passe n'a jamais été défini
    if (account.password_never_set || account.password_hash === null) {
      return { 
        success: false, 
        error: 'Compte non activé. Utilisez "Mot de passe oublié" pour définir votre mot de passe.',
        passwordNeverSet: true
      };
    }

    // Vérifier si le compte est bloqué
    if (account.locked_until && new Date(account.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(account.locked_until).getTime() - Date.now()) / 60000);
      return {
        success: false,
        error: `Compte temporairement bloqué. Réessayez dans ${minutesLeft} minute(s).`
      };
    }

    // Hasher le mot de passe et vérifier
    const passwordHash = await hashPassword(password);

    if (account.password_hash !== passwordHash) {
      // Enregistrer l'échec de connexion
      await query(`
        UPDATE employee_auth 
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE 
              WHEN failed_attempts >= 4 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE)
              ELSE locked_until 
            END
        WHERE email = ?
      `, [email.toLowerCase()]);

      return { success: false, error: 'Mot de passe incorrect' };
    }

    // Récupérer le profil complet
    const profileResult = await query<any>(`
      SELECT e.profile_json
      FROM employees e
      WHERE e.employee_id = ?
      AND JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif') = true
    `, [account.employee_id]);

    if (!profileResult.success || !profileResult.data || profileResult.data.length === 0) {
      return { success: false, error: 'Compte inactif' };
    }

    const profile = typeof profileResult.data[0].profile_json === 'string' 
      ? JSON.parse(profileResult.data[0].profile_json) 
      : profileResult.data[0].profile_json;

    // Récupérer la photo depuis la table employee_photos
    const photoUrl = await getEmployeePhoto(account.employee_id);

    // Enregistrer le succès
    await query(`
      UPDATE employee_auth 
      SET last_login = NOW(), failed_attempts = 0, locked_until = NULL
      WHERE employee_id = ?
    `, [account.employee_id]);

    const user: AuthUser = {
      id: account.employee_id,
      nom: profile.identification?.nom || '',
      prenom: profile.identification?.prenom || '',
      fonction: profile.hrStatus?.statut_dans_societe || 'Collaborateur',
      photo_url: photoUrl || profile.identification?.photo_url || undefined,
      email_professionnel: email.toLowerCase(),
      actif: true,
      isSuperAdmin: account.is_super_admin === 1,
      isAdmin: account.is_admin === 1
    };

    return {
      success: true,
      user,
      mustChangePassword: account.must_change_password === 1
    };

  } catch (error: any) {
    console.error('Erreur authentification:', error);
    return { success: false, error: 'Erreur lors de l\'authentification' };
  }
}

// Fonction pour qu'un super admin se connecte en tant qu'un autre utilisateur
export async function loginAsUser(adminUser: AuthUser, targetEmail: string): Promise<AuthResult> {
  // Vérifier que c'est bien un super admin
  if (!adminUser.isSuperAdmin) {
    return { success: false, error: 'Accès non autorisé' };
  }

  try {
    const result = await query<any>(`
      SELECT 
        ea.employee_id,
        e.profile_json
      FROM employee_auth ea
      JOIN employees e ON ea.employee_id = e.employee_id
      WHERE ea.email = ?
    `, [targetEmail.toLowerCase()]);

    if (!result.success || !result.data || result.data.length === 0) {
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    const row = result.data[0];
    const profile = typeof row.profile_json === 'string' 
      ? JSON.parse(row.profile_json) 
      : row.profile_json;

    // Récupérer la photo depuis la table employee_photos
    const photoUrl = await getEmployeePhoto(row.employee_id);

    const user: AuthUser = {
      id: row.employee_id,
      nom: profile.identification?.nom || '',
      prenom: profile.identification?.prenom || '',
      fonction: profile.hrStatus?.statut_dans_societe || 'Collaborateur',
      photo_url: photoUrl || profile.identification?.photo_url || undefined,
      email_professionnel: targetEmail.toLowerCase(),
      actif: true,
      isSuperAdmin: false,
      isAdmin: false,
      impersonating: `${adminUser.prenom} ${adminUser.nom}` // Qui impersonne
    };

    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: 'Erreur lors de la connexion' };
  }
}

// Liste des utilisateurs pour le super admin
export async function getAvailableUsers(): Promise<{ id: string; email: string; nom: string; prenom: string }[]> {
  const result = await query<any>(`
    SELECT 
      ea.employee_id,
      ea.email,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.nom')) AS nom,
      JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) AS prenom
    FROM employee_auth ea
    JOIN employees e ON ea.employee_id = e.employee_id
    WHERE JSON_EXTRACT(e.profile_json, '$.hrStatus.collaborateur_actif') = true
    ORDER BY nom, prenom
  `);

  if (!result.success || !result.data) return [];
  
  return result.data.map((row: any) => ({
    id: row.employee_id,
    email: row.email,
    nom: row.nom,
    prenom: row.prenom
  }));
}

// Fonction pour changer le mot de passe
export async function changePassword(
  employeeId: string, 
  currentPassword: string, 
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentHash = await hashPassword(currentPassword);
    const newHash = await hashPassword(newPassword);

    // Vérifier l'ancien mot de passe
    const check = await query<any>(`
      SELECT employee_id FROM employee_auth
      WHERE employee_id = ? AND password_hash = ?
    `, [employeeId, currentHash]);

    if (!check.success || !check.data || check.data.length === 0) {
      return { success: false, error: 'Mot de passe actuel incorrect' };
    }

    // Mettre à jour le mot de passe
    const update = await query(`
      UPDATE employee_auth 
      SET password_hash = ?, must_change_password = FALSE, updated_at = NOW()
      WHERE employee_id = ?
    `, [newHash, employeeId]);

    if (!update.success) {
      return { success: false, error: 'Erreur lors de la mise à jour' };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Erreur lors du changement de mot de passe' };
  }
}

// Fonction pour demander une réinitialisation de mot de passe
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Vérifier que le compte existe
    const checkResult = await query<any>(`
      SELECT 
        ea.employee_id,
        ea.password_never_set,
        JSON_UNQUOTE(JSON_EXTRACT(e.profile_json, '$.identification.prenom')) AS prenom
      FROM employee_auth ea
      JOIN employees e ON ea.employee_id = e.employee_id
      WHERE ea.email = ?
    `, [email.toLowerCase()]);

    if (!checkResult.success || !checkResult.data || checkResult.data.length === 0) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return { success: true };
    }

    const { prenom, password_never_set } = checkResult.data[0];

    // Générer un token unique
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + (password_never_set ? 86400000 : 3600000)); // 24h si premier login, sinon 1h

    // Sauvegarder le token
    const updateResult = await query(`
      UPDATE employee_auth 
      SET reset_token = ?, reset_token_expires = ?
      WHERE email = ?
    `, [token, expires.toISOString().slice(0, 19).replace('T', ' '), email.toLowerCase()]);

    if (!updateResult.success) {
      return { success: false, error: 'Erreur lors de la demande' };
    }

    // Générer le lien de réinitialisation
    const resetLink = `${APP_BASE_URL}/reset-password?token=${token}`;

    // Générer l'email (bienvenue ou reset selon le cas)
    const emailContent = password_never_set
      ? generateWelcomeEmail(prenom || 'Collaborateur', resetLink)
      : generatePasswordResetEmail(prenom || 'Collaborateur', resetLink);

    // Envoyer l'email via la queue
    const emailSent = await enqueueEmail({
      to: email.toLowerCase(),
      ...emailContent
    });

    if (!emailSent) {
      console.error('Erreur envoi email pour:', email);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erreur requestPasswordReset:', error);
    return { success: false, error: 'Erreur lors de la demande de réinitialisation' };
  }
}

// Vérifier un token de réinitialisation
export async function verifyResetToken(token: string): Promise<{ valid: boolean; email?: string; error?: string }> {
  try {
    const result = await query<any>(`
      SELECT email, reset_token_expires
      FROM employee_auth
      WHERE reset_token = ?
    `, [token]);

    if (!result.success || !result.data || result.data.length === 0) {
      return { valid: false, error: 'Lien invalide ou expiré' };
    }

    const { email, reset_token_expires } = result.data[0];

    if (new Date(reset_token_expires) < new Date()) {
      return { valid: false, error: 'Ce lien a expiré. Veuillez faire une nouvelle demande.' };
    }

    return { valid: true, email };
  } catch (error) {
    return { valid: false, error: 'Erreur de vérification' };
  }
}

// Réinitialiser le mot de passe avec un token
export async function resetPasswordWithToken(
  token: string, 
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Vérifier le token
    const verify = await verifyResetToken(token);
    if (!verify.valid) {
      return { success: false, error: verify.error };
    }

    // Hasher le nouveau mot de passe
    const passwordHash = await hashPassword(newPassword);

    // Mettre à jour le mot de passe et invalider le token
    const result = await query(`
      UPDATE employee_auth 
      SET 
        password_hash = ?,
        reset_token = NULL,
        reset_token_expires = NULL,
        must_change_password = FALSE,
        password_never_set = FALSE,
        updated_at = NOW()
      WHERE reset_token = ?
    `, [passwordHash, token]);

    if (!result.success) {
      return { success: false, error: 'Erreur lors de la mise à jour' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Erreur lors de la réinitialisation' };
  }
}

