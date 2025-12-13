/**
 * Service pour sauvegarder/charger la configuration des zones du plan
 */

import { query } from './mariadb';

export interface ZoneConfig {
  id: string;
  label: string;
  top: number;
  left: number;
  width: number;
  height: number;
  color: string;
}

export interface FloorConfig {
  floor: 'rdc-inf' | 'rdc-sup';
  zones: ZoneConfig[];
  updatedAt?: string;
  updatedBy?: number;
}

/**
 * Récupérer la configuration des zones pour un étage
 */
export async function getFloorConfig(floor: 'rdc-inf' | 'rdc-sup'): Promise<ZoneConfig[]> {
  try {
    const result = await query<{ zones_config: string }>(
      `SELECT zones_config FROM poge_erp.floor_plan_config WHERE floor_id = ?`,
      [floor]
    );
    
    if (result.success && result.data && result.data.length > 0) {
      const config = result.data[0].zones_config;
      return typeof config === 'string' ? JSON.parse(config) : config;
    }
    
    return [];
  } catch (error) {
    console.error('[FloorPlanConfig] Erreur chargement:', error);
    return [];
  }
}

/**
 * Sauvegarder la configuration des zones pour un étage
 */
export async function saveFloorConfig(
  floor: 'rdc-inf' | 'rdc-sup', 
  zones: ZoneConfig[],
  userId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await query(
      `INSERT INTO poge_erp.floor_plan_config (floor_id, zones_config, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         zones_config = VALUES(zones_config),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [floor, JSON.stringify(zones), userId || null]
    );
    
    if (result.success) {
      console.log(`[FloorPlanConfig] Sauvegardé ${zones.length} zones pour ${floor}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('[FloorPlanConfig] Erreur sauvegarde:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Récupérer toutes les configurations (pour les deux étages)
 */
export async function getAllFloorConfigs(): Promise<Record<string, ZoneConfig[]>> {
  try {
    const result = await query<{ floor_id: string; zones_config: string }>(
      `SELECT floor_id, zones_config FROM poge_erp.floor_plan_config`
    );
    
    const configs: Record<string, ZoneConfig[]> = {
      'rdc-inf': [],
      'rdc-sup': [],
    };
    
    if (result.success && result.data) {
      for (const row of result.data) {
        const zones = typeof row.zones_config === 'string' 
          ? JSON.parse(row.zones_config) 
          : row.zones_config;
        configs[row.floor_id] = zones;
      }
    }
    
    return configs;
  } catch (error) {
    console.error('[FloorPlanConfig] Erreur chargement all:', error);
    return { 'rdc-inf': [], 'rdc-sup': [] };
  }
}
