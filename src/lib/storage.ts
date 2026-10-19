/**
 * Acceso seguro a `localStorage`. El almacenamiento puede faltar o lanzar (ventana privada, datos
 * bloqueados, vista previa): cada lectura y escritura va envuelta en try/catch y la página debe
 * funcionar igual sin él. Solo para comodidades de cada lector (progreso, última opción), nunca
 * para estado que deba persistir de forma fiable.
 */

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Lee y analiza un JSON guardado; devuelve `fallback` si no existe, falla o no cumple `validate`. */
export function readJson<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  try {
    const raw = getStorage()?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const value: unknown = JSON.parse(raw);
    if (validate && !validate(value)) return fallback;
    return value as T;
  } catch {
    return fallback;
  }
}

/** Guarda un JSON. Devuelve `false` si no se pudo (cuota, bloqueo, modo privado). */
export function writeJson(key: string, value: unknown): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Prefijo común de las claves de los interactivos, para no pisar las de otras partes del sitio. */
export const STORAGE_PREFIX = 'aiuw:';
