import { GoogleGenAI } from '@google/genai';

// Initialisation du client Gemini
const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Clé API Gemini non configurée');
  }
  return new GoogleGenAI({ apiKey });
};

// Prompt système pour la correction et les conseils ostéopathiques
const OSTEO_REPORT_SYSTEM_PROMPT = `Tu es un assistant expert en ostéopathie et en rédaction médicale professionnelle.
Ton rôle est d'aider les ostéopathes à rédiger des rapports de qualité.

RÈGLES DE CORRECTION :
1. Corrige toutes les fautes d'orthographe et de grammaire
2. Améliore la syntaxe tout en gardant le sens médical précis
3. Utilise le vocabulaire anatomique et ostéopathique approprié
4. Maintiens un ton professionnel et objectif
5. Structure le texte de manière claire et logique

CONSEILS OSTÉOPATHIQUES :
- Vérifie la cohérence entre les symptômes décrits et les techniques proposées
- Suggère des formulations plus précises pour les diagnostics
- Rappelle les contre-indications si pertinent
- Propose des améliorations pour la traçabilité du dossier patient

FORMAT DE RÉPONSE :
Réponds en JSON avec cette structure exacte :
{
  "correctedText": "le texte corrigé et amélioré",
  "corrections": ["liste des corrections effectuées"],
  "suggestions": ["conseils et suggestions d'amélioration"],
  "warnings": ["alertes ou points d'attention éventuels"]
}`;

export interface CorrectionResult {
  correctedText: string;
  corrections: string[];
  suggestions: string[];
  warnings: string[];
}

export async function correctAndAdvise(text: string): Promise<CorrectionResult> {
  try {
    const client = getGeminiClient();
    
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${OSTEO_REPORT_SYSTEM_PROMPT}\n\nTexte à corriger et analyser :\n\n${text}` }]
        }
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      }
    });

    const responseText = response.text || '';
    
    // Extraire le JSON de la réponse
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Si le parsing échoue, retourner une version simplifiée
        return {
          correctedText: text,
          corrections: [],
          suggestions: ['Impossible de parser la réponse IA'],
          warnings: []
        };
      }
    }
    
    return {
      correctedText: text,
      corrections: [],
      suggestions: ['Aucune réponse structurée de l\'IA'],
      warnings: []
    };
  } catch (error: any) {
    console.error('Erreur Gemini:', error);
    return {
      correctedText: text,
      corrections: [],
      suggestions: [],
      warnings: [`Erreur IA: ${error.message}`]
    };
  }
}

// Fonction pour générer un résumé du rapport
export async function generateSummary(text: string): Promise<string> {
  try {
    const client = getGeminiClient();
    
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [{ 
            text: `Génère un résumé professionnel en 2-3 phrases de ce rapport ostéopathique. Sois concis et factuel.\n\nRapport:\n${text}` 
          }]
        }
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 200,
      }
    });

    return response.text || 'Résumé non disponible';
  } catch (error: any) {
    console.error('Erreur génération résumé:', error);
    return 'Erreur lors de la génération du résumé';
  }
}

