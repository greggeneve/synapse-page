/**
 * Service pour gérer les préférences utilisateur
 * Stocke les préférences en base de données (ordre des dossiers mail, etc.)
 */

import { query } from './mariadb';

export interface UserPreference {
  id: number;
  employee_id: number;
  preference_key: string;
  preference_value: any;
  created_at: string;
  updated_at: string;
}

/**
 * Récupère une préférence utilisateur
 */
export async function getPreference<T = any>(
  employeeId: number,
  key: string
): Promise<T | null> {
  const result = await query<UserPreference>(
    'SELECT preference_value FROM user_preferences WHERE employee_id = ? AND preference_key = ?',
    [employeeId, key]
  );

  if (result.success && result.data && result.data.length > 0) {
    try {
      // La valeur est déjà un objet JSON parsé par MySQL
      return result.data[0].preference_value as T;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Sauvegarde une préférence utilisateur (insert ou update)
 */
export async function setPreference<T = any>(
  employeeId: number,
  key: string,
  value: T
): Promise<boolean> {
  const jsonValue = JSON.stringify(value);

  const result = await query(
    `INSERT INTO user_preferences (employee_id, preference_key, preference_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE preference_value = VALUES(preference_value), updated_at = CURRENT_TIMESTAMP`,
    [employeeId, key, jsonValue]
  );

  return result.success;
}

/**
 * Supprime une préférence utilisateur
 */
export async function deletePreference(
  employeeId: number,
  key: string
): Promise<boolean> {
  const result = await query(
    'DELETE FROM user_preferences WHERE employee_id = ? AND preference_key = ?',
    [employeeId, key]
  );

  return result.success;
}

/**
 * Récupère toutes les préférences d'un utilisateur
 */
export async function getAllPreferences(
  employeeId: number
): Promise<Record<string, any>> {
  const result = await query<UserPreference>(
    'SELECT preference_key, preference_value FROM user_preferences WHERE employee_id = ?',
    [employeeId]
  );

  if (result.success && result.data) {
    const prefs: Record<string, any> = {};
    for (const row of result.data) {
      prefs[row.preference_key] = row.preference_value;
    }
    return prefs;
  }

  return {};
}

// Clés de préférences prédéfinies
export const PREFERENCE_KEYS = {
  MAIL_FOLDER_ORDER: 'mail_folder_order',
  DASHBOARD_LAYOUT: 'dashboard_layout',
  THEME: 'theme',
} as const;
