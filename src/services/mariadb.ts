export interface QueryResult<T = any> {
  success: boolean;
  data?: T[];
  insertId?: number | null;
  error?: string;
}

export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  const isDev = import.meta.env.DEV;
  const configuredEndpoint = import.meta.env.VITE_PHP_API_URL;
  
  const endpoint = isDev ? '/api/php-api.php' : configuredEndpoint;

  if (!endpoint && !isDev) {
    return {
      success: false,
      error: "VITE_PHP_API_URL non défini dans .env.local",
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `HTTP ${res.status} ${res.statusText} – ${text.slice(0, 300)}`,
      };
    }

    const text = await res.text();
    try {
      const json = JSON.parse(text) as QueryResult<T>;
      return json;
    } catch (parseError) {
      console.error('[MariaDB] Réponse non-JSON du serveur:', text.substring(0, 500));
      return {
        success: false,
        error: `Erreur PHP: ${text.substring(0, 300)}`,
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: e?.message ?? "Erreur réseau JavaScript (fetch)",
    };
  }
}

