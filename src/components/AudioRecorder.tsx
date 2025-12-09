/**
 * Composant d'enregistrement audio avec transcription
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Square, 
  Pause, 
  Play,
  Loader2,
  AlertCircle,
  Volume2,
  Trash2,
  Sparkles
} from 'lucide-react';
import { 
  audioRecorder, 
  formatDuration,
  type AudioRecording,
  type RecordingState
} from '../services/audioRecorderService';
import { 
  transcribeAndAnalyze, 
  isGeminiConfigured,
  type AnalysisResult,
  type AIAlert
} from '../services/transcriptionService';
import './AudioRecorder.css';

interface AudioRecorderProps {
  section: 'anamnesis' | 'examination' | 'treatment';
  context?: string;
  onTranscription: (text: string) => void;
  onAlerts?: (alerts: AIAlert[]) => void;
  disabled?: boolean;
}

export function AudioRecorder({ 
  section, 
  context, 
  onTranscription, 
  onAlerts,
  disabled = false 
}: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Configurer les callbacks du recorder
  useEffect(() => {
    audioRecorder.setCallbacks({
      onStateChange: setState,
      onDurationUpdate: setDuration,
      onError: (err) => setError(err.message)
    });
  }, []);

  // Démarrer l'enregistrement
  const handleStart = useCallback(async () => {
    setError(null);
    setRecording(null);
    
    try {
      await audioRecorder.start();
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Pause / Reprendre
  const handlePauseResume = useCallback(() => {
    if (state === 'recording') {
      audioRecorder.pause();
    } else if (state === 'paused') {
      audioRecorder.resume();
    }
  }, [state]);

  // Arrêter l'enregistrement
  const handleStop = useCallback(async () => {
    try {
      const rec = await audioRecorder.stop();
      setRecording(rec);
      setDuration(rec.duration);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Annuler
  const handleCancel = useCallback(() => {
    audioRecorder.cancel();
    setRecording(null);
    setDuration(0);
    setState('idle');
  }, []);

  // Supprimer l'enregistrement
  const handleDelete = useCallback(() => {
    if (recording?.url) {
      URL.revokeObjectURL(recording.url);
    }
    setRecording(null);
    setDuration(0);
    setState('idle');
  }, [recording]);

  // Écouter l'enregistrement
  const handlePlayPause = useCallback(() => {
    if (!audioRef.current || !recording) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, recording]);

  // Transcrire avec Gemini
  const handleTranscribe = useCallback(async () => {
    if (!recording) return;
    
    if (!isGeminiConfigured()) {
      setError('Clé API Gemini non configurée');
      return;
    }
    
    setIsTranscribing(true);
    setError(null);
    
    try {
      const result: AnalysisResult = await transcribeAndAnalyze(
        recording.blob,
        section,
        context
      );
      
      // Envoyer la transcription au parent
      onTranscription(result.transcription);
      
      // Envoyer les alertes si présentes
      if (result.alerts.length > 0 && onAlerts) {
        onAlerts(result.alerts);
      }
      
      // Supprimer l'enregistrement après transcription réussie
      handleDelete();
      
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la transcription');
    } finally {
      setIsTranscribing(false);
    }
  }, [recording, section, context, onTranscription, onAlerts, handleDelete]);

  // Gérer la fin de lecture audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onended = () => setIsPlaying(false);
    }
  }, [recording]);

  // Vérifier le support
  const isSupported = audioRecorder.isSupported();

  if (!isSupported) {
    return (
      <div className="audio-recorder not-supported">
        <AlertCircle size={20} />
        <span>Enregistrement audio non supporté</span>
      </div>
    );
  }

  return (
    <div className={`audio-recorder ${state} ${disabled ? 'disabled' : ''}`}>
      {/* Audio element pour la lecture */}
      {recording && (
        <audio ref={audioRef} src={recording.url} />
      )}

      {/* État: Idle - Bouton pour démarrer */}
      {state === 'idle' && !recording && (
        <button 
          className="btn-record start"
          onClick={handleStart}
          disabled={disabled || isTranscribing}
          title="Démarrer l'enregistrement"
        >
          <Mic size={20} />
          <span>Enregistrer</span>
        </button>
      )}

      {/* État: Recording ou Paused */}
      {(state === 'recording' || state === 'paused') && (
        <div className="recording-controls">
          <div className="recording-indicator">
            <span className={`dot ${state === 'recording' ? 'pulse' : ''}`}></span>
            <span className="duration">{formatDuration(duration)}</span>
          </div>
          
          <div className="recording-buttons">
            <button 
              className="btn-control pause"
              onClick={handlePauseResume}
              title={state === 'recording' ? 'Pause' : 'Reprendre'}
            >
              {state === 'recording' ? <Pause size={18} /> : <Play size={18} />}
            </button>
            
            <button 
              className="btn-control stop"
              onClick={handleStop}
              title="Arrêter"
            >
              <Square size={18} />
            </button>
            
            <button 
              className="btn-control cancel"
              onClick={handleCancel}
              title="Annuler"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      )}

      {/* État: Enregistrement terminé */}
      {state === 'idle' && recording && (
        <div className="recording-preview">
          <div className="preview-info">
            <button 
              className="btn-play"
              onClick={handlePlayPause}
              title={isPlaying ? 'Pause' : 'Écouter'}
            >
              {isPlaying ? <Pause size={16} /> : <Volume2 size={16} />}
            </button>
            <span className="duration">{formatDuration(duration)}</span>
          </div>
          
          <div className="preview-actions">
            <button 
              className="btn-delete"
              onClick={handleDelete}
              disabled={isTranscribing}
              title="Supprimer"
            >
              <Trash2 size={16} />
            </button>
            
            <button 
              className="btn-transcribe"
              onClick={handleTranscribe}
              disabled={isTranscribing}
              title="Transcrire avec l'IA"
            >
              {isTranscribing ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Transcription...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Transcrire</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="recorder-error">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
}

