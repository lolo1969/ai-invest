/**
 * Session-Management: Jeder Browser/Tab bekommt eine eigene Session-ID.
 * 
 * Die Session-ID wird für zwei Zwecke verwendet:
 * 1. Als localStorage-Namespace: Jeder Nutzer bekommt einen eigenen Zustand
 * 2. Als Server-Session: Backend isoliert Daten pro Session-ID
 * 
 * WICHTIG: Session-ID wird als volle UUID generiert (nicht gekürzt)
 * für maximale Kollisionsfreiheit.
 */

const SESSION_KEY = 'vestia-session-id';

/**
 * Session-ID laden oder neu generieren.
 * Jeder Browser bekommt eine einzigartige ID → komplett isolierter State.
 */
export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    // Volle UUID für maximale Sicherheit (keine Kürzung)
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    console.log(`[Session] Neue Session-ID generiert: ${sessionId}`);
  }
  return sessionId;
}

/**
 * Gibt den localStorage-Key für den Zustand dieser Session zurück.
 * Jede Session bekommt einen eigenen Key → keine Daten-Vermischung.
 */
export function getStorageKey(): string {
  return `vestia-storage-${getSessionId()}`;
}

/**
 * Migration: Alte shared `vestia-storage` Daten zur session-spezifischen Key migrieren.
 * Wird einmalig beim App-Start aufgerufen.
 */
export function migrateSharedStorage(): void {
  const OLD_KEY = 'vestia-storage';
  const newKey = getStorageKey();

  // Nur migrieren wenn alt vorhanden und neu noch leer
  const oldData = localStorage.getItem(OLD_KEY);
  const newData = localStorage.getItem(newKey);

  if (oldData && !newData) {
    localStorage.setItem(newKey, oldData);
    // Alten Key entfernen, damit keine zweite Session dieselben Daten erbt
    localStorage.removeItem(OLD_KEY);
    console.log(`[Session] Daten von '${OLD_KEY}' nach '${newKey}' migriert`);
  }
}

// Migration sofort beim Import ausführen
migrateSharedStorage();
