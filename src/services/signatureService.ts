/**
 * Service de gestion des signatures personnalisées pour les rapports
 */
import { query } from './mariadb';

export interface Signature {
  id: number;
  employee_id: number;
  name: string;           // Nom de la signature (ex: "Directeur", "Ostéopathe")
  title_line1: string;    // Première ligne du titre (ex: "Directeur")
  title_line2?: string;   // Deuxième ligne optionnelle (ex: "Responsable de Clinique")
  title_line3?: string;   // Troisième ligne optionnelle
  certifications?: string; // Certifications (ex: "Certifié C.D.S, Membre OstéoSwiss")
  show_rme?: boolean;     // Afficher le numéro RME
  show_email?: boolean;   // Afficher l'email
  show_phone?: boolean;   // Afficher le téléphone
  is_default: boolean;    // Signature par défaut
  created_at: string;
  updated_at: string;
}

export interface SignatureDisplay {
  id: number;
  name: string;
  fullText: string;       // Texte complet pour affichage
  is_default: boolean;
}

// Créer la table si elle n'existe pas
async function ensureTableExists(): Promise<void> {
  const result = await query(`
    CREATE TABLE IF NOT EXISTS employee_signatures (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      title_line1 VARCHAR(255) NOT NULL,
      title_line2 VARCHAR(255),
      title_line3 VARCHAR(255),
      certifications TEXT,
      show_rme TINYINT(1) DEFAULT 1,
      show_email TINYINT(1) DEFAULT 1,
      show_phone TINYINT(1) DEFAULT 0,
      is_default TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_employee (employee_id),
      UNIQUE KEY unique_signature_name (employee_id, name)
    )
  `, []);
  
  if (!result.success) {
    console.error('Erreur création table employee_signatures:', result.error);
  }
}

// Récupérer toutes les signatures d'un employé
export async function getEmployeeSignatures(employeeId: number): Promise<Signature[]> {
  await ensureTableExists();
  
  console.log('getEmployeeSignatures pour employeeId:', employeeId);
  
  const result = await query<any>(
    `SELECT * FROM employee_signatures WHERE employee_id = ? ORDER BY is_default DESC, name ASC`,
    [employeeId]
  );
  
  console.log('Résultat query signatures:', result);
  
  if (!result.success || !result.data) {
    return [];
  }
  
  // Convertir les valeurs 1/0 en booléens
  return result.data.map((row: any) => ({
    ...row,
    show_rme: row.show_rme === 1 || row.show_rme === true,
    show_email: row.show_email === 1 || row.show_email === true,
    show_phone: row.show_phone === 1 || row.show_phone === true,
    is_default: row.is_default === 1 || row.is_default === true,
  }));
}

// Récupérer une signature par ID
export async function getSignatureById(signatureId: number): Promise<Signature | null> {
  console.log('getSignatureById appelé avec:', signatureId, typeof signatureId);
  
  const result = await query<any>(
    `SELECT * FROM employee_signatures WHERE id = ?`,
    [signatureId]
  );
  
  console.log('getSignatureById résultat:', result);
  
  if (!result.success) {
    console.error('getSignatureById erreur:', result.error);
    return null;
  }
  
  if (!result.data || result.data.length === 0) {
    console.warn('getSignatureById: aucune donnée trouvée pour id:', signatureId);
    return null;
  }
  
  const row = result.data[0];
  const signature = {
    ...row,
    show_rme: row.show_rme === 1 || row.show_rme === true,
    show_email: row.show_email === 1 || row.show_email === true,
    show_phone: row.show_phone === 1 || row.show_phone === true,
    is_default: row.is_default === 1 || row.is_default === true,
  };
  console.log('getSignatureById retourne:', signature);
  return signature;
}

// Récupérer la signature par défaut d'un employé
export async function getDefaultSignature(employeeId: number): Promise<Signature | null> {
  await ensureTableExists();
  
  const result = await query<Signature>(
    `SELECT * FROM employee_signatures WHERE employee_id = ? AND is_default = TRUE LIMIT 1`,
    [employeeId]
  );
  
  if (result.success && result.data && result.data.length > 0) {
    return result.data[0];
  }
  
  // Si pas de signature par défaut, créer une signature standard
  const defaultSig = await createDefaultSignatureForEmployee(employeeId);
  return defaultSig;
}

// Créer une signature par défaut basée sur le profil de l'employé
async function createDefaultSignatureForEmployee(employeeId: number): Promise<Signature | null> {
  // Récupérer les infos du profil
  const profileResult = await query<{ profile_json: any }>(
    `SELECT profile_json FROM employees WHERE employee_id = ?`,
    [employeeId]
  );
  
  if (!profileResult.success || !profileResult.data || profileResult.data.length === 0) {
    return null;
  }
  
  const profile = typeof profileResult.data[0].profile_json === 'string' 
    ? JSON.parse(profileResult.data[0].profile_json)
    : profileResult.data[0].profile_json;
  
  const fonction = profile.hrStatus?.statut_dans_societe || 'Ostéopathe';
  const rmeRcc = profile.externalIds?.rme_rcc || profile.externalIds?.id_externe_RME;
  
  // Déterminer les certifications par défaut selon le rôle
  let certifications = '';
  if (fonction.toLowerCase().includes('directeur') || fonction.toLowerCase().includes('responsable')) {
    certifications = 'Certifié C.D.S, Membre OstéoSwiss';
  } else if (fonction.toLowerCase().includes('stagiaire')) {
    certifications = '';
  } else {
    certifications = 'Certifié C.D.S';
  }
  
  // Créer la signature par défaut
  const signature: Partial<Signature> = {
    employee_id: employeeId,
    name: 'Par défaut',
    title_line1: fonction,
    certifications: certifications,
    show_rme: !!rmeRcc,
    show_email: true,
    show_phone: false,
    is_default: true
  };
  
  const saved = await saveSignature(signature);
  return saved;
}

// Sauvegarder ou mettre à jour une signature
export async function saveSignature(signature: Partial<Signature>): Promise<Signature | null> {
  console.log('=== saveSignature appelé ===');
  console.log('Signature reçue:', JSON.stringify(signature, null, 2));
  console.log('employee_id:', signature.employee_id, 'type:', typeof signature.employee_id);
  console.log('signature.id:', signature.id, 'type:', typeof signature.id);
  
  await ensureTableExists();
  
  // Si c'est la signature par défaut, retirer le flag des autres
  if (signature.is_default && signature.employee_id) {
    await query(
      `UPDATE employee_signatures SET is_default = FALSE WHERE employee_id = ?`,
      [signature.employee_id]
    );
  }
  
  if (signature.id) {
    console.log('Mode UPDATE (signature.id existe):', signature.id);
    
    // Mise à jour - convertir les booléens en 1/0 pour MySQL
    const params = [
      signature.name,
      signature.title_line1,
      signature.title_line2 || null,
      signature.title_line3 || null,
      signature.certifications || null,
      signature.show_rme ? 1 : 0,
      signature.show_email ? 1 : 0,
      signature.show_phone ? 1 : 0,
      signature.is_default ? 1 : 0,
      signature.id
    ];
    console.log('Paramètres UPDATE:', params);
    
    const result = await query(
      `UPDATE employee_signatures SET 
        name = ?,
        title_line1 = ?,
        title_line2 = ?,
        title_line3 = ?,
        certifications = ?,
        show_rme = ?,
        show_email = ?,
        show_phone = ?,
        is_default = ?
       WHERE id = ?`,
      params
    );
    
    console.log('Résultat UPDATE:', result);
    
    if (result.success) {
      const updated = await getSignatureById(signature.id);
      console.log('Signature récupérée après UPDATE:', updated);
      return updated;
    } else {
      console.error('Erreur UPDATE:', result.error);
    }
  } else {
    // Création
    console.log('Mode INSERT (nouvelle signature)');
    console.log('Paramètres INSERT:', [
      signature.employee_id,
      signature.name,
      signature.title_line1,
      signature.title_line2 || null,
      signature.title_line3 || null,
      signature.certifications || null,
      signature.show_rme ?? true,
      signature.show_email ?? true,
      signature.show_phone ?? false,
      signature.is_default ?? false
    ]);
    
    const result = await query(
      `INSERT INTO employee_signatures 
        (employee_id, name, title_line1, title_line2, title_line3, certifications, show_rme, show_email, show_phone, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        signature.employee_id,
        signature.name,
        signature.title_line1,
        signature.title_line2 || null,
        signature.title_line3 || null,
        signature.certifications || null,
        signature.show_rme ?? true,
        signature.show_email ?? true,
        signature.show_phone ?? false,
        signature.is_default ?? false
      ]
    );
    
    console.log('Résultat INSERT signature:', result);
    
    if (result.success) {
      // L'insertId est directement dans result (peut être string ou number)
      const insertId = result.insertId ? Number(result.insertId) : null;
      console.log('InsertId récupéré:', insertId, typeof insertId);
      
      if (insertId && !isNaN(insertId)) {
        const newSig = await getSignatureById(insertId);
        console.log('Nouvelle signature récupérée:', newSig);
        return newSig;
      }
      
      // Fallback: récupérer la dernière signature créée pour cet employé
      console.log('Fallback: récupération dernière signature pour employee_id:', signature.employee_id);
      const lastSig = await query<any>(
        `SELECT * FROM employee_signatures WHERE employee_id = ? ORDER BY id DESC LIMIT 1`,
        [signature.employee_id]
      );
      console.log('Dernière signature:', lastSig);
      
      if (lastSig.success && lastSig.data && lastSig.data.length > 0) {
        const row = lastSig.data[0];
        return {
          ...row,
          show_rme: row.show_rme === 1 || row.show_rme === true,
          show_email: row.show_email === 1 || row.show_email === true,
          show_phone: row.show_phone === 1 || row.show_phone === true,
          is_default: row.is_default === 1 || row.is_default === true,
        };
      }
    } else {
      console.error('Erreur INSERT signature:', result.error);
      alert('Erreur: ' + result.error);
    }
  }
  
  return null;
}

// Supprimer une signature
export async function deleteSignature(signatureId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM employee_signatures WHERE id = ?`,
    [signatureId]
  );
  
  return result.success;
}

// Formater une signature pour l'affichage dans le PDF
export function formatSignatureForPDF(signature: Signature, employeeName: string, employeeEmail?: string, rmeRcc?: string): string[] {
  const lines: string[] = [];
  
  // Nom de l'employé
  lines.push(employeeName);
  
  // Titres
  if (signature.title_line1) lines.push(signature.title_line1);
  if (signature.title_line2) lines.push(signature.title_line2);
  if (signature.title_line3) lines.push(signature.title_line3);
  
  // Certifications
  if (signature.certifications) {
    signature.certifications.split(',').forEach(cert => {
      lines.push(cert.trim());
    });
  }
  
  // RME
  if (signature.show_rme && rmeRcc) {
    lines.push(`RME RCC ${rmeRcc}`);
  }
  
  // Email
  if (signature.show_email && employeeEmail) {
    lines.push(employeeEmail);
  }
  
  return lines;
}

// Créer des signatures par défaut pour les directeurs
export async function createDefaultDirectorSignatures(employeeId: number, isDirecteur: boolean, isDirecteurAdjoint: boolean): Promise<void> {
  await ensureTableExists();
  
  // Vérifier si des signatures existent déjà
  const existing = await getEmployeeSignatures(employeeId);
  if (existing.length > 0) return;
  
  const signatures: Partial<Signature>[] = [];
  
  if (isDirecteur) {
    signatures.push({
      employee_id: employeeId,
      name: 'Directeur',
      title_line1: 'Directeur',
      title_line2: 'Responsable de Clinique',
      certifications: 'Certifié C.D.S, Membre OstéoSwiss',
      show_rme: true,
      show_email: true,
      is_default: true
    });
    signatures.push({
      employee_id: employeeId,
      name: 'Ostéopathe',
      title_line1: 'Ostéopathe',
      certifications: 'Certifié C.D.S, Membre OstéoSwiss',
      show_rme: true,
      show_email: true,
      is_default: false
    });
    signatures.push({
      employee_id: employeeId,
      name: 'Responsable Clinique',
      title_line1: 'Responsable de Clinique',
      certifications: 'Certifié C.D.S, Membre OstéoSwiss',
      show_rme: true,
      show_email: true,
      is_default: false
    });
  } else if (isDirecteurAdjoint) {
    signatures.push({
      employee_id: employeeId,
      name: 'Directeur Adjoint',
      title_line1: 'Directeur Adjoint',
      title_line2: 'Responsable de Clinique',
      certifications: 'Certifié C.D.S, Membre OstéoSwiss',
      show_rme: true,
      show_email: true,
      is_default: true
    });
    signatures.push({
      employee_id: employeeId,
      name: 'Ostéopathe',
      title_line1: 'Ostéopathe',
      certifications: 'Certifié C.D.S, Membre OstéoSwiss',
      show_rme: true,
      show_email: true,
      is_default: false
    });
  }
  
  for (const sig of signatures) {
    await saveSignature(sig);
  }
}

