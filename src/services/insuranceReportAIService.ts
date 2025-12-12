/**
 * Service IA pour l'extraction automatique des données des rapports d'assurance
 * Utilise Gemini pour analyser les PDF scannés
 */

import type { AIExtractionData } from './insuranceReportService';
import { query } from './mariadb';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');

interface OsteoInfo {
  id: number;
  name: string;
  firstname: string;
  lastname: string;
}

/**
 * Extraire les données d'un PDF de rapport d'assurance via Gemini
 */
export async function extractReportDataFromPDF(
  pdfBase64: string,
  mimeType: string = 'application/pdf'
): Promise<{ success: boolean; data?: AIExtractionData; error?: string }> {
  if (!GEMINI_API_KEY) {
    console.warn('[InsuranceAI] Cle API Gemini non configuree');
    return { success: false, error: 'API Gemini non configuree' };
  }

  try {
    // Recuperer la liste des osteos pour la correspondance
    const osteos = await getOsteoList();
    const osteoNames = osteos.map(o => `${o.firstname} ${o.lastname}`);
    
    console.log('[InsuranceAI] ========================================');
    console.log('[InsuranceAI] LISTE DES OSTEOPATHES/THERAPEUTES A CHERCHER:');
    osteos.forEach(o => console.log(`  - ${o.firstname} ${o.lastname} (ID: ${o.id})`));
    console.log('[InsuranceAI] ========================================');

    const prompt = `Tu es un expert en analyse de documents d'assurance medicale suisses. Analyse ce document PDF avec GRANDE ATTENTION.

=== MISSION PRINCIPALE ===
Tu dois extraire TOUTES les informations importantes de ce formulaire d'assurance.

=== LISTE DES THERAPEUTES DE NOTRE CABINET ===
Cherche si UN de ces noms apparait N'IMPORTE OU dans le document :
${osteoNames.map(n => `* ${n}`).join('\n')}

=== INFORMATIONS A EXTRAIRE ===

1. ASSURANCE: Nom de la compagnie (CSS, Helsana, Swica, Groupe Mutuel, Visana, Sanitas, Assura, SUVA, AXA, etc.)

2. PATIENT/ASSURE:
   - Nom et prenom
   - Date de naissance (TRES IMPORTANT - cherche dans tout le document)

3. REFERENCE: Numero de dossier, sinistre, reference

4. OSTEOPATHE DESTINATAIRE: Le therapeute a qui s'adresse le courrier

5. DATES DES TRAITEMENTS: 
   - Cherche les dates de consultation/traitement mentionnees
   - Peut etre une periode (ex: "du 15.03.2024 au 20.05.2024")
   - Ou des dates specifiques (ex: "consultations des 10.01, 15.02, 20.03.2024")
   - Cherche dans les tableaux, les questions sur les seances, les periodes de soins

=== REPONSE OBLIGATOIRE ===
Reponds UNIQUEMENT avec ce JSON (RIEN d'autre):
{
  "detected_insurance": "nom de l'assurance ou null",
  "detected_patient_name": "Prenom NOM du patient ou null",
  "detected_patient_birthdate": "AAAA-MM-DD ou null",
  "detected_reference": "numero ou null",
  "detected_osteo_name": "Prenom Nom du therapeute ou null",
  "detected_treatment_dates": "dates des traitements (texte libre) ou null",
  "raw_findings": "resume de ce que tu as trouve",
  "confidence": {"insurance": 0.9, "patient": 0.9, "birthdate": 0.9, "osteo": 0.9, "treatment_dates": 0.7}
}

IMPORTANT: 
- Pour la date de naissance, convertis en format AAAA-MM-DD
- Pour les dates de traitement, garde le format original du document`;

    console.log('[InsuranceAI] Analyse du PDF avec Gemini...');

    // Modeles a essayer
    const modelsToTry = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash-latest', 
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-pro-vision'
    ];
    
    let lastError = '';
    
    for (const model of modelsToTry) {
      console.log(`[InsuranceAI] Tentative avec modele: ${model}`);
      
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: pdfBase64.replace(/^data:[^;]+;base64,/, '')
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024
              }
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[InsuranceAI] Modele ${model} non disponible:`, errorText.substring(0, 200));
          lastError = errorText;
          continue;
        }

        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log(`[InsuranceAI] Modele ${model} a repondu`);
        console.log('[InsuranceAI] Reponse brute:', textResponse);

        if (!textResponse) {
          console.warn('[InsuranceAI] Pas de reponse texte');
          lastError = 'Pas de reponse texte';
          continue;
        }

        // Parser le JSON de la reponse
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn('[InsuranceAI] Pas de JSON dans la reponse');
          lastError = 'Format de reponse invalide';
          continue;
        }

        const extractedData = JSON.parse(jsonMatch[0]);
        
        console.log('[InsuranceAI] ========================================');
        console.log('[InsuranceAI] RESULTATS DE L\'ANALYSE:');
        console.log('  Assurance:', extractedData.detected_insurance || 'NON TROUVE');
        console.log('  Patient:', extractedData.detected_patient_name || 'NON TROUVE');
        console.log('  Naissance:', extractedData.detected_patient_birthdate || 'NON TROUVE');
        console.log('  Reference:', extractedData.detected_reference || 'NON TROUVE');
        console.log('  OSTEOPATHE:', extractedData.detected_osteo_name || 'NON TROUVE');
        console.log('  DATES TRAITEMENTS:', extractedData.detected_treatment_dates || 'NON TROUVE');
        console.log('  Findings:', extractedData.raw_findings || '');
        console.log('[InsuranceAI] ========================================');

        // Verifier si l'osteo detecte est dans notre liste
        let detectedOsteoName = extractedData.detected_osteo_name;
        
        if (detectedOsteoName) {
          const matchedOsteo = findBestOsteoMatch(detectedOsteoName, osteos);
          if (matchedOsteo) {
            detectedOsteoName = `${matchedOsteo.firstname} ${matchedOsteo.lastname}`;
            console.log(`[InsuranceAI] Osteo TROUVE dans notre liste: ${detectedOsteoName} (ID: ${matchedOsteo.id})`);
          } else {
            console.log(`[InsuranceAI] ATTENTION: "${detectedOsteoName}" n'est PAS dans notre liste d'employes actifs!`);
          }
        }

        const aiData: AIExtractionData = {
          detected_insurance: extractedData.detected_insurance,
          detected_patient_name: extractedData.detected_patient_name,
          detected_patient_birthdate: extractedData.detected_patient_birthdate,
          detected_osteo_name: detectedOsteoName,
          detected_reference: extractedData.detected_reference,
          detected_treatment_dates: extractedData.detected_treatment_dates,
          confidence_details: extractedData.confidence || {}
        };

        return { 
          success: true, 
          data: aiData
        };
        
      } catch (modelError: any) {
        console.warn(`[InsuranceAI] Erreur avec modele ${model}:`, modelError.message);
        lastError = modelError.message;
        continue;
      }
    }

    console.error('[InsuranceAI] Aucun modele Gemini disponible');
    return { success: false, error: `Aucun modele Gemini disponible. Derniere erreur: ${lastError}` };

  } catch (error: any) {
    console.error('[InsuranceAI] Erreur extraction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Trouver le meilleur match d'osteo
 */
function findBestOsteoMatch(name: string, osteos: OsteoInfo[]): OsteoInfo | null {
  if (!name) return null;
  
  const nameLower = name.toLowerCase().trim();
  
  // Match exact
  for (const o of osteos) {
    const fullName1 = `${o.firstname} ${o.lastname}`.toLowerCase();
    const fullName2 = `${o.lastname} ${o.firstname}`.toLowerCase();
    if (nameLower === fullName1 || nameLower === fullName2) {
      return o;
    }
  }
  
  // Match partiel (contient le nom ET le prenom)
  for (const o of osteos) {
    const firstLower = o.firstname.toLowerCase();
    const lastLower = o.lastname.toLowerCase();
    if (nameLower.includes(firstLower) && nameLower.includes(lastLower)) {
      return o;
    }
  }
  
  // Match par nom de famille seul (si unique)
  const lastNameMatches = osteos.filter(o => 
    nameLower.includes(o.lastname.toLowerCase())
  );
  if (lastNameMatches.length === 1) {
    return lastNameMatches[0];
  }
  
  return null;
}

/**
 * Trouver l'ID de l'osteo correspondant au nom detecte
 */
export async function findOsteoByName(name: string): Promise<number | null> {
  if (!name) return null;

  const osteos = await getOsteoList();
  const match = findBestOsteoMatch(name, osteos);
  return match ? match.id : null;
}

/**
 * Recuperer la liste de TOUS les employes actifs (therapeutes potentiels)
 */
async function getOsteoList(): Promise<OsteoInfo[]> {
  const result = await query<any>(`
    SELECT 
      employee_id as id,
      prenom AS firstname,
      nom AS lastname
    FROM v_active_employees
  `);

  console.log('[InsuranceAI] Employes actifs trouves:', result.data?.length || 0);

  return (result.data || []).map((row: any) => ({
    id: row.id,
    firstname: row.firstname || '',
    lastname: row.lastname || '',
    name: `${row.firstname || ''} ${row.lastname || ''}`
  }));
}

/**
 * Analyser et preparer un rapport pour l'attribution automatique
 */
export async function analyzeAndPrepareReport(pdfBase64: string): Promise<{
  success: boolean;
  extraction?: any;
  suggested_osteo_id?: number;
  suggested_osteo_name?: string;
  error?: string;
}> {
  const extractionResult = await extractReportDataFromPDF(pdfBase64);
  
  if (!extractionResult.success || !extractionResult.data) {
    return { success: false, error: extractionResult.error };
  }

  const extraction = extractionResult.data;
  let result: any = { success: true, extraction };

  // Chercher l'osteo suggere
  if (extraction.detected_osteo_name) {
    const osteoId = await findOsteoByName(extraction.detected_osteo_name);
    if (osteoId) {
      result.suggested_osteo_id = osteoId;
      result.suggested_osteo_name = extraction.detected_osteo_name;
      console.log(`[InsuranceAI] Osteo suggere: ${extraction.detected_osteo_name} (ID: ${osteoId})`);
    } else {
      console.log(`[InsuranceAI] Osteo detecte mais non trouve dans la DB: ${extraction.detected_osteo_name}`);
      result.suggested_osteo_name = extraction.detected_osteo_name;
    }
  }

  return result;
}
