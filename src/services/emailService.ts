import { query } from './mariadb';

export interface EmailMessage {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64
  encoding: 'base64';
}

export interface EmailWithAttachments {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

// Ajouter un email à la queue (sera traité par email-worker)
export async function enqueueEmail(message: EmailMessage): Promise<boolean> {
  const result = await query(`
    INSERT INTO email_queue (
      to_email,
      subject,
      body_html,
      body_text,
      status
    ) VALUES (?, ?, ?, ?, 'PENDING')
  `, [
    message.to,
    message.subject,
    message.bodyHtml,
    message.bodyText
  ]);

  return result.success;
}

// Ajouter un email avec pièces jointes à la queue
export async function queueEmail(email: EmailWithAttachments): Promise<boolean> {
  try {
    // Stocker les attachments en JSON dans une colonne dédiée
    const attachmentsJson = email.attachments ? JSON.stringify(email.attachments) : null;
    
    const result = await query(`
      INSERT INTO email_queue (
        to_email,
        subject,
        body_html,
        body_text,
        attachments,
        status
      ) VALUES (?, ?, ?, ?, ?, 'PENDING')
    `, [
      email.to,
      email.subject,
      email.html,
      email.text || '',
      attachmentsJson
    ]);

    return result.success;
  } catch (error) {
    console.error('Erreur queueEmail:', error);
    return false;
  }
}

// Template email de réinitialisation de mot de passe
export function generatePasswordResetEmail(
  prenom: string,
  resetLink: string
): { subject: string; bodyHtml: string; bodyText: string } {
  const subject = 'POGE - Réinitialisation de votre mot de passe';
  
  const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <img src="https://poge.ch/logo-poge.png" alt="POGE" style="width: 80px; height: auto;">
      <h1 style="margin: 16px 0 8px; color: #1e293b; font-size: 24px;">Espace Collaborateurs</h1>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Permanence Ostéopathique de Genève</p>
    </div>
    
    <!-- Content -->
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px;">Bonjour ${prenom},</h2>
      
      <p style="margin: 0 0 24px; color: #475569; line-height: 1.6;">
        Vous avez demandé à réinitialiser votre mot de passe pour accéder à l'Espace Collaborateurs POGE.
      </p>
      
      <p style="margin: 0 0 24px; color: #475569; line-height: 1.6;">
        Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :
      </p>
      
      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Définir mon mot de passe
        </a>
      </div>
      
      <p style="margin: 0 0 16px; color: #64748b; font-size: 14px; line-height: 1.6;">
        Ce lien est valable pendant <strong>1 heure</strong>. Passé ce délai, vous devrez faire une nouvelle demande.
      </p>
      
      <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
        Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; color: #94a3b8; font-size: 12px;">
      <p style="margin: 0 0 8px;">
        Permanence Ostéopathique de Genève SA<br>
        Rue de la Terrassière 58, 1207 Genève
      </p>
      <p style="margin: 0;">
        © ${new Date().getFullYear()} POGE - Tous droits réservés
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  const bodyText = `
Bonjour ${prenom},

Vous avez demandé à réinitialiser votre mot de passe pour accéder à l'Espace Collaborateurs POGE.

Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :
${resetLink}

Ce lien est valable pendant 1 heure. Passé ce délai, vous devrez faire une nouvelle demande.

Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.

---
Permanence Ostéopathique de Genève SA
Rue de la Terrassière 58, 1207 Genève
  `.trim();
  
  return { subject, bodyHtml, bodyText };
}

// Template email de bienvenue (première connexion)
export function generateWelcomeEmail(
  prenom: string,
  resetLink: string
): { subject: string; bodyHtml: string; bodyText: string } {
  const subject = 'POGE - Bienvenue sur l\'Espace Collaborateurs !';
  
  const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <img src="https://poge.ch/logo-poge.png" alt="POGE" style="width: 80px; height: auto;">
      <h1 style="margin: 16px 0 8px; color: #1e293b; font-size: 24px;">Espace Collaborateurs</h1>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Permanence Ostéopathique de Genève</p>
    </div>
    
    <!-- Content -->
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px;">Bienvenue ${prenom} ! 🎉</h2>
      
      <p style="margin: 0 0 24px; color: #475569; line-height: 1.6;">
        Votre compte sur l'Espace Collaborateurs POGE a été créé. Cet espace vous permet de :
      </p>
      
      <ul style="margin: 0 0 24px; padding-left: 24px; color: #475569; line-height: 1.8;">
        <li>📝 Rédiger vos rapports avec correction IA</li>
        <li>📄 Consulter vos fiches de paie</li>
        <li>🏖️ Gérer vos demandes de vacances</li>
        <li>👤 Mettre à jour vos informations personnelles</li>
      </ul>
      
      <p style="margin: 0 0 24px; color: #475569; line-height: 1.6;">
        Pour activer votre compte, définissez votre mot de passe en cliquant sur le bouton ci-dessous :
      </p>
      
      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Activer mon compte
        </a>
      </div>
      
      <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
        Ce lien est valable pendant <strong>24 heures</strong>.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; color: #94a3b8; font-size: 12px;">
      <p style="margin: 0 0 8px;">
        Permanence Ostéopathique de Genève SA<br>
        Rue de la Terrassière 58, 1207 Genève
      </p>
      <p style="margin: 0;">
        © ${new Date().getFullYear()} POGE - Tous droits réservés
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  const bodyText = `
Bienvenue ${prenom} !

Votre compte sur l'Espace Collaborateurs POGE a été créé. Cet espace vous permet de :
- Rédiger vos rapports avec correction IA
- Consulter vos fiches de paie
- Gérer vos demandes de vacances
- Mettre à jour vos informations personnelles

Pour activer votre compte, définissez votre mot de passe en cliquant sur le lien ci-dessous :
${resetLink}

Ce lien est valable pendant 24 heures.

---
Permanence Ostéopathique de Genève SA
Rue de la Terrassière 58, 1207 Genève
  `.trim();
  
  return { subject, bodyHtml, bodyText };
}

