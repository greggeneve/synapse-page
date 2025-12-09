import { query } from './mariadb';

/**
 * Récupère la photo active d'un employé depuis la table employee_photos
 */
export async function getEmployeePhoto(employeeId: string | number): Promise<string | null> {
  const numericId = Number(employeeId);
  if (!Number.isFinite(numericId)) return null;

  // Récupérer la photo sélectionnée
  const res = await query<{ photo_data: string }>(
    'SELECT photo_data FROM employee_photos WHERE employee_id = ? AND is_selected = 1 LIMIT 1',
    [numericId]
  );

  if (res.success && res.data && res.data.length > 0) {
    return res.data[0].photo_data;
  }

  // Fallback: prendre la plus récente si aucune n'est sélectionnée
  const fallback = await query<{ photo_data: string }>(
    'SELECT photo_data FROM employee_photos WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1',
    [numericId]
  );
  
  if (fallback.success && fallback.data && fallback.data.length > 0) {
    return fallback.data[0].photo_data;
  }

  return null;
}

/**
 * Récupère toutes les photos actives (pour le chargement groupé)
 * Retourne un Map: employeeId -> photoBase64
 */
export async function getAllEmployeePhotos(): Promise<Map<string, string>> {
  const photoMap = new Map<string, string>();

  const res = await query<{ employee_id: number; photo_data: string }>(
    'SELECT employee_id, photo_data FROM employee_photos WHERE is_selected = 1',
    []
  );

  if (!res.success || !res.data) {
    console.warn('[EmployeePhotos] Impossible de charger les photos:', res.error);
    return photoMap;
  }

  for (const row of res.data) {
    photoMap.set(String(row.employee_id), row.photo_data);
  }

  console.log(`[EmployeePhotos] 📸 ${photoMap.size} photo(s) chargée(s)`);
  return photoMap;
}

