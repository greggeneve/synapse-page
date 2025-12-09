/**
 * Service d'enregistrement audio
 * Utilise l'API MediaRecorder du navigateur
 */

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number;
  mimeType: string;
}

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecorderCallbacks {
  onStateChange?: (state: RecordingState) => void;
  onDataAvailable?: (data: Blob) => void;
  onError?: (error: Error) => void;
  onDurationUpdate?: (seconds: number) => void;
}

class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private state: RecordingState = 'idle';
  private callbacks: RecorderCallbacks = {};
  private startTime: number = 0;
  private durationInterval: NodeJS.Timeout | null = null;

  /**
   * Vérifier si l'enregistrement audio est supporté
   */
  isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Obtenir les types MIME supportés
   */
  getSupportedMimeTypes(): string[] {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav'
    ];
    
    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }

  /**
   * Définir les callbacks
   */
  setCallbacks(callbacks: RecorderCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Démarrer l'enregistrement
   */
  async start(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('L\'enregistrement audio n\'est pas supporté par ce navigateur');
    }

    try {
      // Demander l'accès au microphone
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Choisir le meilleur format supporté
      const mimeTypes = this.getSupportedMimeTypes();
      const mimeType = mimeTypes[0] || 'audio/webm';

      // Créer le MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, { 
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.audioChunks = [];

      // Gérer les données audio
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.callbacks.onDataAvailable?.(event.data);
        }
      };

      // Gérer les erreurs
      this.mediaRecorder.onerror = (event) => {
        console.error('Erreur MediaRecorder:', event);
        this.callbacks.onError?.(new Error('Erreur lors de l\'enregistrement'));
      };

      // Démarrer
      this.mediaRecorder.start(1000); // Collecter les données toutes les secondes
      this.startTime = Date.now();
      this.setState('recording');

      // Mettre à jour la durée
      this.durationInterval = setInterval(() => {
        const duration = Math.floor((Date.now() - this.startTime) / 1000);
        this.callbacks.onDurationUpdate?.(duration);
      }, 1000);

    } catch (error) {
      console.error('Erreur démarrage enregistrement:', error);
      if ((error as Error).name === 'NotAllowedError') {
        throw new Error('Accès au microphone refusé. Veuillez autoriser l\'accès dans les paramètres du navigateur.');
      }
      throw new Error('Impossible de démarrer l\'enregistrement');
    }
  }

  /**
   * Mettre en pause
   */
  pause(): void {
    if (this.mediaRecorder && this.state === 'recording') {
      this.mediaRecorder.pause();
      this.setState('paused');
      
      if (this.durationInterval) {
        clearInterval(this.durationInterval);
        this.durationInterval = null;
      }
    }
  }

  /**
   * Reprendre
   */
  resume(): void {
    if (this.mediaRecorder && this.state === 'paused') {
      this.mediaRecorder.resume();
      this.setState('recording');
      
      // Reprendre le compteur
      this.durationInterval = setInterval(() => {
        const duration = Math.floor((Date.now() - this.startTime) / 1000);
        this.callbacks.onDurationUpdate?.(duration);
      }, 1000);
    }
  }

  /**
   * Arrêter et obtenir l'enregistrement
   */
  async stop(): Promise<AudioRecording> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Aucun enregistrement en cours'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Arrêter le flux
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        // Arrêter le compteur
        if (this.durationInterval) {
          clearInterval(this.durationInterval);
          this.durationInterval = null;
        }

        // Créer le blob final
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const duration = Math.floor((Date.now() - this.startTime) / 1000);

        this.setState('stopped');
        this.mediaRecorder = null;
        this.audioChunks = [];

        resolve({
          blob,
          url,
          duration,
          mimeType
        });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Annuler l'enregistrement
   */
  cancel(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.setState('idle');
  }

  /**
   * Obtenir l'état actuel
   */
  getState(): RecordingState {
    return this.state;
  }

  private setState(state: RecordingState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}

// Export singleton
export const audioRecorder = new AudioRecorderService();

/**
 * Formater la durée en MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convertir un Blob audio en base64
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Retirer le préfixe "data:audio/webm;base64,"
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

