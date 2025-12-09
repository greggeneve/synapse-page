// ============================================
// services/rmeAiValidationService.ts - Validation IA des attestations RME
// ============================================

import type { RmeAiValidationResult } from '../types/rmeAsca';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Valide une attestation de formation via Gemini
 */
export async function validateAttestationWithAI(
  attestationBase64: string,
  employeeName: string,
  fileType: string
): Promise<RmeAiValidationResult> {
  
  const prompt = `Tu es un expert RME (Registre de Médecine Empirique) suisse. 
Analyse cette attestation de formation continue et vérifie qu'elle respecte les critères RME.

NOM DU PRATICIEN À VÉRIFIER : ${employeeName}

CRITÈRES FORMELS OBLIGATOIRES à vérifier (répondre true/false) :
1. titre_formation - Le titre de la formation est-il présent ?
2. nom_participant - Le nom du participant est-il présent ?
3. nom_formateur - Le nom du formateur/enseignant est-il présent ?
4. qualification_formateur - La qualification du formateur est-elle mentionnée ?
5. nom_organisme - Le nom de l'organisme de formation est-il présent ?
6. adresse_organisme - L'adresse ou coordonnées de l'organisme sont-elles présentes ?
7. dates_exactes - Les dates exactes (début-fin ou date unique) sont-elles présentes ?
8. duree_heures - La durée totale en heures est-elle mentionnée ?
9. modalite - La modalité (présentiel/mixte/en ligne) est-elle indiquée ?
10. signature - Une signature (formateur ou organisme) est-elle présente ?

CRITÈRES STRUCTURELS RME :
1. part_autonome_conforme - Si travail autonome mentionné, est-il ≤ 50% du total ?
2. organisme_identifiable - L'organisme semble-t-il sérieux et identifiable ?
3. pertinence_osteopathie - La formation semble-t-elle pertinente pour l'ostéopathie ?

CRITÈRES TECHNIQUES :
1. document_lisible - Le document est-il lisible (pas flou, pas tronqué) ?
2. format_accepte - Le format est-il acceptable ?
3. texte_extractible - Le texte clé est-il extractible ?

COHÉRENCE :
1. nom_correspond_profil - Le nom sur l'attestation correspond-il à "${employeeName}" ?
2. formateur_different_apprenant - Le formateur est-il différent de l'apprenant ?
3. dates_coherentes - Les dates sont-elles cohérentes (signature après formation) ?

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans commentaires) dans ce format exact :
{
  "criteres_formels": {
    "titre_formation": true/false,
    "nom_participant": true/false,
    "nom_formateur": true/false,
    "qualification_formateur": true/false,
    "nom_organisme": true/false,
    "adresse_organisme": true/false,
    "dates_exactes": true/false,
    "duree_heures": true/false,
    "modalite": true/false,
    "signature": true/false
  },
  "criteres_structurels": {
    "part_autonome_conforme": true/false,
    "organisme_identifiable": true/false,
    "pertinence_osteopathie": true/false
  },
  "criteres_techniques": {
    "document_lisible": true/false,
    "format_accepte": true/false,
    "texte_extractible": true/false
  },
  "coherence": {
    "nom_correspond_profil": true/false,
    "formateur_different_apprenant": true/false,
    "dates_coherentes": true/false
  },
  "elements_manquants": ["liste des éléments manquants"],
  "alertes": ["liste des alertes ou problèmes détectés"],
  "commentaire_ia": "Résumé de l'analyse en une phrase"
}`;

  try {
    // Déterminer le mime type
    const mimeType = fileType === 'pdf' ? 'application/pdf' : 
                     fileType === 'png' ? 'image/png' : 'image/jpeg';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
                  data: attestationBase64.replace(/^data:[^;]+;base64,/, '')
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Nettoyer le JSON (enlever markdown si présent)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Pas de JSON dans la réponse');
    }
    
    const result = JSON.parse(jsonMatch[0]) as RmeAiValidationResult;
    return result;

  } catch (error) {
    console.error('Erreur validation IA:', error);
    // Retourner un résultat par défaut en cas d'erreur
    return {
      criteres_formels: {
        titre_formation: false,
        nom_participant: false,
        nom_formateur: false,
        qualification_formateur: false,
        nom_organisme: false,
        adresse_organisme: false,
        dates_exactes: false,
        duree_heures: false,
        modalite: false,
        signature: false
      },
      criteres_structurels: {
        part_autonome_conforme: true,
        organisme_identifiable: false,
        pertinence_osteopathie: false
      },
      criteres_techniques: {
        document_lisible: false,
        format_accepte: true,
        texte_extractible: false
      },
      coherence: {
        nom_correspond_profil: false,
        formateur_different_apprenant: true,
        dates_coherentes: false
      },
      elements_manquants: ['Erreur lors de l\'analyse automatique'],
      alertes: ['L\'analyse automatique a échoué. Validation manuelle requise.'],
      commentaire_ia: 'Erreur technique - validation manuelle nécessaire'
    };
  }
}

/**
 * Détermine le statut global de validation
 */
export function determineValidationStatus(result: RmeAiValidationResult): 
  'conforme' | 'incomplet' | 'non_conforme' | 'validation_humaine' {
  
  const formels = result.criteres_formels;
  const structurels = result.criteres_structurels;
  const techniques = result.criteres_techniques;
  const coherence = result.coherence;

  // Vérifier les critères techniques d'abord
  if (!techniques.document_lisible || !techniques.texte_extractible) {
    return 'validation_humaine';
  }

  // Compter les critères formels manquants
  const formelsManquants = Object.values(formels).filter(v => !v).length;
  
  // Si beaucoup de critères formels manquent
  if (formelsManquants > 3) {
    return 'incomplet';
  }

  // Vérifier les critères structurels
  if (!structurels.part_autonome_conforme) {
    return 'non_conforme';
  }

  // Vérifier la cohérence
  if (!coherence.nom_correspond_profil || !coherence.formateur_different_apprenant) {
    return 'validation_humaine';
  }

  // Si organisme douteux
  if (!structurels.organisme_identifiable) {
    return 'validation_humaine';
  }

  // Si quelques éléments manquent
  if (formelsManquants > 0) {
    return 'incomplet';
  }

  // Tout est OK
  return 'conforme';
}

/**
 * Calcule le montant à rembourser en cas de départ anticipé (prorata temporis)
 */
export function calculateProrataRefund(
  montantTotal: number,
  dateAnniversaireRme: string,
  dateDepart?: string
): { montantDu: number; moisRestants: number; pourcentage: number } {
  
  const dateAnniv = new Date(dateAnniversaireRme);
  const dateDep = dateDepart ? new Date(dateDepart) : new Date();
  
  // Calculer les mois restants jusqu'à la date anniversaire
  const moisRestants = Math.max(0, 
    (dateAnniv.getFullYear() - dateDep.getFullYear()) * 12 + 
    (dateAnniv.getMonth() - dateDep.getMonth())
  );
  
  const pourcentage = Math.round((moisRestants / 12) * 100);
  const montantDu = Math.round((montantTotal * moisRestants / 12) * 100) / 100;
  
  return { montantDu, moisRestants, pourcentage };
}

