/**
 * Serveur WebSocket pour Synapse.poge
 * Communication temps réel entre accueil et ostéopathes
 * 
 * Démarrage: node ws-server/server.js
 */

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.WS_PORT || 3011;

// Créer le serveur HTTP
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Synapse.poge WebSocket Server');
});

// Créer le serveur WebSocket
const wss = new WebSocket.Server({ server });

// Stockage des connexions par rôle
const connections = {
  reception: new Set(),  // Connexions accueil
  osteo: new Map(),      // Map<employeeId, WebSocket>
  admin: new Set()       // Connexions admin
};

// État de la salle d'attente (en mémoire)
const waitingRoom = new Map(); // Map<appointmentId, WaitingPatient>

// Gestion des connexions
wss.on('connection', (ws, req) => {
  console.log('[WS] Nouvelle connexion');
  
  let clientInfo = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Enregistrement du client
      if (data.type === 'register') {
        clientInfo = {
          role: data.role,
          employeeId: data.employeeId,
          employeeName: data.employeeName
        };
        
        if (data.role === 'reception') {
          connections.reception.add(ws);
          console.log(`[WS] Accueil connecté: ${data.employeeName}`);
        } else if (data.role === 'osteo') {
          connections.osteo.set(data.employeeId, ws);
          console.log(`[WS] Ostéo connecté: ${data.employeeName} (ID: ${data.employeeId})`);
        } else if (data.role === 'admin') {
          connections.admin.add(ws);
          console.log(`[WS] Admin connecté: ${data.employeeName}`);
        }
        
        // Envoyer l'état actuel de la salle d'attente
        ws.send(JSON.stringify({
          type: 'initial_state',
          payload: {
            waitingRoom: Array.from(waitingRoom.values())
          },
          timestamp: new Date().toISOString()
        }));
        
        return;
      }
      
      // Traiter les messages
      handleMessage(ws, data, clientInfo);
      
    } catch (error) {
      console.error('[WS] Erreur parsing message:', error);
    }
  });

  ws.on('close', () => {
    if (clientInfo) {
      if (clientInfo.role === 'reception') {
        connections.reception.delete(ws);
        console.log(`[WS] Accueil déconnecté: ${clientInfo.employeeName}`);
      } else if (clientInfo.role === 'osteo') {
        connections.osteo.delete(clientInfo.employeeId);
        console.log(`[WS] Ostéo déconnecté: ${clientInfo.employeeName}`);
      } else if (clientInfo.role === 'admin') {
        connections.admin.delete(ws);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Erreur WebSocket:', error);
  });

  // Ping pour garder la connexion active
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Ping interval pour détecter les connexions mortes
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Gestionnaire de messages
function handleMessage(ws, data, clientInfo) {
  const { type, payload } = data;
  
  console.log(`[WS] Message reçu: ${type} de ${clientInfo?.employeeName || 'inconnu'}`);
  
  switch (type) {
    case 'patient_arrived':
      handlePatientArrived(payload, clientInfo);
      break;
      
    case 'patient_waiting':
      handlePatientWaiting(payload, clientInfo);
      break;
      
    case 'consultation_started':
      handleConsultationStarted(payload, clientInfo);
      break;
      
    case 'consultation_ended':
      handleConsultationEnded(payload, clientInfo);
      break;
      
    case 'status_update':
      handleStatusUpdate(payload, clientInfo);
      break;
      
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;
      
    default:
      console.log(`[WS] Type de message inconnu: ${type}`);
  }
}

// Patient arrivé à l'accueil
function handlePatientArrived(payload, clientInfo) {
  const { appointmentId, customerId, customerName, customerInitials, scheduledTime, assignedTo, assignedToName } = payload;
  
  const waitingPatient = {
    appointmentId,
    customerId,
    customerName,
    customerInitials,
    scheduledTime,
    arrivedAt: new Date().toISOString(),
    status: 'arrived',
    assignedTo,
    assignedToName
  };
  
  waitingRoom.set(appointmentId, waitingPatient);
  
  // Notifier l'ostéo concerné
  const osteoWs = connections.osteo.get(assignedTo);
  if (osteoWs && osteoWs.readyState === WebSocket.OPEN) {
    osteoWs.send(JSON.stringify({
      type: 'patient_arrived',
      payload: waitingPatient,
      timestamp: new Date().toISOString(),
      senderId: clientInfo?.employeeId,
      senderRole: 'reception'
    }));
    console.log(`[WS] Notification envoyée à l'ostéo ${assignedToName}`);
  }
  
  // Notifier tous les admins
  broadcastToAdmins({
    type: 'patient_arrived',
    payload: waitingPatient
  });
}

// Patient mis en salle d'attente
function handlePatientWaiting(payload, clientInfo) {
  const { appointmentId } = payload;
  
  const patient = waitingRoom.get(appointmentId);
  if (patient) {
    patient.status = 'waiting';
    waitingRoom.set(appointmentId, patient);
    
    // Notifier l'ostéo avec signal sonore
    const osteoWs = connections.osteo.get(patient.assignedTo);
    if (osteoWs && osteoWs.readyState === WebSocket.OPEN) {
      osteoWs.send(JSON.stringify({
        type: 'patient_waiting',
        payload: { ...patient, playSound: true },
        timestamp: new Date().toISOString(),
        senderId: clientInfo?.employeeId,
        senderRole: 'reception'
      }));
      console.log(`[WS] 🔔 Signal salle d'attente envoyé à ${patient.assignedToName}`);
    }
  }
}

// Consultation démarrée
function handleConsultationStarted(payload, clientInfo) {
  const { appointmentId } = payload;
  
  const patient = waitingRoom.get(appointmentId);
  if (patient) {
    patient.status = 'in_progress';
    waitingRoom.set(appointmentId, patient);
    
    // Notifier l'accueil
    broadcastToReception({
      type: 'consultation_started',
      payload: patient
    });
  }
}

// Consultation terminée
function handleConsultationEnded(payload, clientInfo) {
  const { appointmentId } = payload;
  
  const patient = waitingRoom.get(appointmentId);
  if (patient) {
    patient.status = 'completed';
    
    // Notifier l'accueil
    broadcastToReception({
      type: 'consultation_ended',
      payload: patient
    });
    
    // Retirer de la salle d'attente après un délai
    setTimeout(() => {
      waitingRoom.delete(appointmentId);
    }, 5000);
  }
}

// Mise à jour de statut générique
function handleStatusUpdate(payload, clientInfo) {
  const { appointmentId, newStatus } = payload;
  
  const patient = waitingRoom.get(appointmentId);
  if (patient) {
    patient.status = newStatus;
    waitingRoom.set(appointmentId, patient);
    
    // Broadcast à tous
    broadcast({
      type: 'status_update',
      payload: patient
    });
  }
}

// Fonctions de broadcast
function broadcast(message) {
  const msg = JSON.stringify({
    ...message,
    timestamp: new Date().toISOString()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastToReception(message) {
  const msg = JSON.stringify({
    ...message,
    timestamp: new Date().toISOString()
  });
  
  connections.reception.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastToOsteos(message) {
  const msg = JSON.stringify({
    ...message,
    timestamp: new Date().toISOString()
  });
  
  connections.osteo.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastToAdmins(message) {
  const msg = JSON.stringify({
    ...message,
    timestamp: new Date().toISOString()
  });
  
  connections.admin.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Démarrer le serveur
server.listen(PORT, () => {
  console.log(`🚀 Synapse.poge WebSocket Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   URL: ws://localhost:${PORT}`);
  console.log('');
  console.log('En attente de connexions...');
});

