/**
 * Service WebSocket pour Synapse.poge
 * Communication temps réel avec le serveur
 */

import type { WSMessage, WSMessageType, WaitingPatient, PatientStatus } from '../types/synapse';

type MessageHandler = (message: WSMessage) => void;
type ConnectionHandler = () => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private messageHandlers: Map<WSMessageType, Set<MessageHandler>> = new Map();
  private connectionHandlers: { onConnect: Set<ConnectionHandler>; onDisconnect: Set<ConnectionHandler> } = {
    onConnect: new Set(),
    onDisconnect: new Set()
  };
  private clientInfo: { role: string; employeeId: number; employeeName: string } | null = null;
  private isConnected = false;

  constructor() {
    this.url = import.meta.env.VITE_WS_URL || 'ws://localhost:3011';
  }

  /**
   * Se connecter au serveur WebSocket
   */
  connect(role: 'reception' | 'osteo' | 'admin', employeeId: number, employeeName: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WS Client] Déjà connecté');
      return;
    }

    this.clientInfo = { role, employeeId, employeeName };
    
    try {
      console.log(`[WS Client] Connexion à ${this.url}...`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS Client] Connecté');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // S'enregistrer auprès du serveur
        this.send({
          type: 'register',
          ...this.clientInfo
        });

        // Notifier les handlers
        this.connectionHandlers.onConnect.forEach(handler => handler());
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WS Client] Erreur parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS Client] Déconnecté');
        this.isConnected = false;
        this.connectionHandlers.onDisconnect.forEach(handler => handler());
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WS Client] Erreur:', error);
      };

    } catch (error) {
      console.error('[WS Client] Erreur connexion:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Se déconnecter
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Tentative de reconnexion automatique
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS Client] Max tentatives de reconnexion atteint');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WS Client] Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

    setTimeout(() => {
      if (this.clientInfo) {
        this.connect(
          this.clientInfo.role as 'reception' | 'osteo' | 'admin',
          this.clientInfo.employeeId,
          this.clientInfo.employeeName
        );
      }
    }, this.reconnectDelay);
  }

  /**
   * Envoyer un message
   */
  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WS Client] Non connecté, message non envoyé');
    }
  }

  /**
   * Gérer les messages reçus
   */
  private handleMessage(message: WSMessage): void {
    console.log(`[WS Client] Message reçu: ${message.type}`);
    
    const handlers = this.messageHandlers.get(message.type as WSMessageType);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  /**
   * S'abonner à un type de message
   */
  on(type: WSMessageType, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    // Retourner une fonction pour se désabonner
    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  /**
   * S'abonner aux événements de connexion
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.onConnect.add(handler);
    return () => this.connectionHandlers.onConnect.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.onDisconnect.add(handler);
    return () => this.connectionHandlers.onDisconnect.delete(handler);
  }

  /**
   * Vérifier l'état de connexion
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  // === ACTIONS ACCUEIL ===

  /**
   * Signaler l'arrivée d'un patient
   */
  patientArrived(data: {
    appointmentId: number;
    customerId: number;
    customerName: string;
    customerInitials: string;
    scheduledTime: string;
    assignedTo: number;
    assignedToName: string;
  }): void {
    this.send({
      type: 'patient_arrived',
      payload: data,
      timestamp: new Date().toISOString(),
      senderId: this.clientInfo?.employeeId,
      senderRole: 'reception'
    });
  }

  /**
   * Mettre un patient en salle d'attente
   */
  patientWaiting(appointmentId: number): void {
    this.send({
      type: 'patient_waiting',
      payload: { appointmentId },
      timestamp: new Date().toISOString(),
      senderId: this.clientInfo?.employeeId,
      senderRole: 'reception'
    });
  }

  // === ACTIONS OSTÉO ===

  /**
   * Démarrer une consultation
   */
  startConsultation(appointmentId: number): void {
    this.send({
      type: 'consultation_started',
      payload: { appointmentId },
      timestamp: new Date().toISOString(),
      senderId: this.clientInfo?.employeeId,
      senderRole: 'osteo'
    });
  }

  /**
   * Terminer une consultation
   */
  endConsultation(appointmentId: number): void {
    this.send({
      type: 'consultation_ended',
      payload: { appointmentId },
      timestamp: new Date().toISOString(),
      senderId: this.clientInfo?.employeeId,
      senderRole: 'osteo'
    });
  }

  /**
   * Mettre à jour le statut d'un patient
   */
  updateStatus(appointmentId: number, newStatus: PatientStatus): void {
    this.send({
      type: 'status_update',
      payload: { appointmentId, newStatus },
      timestamp: new Date().toISOString(),
      senderId: this.clientInfo?.employeeId,
      senderRole: this.clientInfo?.role
    });
  }
}

// Singleton
export const wsService = new WebSocketService();

// Hook React pour utiliser le WebSocket
import { useEffect, useState, useCallback } from 'react';

export function useWebSocket(
  role: 'reception' | 'osteo' | 'admin',
  employeeId: number,
  employeeName: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState<WaitingPatient[]>([]);

  useEffect(() => {
    // Se connecter
    wsService.connect(role, employeeId, employeeName);

    // Écouter les événements de connexion
    const unsubConnect = wsService.onConnect(() => setIsConnected(true));
    const unsubDisconnect = wsService.onDisconnect(() => setIsConnected(false));

    // Écouter l'état initial
    const unsubInitial = wsService.on('initial_state' as any, (msg) => {
      setWaitingRoom(msg.payload.waitingRoom || []);
    });

    // Écouter les arrivées de patients
    const unsubArrived = wsService.on('patient_arrived', (msg) => {
      setWaitingRoom(prev => [...prev, msg.payload]);
    });

    // Écouter les mises à jour de statut
    const unsubStatus = wsService.on('status_update', (msg) => {
      setWaitingRoom(prev => 
        prev.map(p => p.appointmentId === msg.payload.appointmentId 
          ? { ...p, status: msg.payload.status }
          : p
        )
      );
    });

    // Écouter les fins de consultation
    const unsubEnded = wsService.on('consultation_ended', (msg) => {
      setTimeout(() => {
        setWaitingRoom(prev => 
          prev.filter(p => p.appointmentId !== msg.payload.appointmentId)
        );
      }, 5000);
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubInitial();
      unsubArrived();
      unsubStatus();
      unsubEnded();
    };
  }, [role, employeeId, employeeName]);

  const patientArrived = useCallback((data: Parameters<typeof wsService.patientArrived>[0]) => {
    wsService.patientArrived(data);
  }, []);

  const patientWaiting = useCallback((appointmentId: number) => {
    wsService.patientWaiting(appointmentId);
  }, []);

  const startConsultation = useCallback((appointmentId: number) => {
    wsService.startConsultation(appointmentId);
  }, []);

  const endConsultation = useCallback((appointmentId: number) => {
    wsService.endConsultation(appointmentId);
  }, []);

  return {
    isConnected,
    waitingRoom,
    patientArrived,
    patientWaiting,
    startConsultation,
    endConsultation
  };
}

