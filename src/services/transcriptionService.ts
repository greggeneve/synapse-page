/**
 * Service de transcription audio via Gemini
 * Utilise l'API Gemini pour transcrire et analyser l'audio médical
 */

import { blobToBase64 } from './audioRecorderService';

// Configuration Gemini
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration?: number;
}

export interface AnalysisResult {
  transcription: string;
  summary?: string;
  alerts: AIAlert[];
  suggestions?: string[];
}

export interface AIAlert {
  type: 'critical' | 'warning' | 'info';
  message: string;
}

/**
 * Transcrire un fichier audio via Gemini
 */
export async function transcribeAudio(
  audioBlob: Blob,
  context?: string
): Promise<TranscriptionResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('Clé API Gemini non configurée (VITE_GEMINI_API_KEY)');
  }

  try {
    // Convertir l'audio en base64
    const audioBase64 = await blobToBase64(audioBlob);
    
    // Déterminer le type MIME
    const mimeType = audioBlob.type || 'audio/webm';

    // Construire le prompt
    const prompt = buildTranscriptionPrompt(context);

    // Appeler l'API Gemini
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: prompt
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 4096,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Erreur Gemini:', errorData);
      throw new Error(`Erreur API Gemini: ${response.status}`);
    }

    const data = await response.json();
    
    // Extraire le texte de la réponse
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      text: cleanTranscription(text),
      confidence: 0.9 // Gemini ne retourne pas de score de confiance
    };

  } catch (error) {
    console.error('Erreur transcription:', error);
    throw error;
  }
}

/**
 * Transcrire et analyser l'audio pour une section spécifique
 */
export async function transcribeAndAnalyze(
  audioBlob: Blob,
  section: 'anamnesis' | 'examination' | 'treatment',
  context?: string,
  customPrompt?: string
): Promise<AnalysisResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('Clé API Gemini non configurée (VITE_GEMINI_API_KEY)');
  }

  try {
    const audioBase64 = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';

    // Construire le prompt selon la section
    const prompt = customPrompt || buildSectionPrompt(section, context);

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur API Gemini: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parser la réponse structurée
    return parseAnalysisResponse(responseText);

  } catch (error) {
    console.error('Erreur analyse:', error);
    throw error;
  }
}

/**
 * Construire le prompt de transcription simple
 */
function buildTranscriptionPrompt(context?: string): string {
  let prompt = `Tu es un assistant de transcription médicale spécialisé en ostéopathie.

TÂCHE: Transcris fidèlement l'audio suivant en français.

RÈGLES:
- Transcris mot pour mot ce qui est dit
- Corrige les petites erreurs de prononciation évidentes
- Garde la terminologie médicale exacte
- Ne résume pas, ne reformule pas
- Si l'audio est inaudible ou vide, indique "[Inaudible]"
`;

  if (context) {
    prompt += `\nCONTEXTE PATIENT (pour aider à comprendre les termes):
${context}
`;
  }

  prompt += `\nTRANSCRIPTION:`;
  
  return prompt;
}

/**
 * Construire le prompt selon la section
 */
function buildSectionPrompt(
  section: 'anamnesis' | 'examination' | 'treatment',
  context?: string
): string {
  const sectionPrompts = {
    anamnesis: `Tu es un assistant médical pour ostéopathes.

TÂCHE: Transcris et structure l'anamnèse dictée dans cet audio.

FORMAT DE SORTIE:
[TRANSCRIPTION]
(La transcription fidèle de l'audio)

[RÉSUMÉ]
(Un résumé structuré des points clés)

[ALERTES]
(Liste des red flags ou points à vérifier, un par ligne, préfixé par CRITICAL:, WARNING: ou INFO:)
Exemple:
CRITICAL: Douleur thoracique mentionnée - éliminer cause cardiaque
WARNING: Patient sous anticoagulants
INFO: Stress professionnel important

RÈGLES:
- Transcris fidèlement en corrigeant l'orthographe
- Utilise la terminologie médicale appropriée
- Identifie les red flags (douleur thoracique, perte de poids inexpliquée, fièvre, etc.)
- Ne jamais mentionner de nom ou date de naissance dans la sortie`,

    examination: `Tu es un assistant médical pour ostéopathes.

TÂCHE: Transcris et structure l'examen clinique dicté dans cet audio.

FORMAT DE SORTIE:
[TRANSCRIPTION]
(La transcription fidèle de l'audio)

[RÉSUMÉ]
(Observations structurées par région anatomique)

[ALERTES]
(Signes cliniques nécessitant attention, préfixés par CRITICAL:, WARNING: ou INFO:)

RÈGLES:
- Note les tests effectués et leurs résultats
- Structure par région anatomique si possible
- Signale tout signe neurologique ou vasculaire anormal`,

    treatment: `Tu es un assistant médical pour ostéopathes.

TÂCHE: Transcris et structure le traitement dicté dans cet audio.

FORMAT DE SORTIE:
[TRANSCRIPTION]
(La transcription fidèle de l'audio)

[RÉSUMÉ]
(Techniques utilisées et zones traitées)

[ALERTES]
(Réactions du patient à surveiller, préfixées par CRITICAL:, WARNING: ou INFO:)

RÈGLES:
- Liste les techniques utilisées (thrust, MET, fonctionnel, etc.)
- Note les zones traitées
- Indique les réactions du patient pendant le traitement`
  };

  let prompt = sectionPrompts[section];
  
  if (context) {
    prompt += `\n\nCONTEXTE PATIENT:
${context}`;
  }

  return prompt;
}

/**
 * Parser la réponse structurée de Gemini
 */
function parseAnalysisResponse(response: string): AnalysisResult {
  const result: AnalysisResult = {
    transcription: '',
    alerts: [],
    suggestions: []
  };

  // Extraire la transcription
  const transcriptionMatch = response.match(/\[TRANSCRIPTION\]([\s\S]*?)(?=\[|$)/i);
  if (transcriptionMatch) {
    result.transcription = cleanTranscription(transcriptionMatch[1]);
  } else {
    // Si pas de format structuré, tout est considéré comme transcription
    result.transcription = cleanTranscription(response);
  }

  // Extraire le résumé
  const summaryMatch = response.match(/\[RÉSUMÉ\]([\s\S]*?)(?=\[|$)/i);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  // Extraire les alertes
  const alertsMatch = response.match(/\[ALERTES\]([\s\S]*?)(?=\[|$)/i);
  if (alertsMatch) {
    const alertLines = alertsMatch[1].trim().split('\n').filter(line => line.trim());
    
    for (const line of alertLines) {
      if (line.startsWith('CRITICAL:')) {
        result.alerts.push({
          type: 'critical',
          message: line.replace('CRITICAL:', '').trim()
        });
      } else if (line.startsWith('WARNING:')) {
        result.alerts.push({
          type: 'warning',
          message: line.replace('WARNING:', '').trim()
        });
      } else if (line.startsWith('INFO:')) {
        result.alerts.push({
          type: 'info',
          message: line.replace('INFO:', '').trim()
        });
      } else if (line.trim() && !line.startsWith('Exemple')) {
        // Alerte sans préfixe = warning par défaut
        result.alerts.push({
          type: 'warning',
          message: line.trim()
        });
      }
    }
  }

  return result;
}

/**
 * Nettoyer la transcription
 */
function cleanTranscription(text: string): string {
  return text
    .trim()
    .replace(/^\s*[-•]\s*/gm, '') // Retirer les puces
    .replace(/\n{3,}/g, '\n\n')   // Max 2 sauts de ligne
    .trim();
}

/**
 * Vérifier si Gemini est configuré
 */
export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

