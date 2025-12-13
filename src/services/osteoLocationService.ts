/**
 * Service de localisation des ostéos
 * Utilise les adresses IP des machines pour déterminer dans quelle salle se trouve chaque ostéo
 */

import { query } from './mariadb';

/**
 * Récupérer l'adresse IP du client depuis le serveur
 * Utilise l'API PHP sur le serveur poge-api
 */
export async function getClientIp(): Promise<string | null> {
  try {
    // Appeler l'endpoint dédié sur le serveur PHP
    const response = await fetch('/api/get-client-ip.php');
    if (!response.ok) {
      console.error('[OsteoLocation] Erreur récupération IP:', response.status);
      // Fallback: essayer via une requête simple qui log l'IP côté serveur
      return null;
    }
    const data = await response.json();
    if (data.success && data.ip) {
      console.log('[OsteoLocation] IP client détectée:', data.ip);
      return data.ip;
    }
    return null;
  } catch (error) {
    console.error('[OsteoLocation] Erreur fetch IP:', error);
    return null;
  }
}

/**
 * Récupérer l'IP via l'API principale (fallback)
 */
export async function getClientIpViaApi(): Promise<string | null> {
  try {
    const result = await query<{ ip: string }>(
      `SELECT 'detected' as ip` // Placeholder - l'IP sera dans les headers côté PHP
    );
    // Pour l'instant, retourne null - il faudra modifier php-api.php pour exposer l'IP
    return null;
  } catch (error) {
    console.error('[OsteoLocation] Erreur fallback IP:', error);
    return null;
  }
}

export interface RoomIpMapping {
  ip_address: string;
  room_id: string;
  room_label: string;
  floor: string;
}

export interface OsteoLocation {
  employeeId: number;
  agendaId: number;
  currentRoomId: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
}

/**
 * Récupérer la salle associée à une adresse IP
 */
export async function getRoomByIp(ipAddress: string): Promise<RoomIpMapping | null> {
  const result = await query<RoomIpMapping>(
    `SELECT ip_address, room_id, room_label, floor 
     FROM poge_erp.room_ip_mapping 
     WHERE ip_address = ? AND is_active = 1`,
    [ipAddress]
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }
  
  return result.data[0];
}

/**
 * Mettre à jour la position d'un ostéo (appelé à chaque action)
 * Utilise un session_id pour ne garder que la dernière session ouverte
 */
export async function updateOsteoLocation(
  employeeId: number,
  agendaId: number,
  ipAddress: string,
  sessionId: string
): Promise<string | null> {
  // Chercher la salle correspondant à cette IP
  const room = await getRoomByIp(ipAddress);
  const roomId = room?.room_id || null;
  
  // Vérifier si une session existe déjà pour cet ostéo aujourd'hui
  const existing = await query<{ session_id: string | null; current_room_id: string | null }>(
    `SELECT session_id, current_room_id FROM poge_erp.osteo_locations 
     WHERE employee_id = ? AND date_jour = CURDATE()`,
    [employeeId]
  );
  
  const existingSessionId = existing.data?.[0]?.session_id;
  const existingRoomId = existing.data?.[0]?.current_room_id;
  
  // Ne mettre à jour que si c'est la même session
  if (existingSessionId && existingSessionId !== sessionId) {
    // C'est une ancienne session, on ne met pas à jour
    console.log(`[OsteoLocation] Session ${sessionId.slice(0, 8)} ignorée (session active: ${existingSessionId.slice(0, 8)})`);
    return null;
  }
  
  // Détecter un changement de salle
  const roomChanged = existingRoomId !== roomId;
  
  // Mettre à jour ou créer l'enregistrement
  await query(
    `INSERT INTO poge_erp.osteo_locations 
       (employee_id, agenda_id, current_room_id, ip_address, last_seen_at, date_jour, session_id)
     VALUES (?, ?, ?, ?, NOW(), CURDATE(), ?)
     ON DUPLICATE KEY UPDATE 
       current_room_id = VALUES(current_room_id),
       ip_address = VALUES(ip_address),
       last_seen_at = NOW(),
       session_id = VALUES(session_id),
       updated_at = CURRENT_TIMESTAMP`,
    [employeeId, agendaId, roomId, ipAddress, sessionId]
  );
  
  // Enregistrer dans l'historique si changement de salle
  if (roomChanged) {
    if (existingRoomId) {
      await logLocationHistory(employeeId, agendaId, existingRoomId, ipAddress, sessionId, 'leave');
    }
    if (roomId) {
      await logLocationHistory(employeeId, agendaId, roomId, ipAddress, sessionId, 'enter');
    }
    console.log(`[OsteoLocation] Changement de salle: ${existingRoomId || 'aucune'} → ${roomId || 'aucune'}`);
  }
  
  console.log(`[OsteoLocation] Ostéo ${employeeId} localisé: IP=${ipAddress}, salle=${roomId || 'inconnue'}, session=${sessionId.slice(0, 8)}`);
  return roomId;
}

/**
 * Prendre le contrôle de la localisation (nouvelle session)
 * Appelé quand on ouvre une nouvelle page/onglet
 */
export async function takeLocationControl(
  employeeId: number,
  agendaId: number,
  ipAddress: string,
  sessionId: string
): Promise<string | null> {
  // Chercher la salle correspondant à cette IP
  const room = await getRoomByIp(ipAddress);
  const roomId = room?.room_id || null;
  
  // Récupérer l'ancienne position pour l'historique
  const oldLocation = await query<{ current_room_id: string | null; session_id: string | null }>(
    `SELECT current_room_id, session_id FROM poge_erp.osteo_locations 
     WHERE employee_id = ? AND date_jour = CURDATE()`,
    [employeeId]
  );
  
  const oldRoomId = oldLocation.data?.[0]?.current_room_id;
  const oldSessionId = oldLocation.data?.[0]?.session_id;
  
  // Enregistrer la fin de l'ancienne session si elle existait
  if (oldSessionId && oldSessionId !== sessionId) {
    await logLocationHistory(employeeId, agendaId, oldRoomId || null, ipAddress, oldSessionId, 'session_end');
  }
  
  // Forcer la mise à jour avec la nouvelle session
  await query(
    `INSERT INTO poge_erp.osteo_locations 
       (employee_id, agenda_id, current_room_id, ip_address, last_seen_at, date_jour, session_id)
     VALUES (?, ?, ?, ?, NOW(), CURDATE(), ?)
     ON DUPLICATE KEY UPDATE 
       current_room_id = VALUES(current_room_id),
       ip_address = VALUES(ip_address),
       last_seen_at = NOW(),
       session_id = VALUES(session_id),
       updated_at = CURRENT_TIMESTAMP`,
    [employeeId, agendaId, roomId, ipAddress, sessionId]
  );
  
  // Enregistrer dans l'historique
  await logLocationHistory(employeeId, agendaId, roomId, ipAddress, sessionId, 'session_start');
  
  console.log(`[OsteoLocation] Nouvelle session ${sessionId.slice(0, 8)} prend le contrôle: IP=${ipAddress}, salle=${roomId || 'inconnue'}`);
  return roomId;
}

/**
 * Enregistrer un événement dans l'historique des positions
 */
async function logLocationHistory(
  employeeId: number,
  agendaId: number,
  roomId: string | null,
  ipAddress: string,
  sessionId: string,
  eventType: 'enter' | 'update' | 'leave' | 'session_start' | 'session_end'
): Promise<void> {
  try {
    await query(
      `INSERT INTO poge_erp.osteo_locations_history 
         (employee_id, agenda_id, room_id, ip_address, session_id, event_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employeeId, agendaId, roomId, ipAddress, sessionId, eventType]
    );
  } catch (error) {
    console.error('[OsteoLocation] Erreur log historique:', error);
  }
}

/**
 * Récupérer toutes les positions des ostéos pour aujourd'hui
 */
export async function getAllOsteoLocations(): Promise<OsteoLocation[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await query<{
    employee_id: number;
    agenda_id: number;
    current_room_id: string | null;
    ip_address: string | null;
    last_seen_at: string | null;
  }>(
    `SELECT employee_id, agenda_id, current_room_id, ip_address, last_seen_at
     FROM poge_erp.osteo_locations 
     WHERE date_jour = ?
     ORDER BY last_seen_at DESC`,
    [today]
  );
  
  if (!result.success || !result.data) {
    return [];
  }
  
  return result.data.map(row => ({
    employeeId: row.employee_id,
    agendaId: row.agenda_id,
    currentRoomId: row.current_room_id,
    ipAddress: row.ip_address,
    lastSeenAt: row.last_seen_at
  }));
}

/**
 * Récupérer la position d'un ostéo spécifique
 */
export async function getOsteoLocation(employeeId: number): Promise<OsteoLocation | null> {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await query<{
    employee_id: number;
    agenda_id: number;
    current_room_id: string | null;
    ip_address: string | null;
    last_seen_at: string | null;
  }>(
    `SELECT employee_id, agenda_id, current_room_id, ip_address, last_seen_at
     FROM poge_erp.osteo_locations 
     WHERE employee_id = ? AND date_jour = ?`,
    [employeeId, today]
  );
  
  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }
  
  const row = result.data[0];
  return {
    employeeId: row.employee_id,
    agendaId: row.agenda_id,
    currentRoomId: row.current_room_id,
    ipAddress: row.ip_address,
    lastSeenAt: row.last_seen_at
  };
}

/**
 * Récupérer tous les mappings IP -> salle (pour l'admin)
 */
export async function getAllRoomMappings(): Promise<RoomIpMapping[]> {
  const result = await query<RoomIpMapping>(
    `SELECT ip_address, room_id, room_label, floor 
     FROM poge_erp.room_ip_mapping 
     WHERE is_active = 1
     ORDER BY room_id`
  );
  
  return result.success && result.data ? result.data : [];
}

/**
 * Ajouter ou mettre à jour un mapping IP -> salle
 */
export async function setRoomMapping(
  ipAddress: string,
  roomId: string,
  roomLabel: string,
  floor: string = 'rdc-inf'
): Promise<boolean> {
  const result = await query(
    `INSERT INTO poge_erp.room_ip_mapping 
       (ip_address, room_id, room_label, floor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       room_id = VALUES(room_id),
       room_label = VALUES(room_label),
       floor = VALUES(floor),
       updated_at = CURRENT_TIMESTAMP`,
    [ipAddress, roomId, roomLabel, floor]
  );
  
  return result.success;
}

/**
 * Supprimer un mapping IP
 */
export async function deleteRoomMapping(ipAddress: string): Promise<boolean> {
  const result = await query(
    `UPDATE poge_erp.room_ip_mapping SET is_active = 0 WHERE ip_address = ?`,
    [ipAddress]
  );
  
  return result.success;
}
