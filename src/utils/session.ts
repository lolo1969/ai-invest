/**
 * Session Management: Each browser/tab gets its own session ID.
 * 
 * The session ID is used for two purposes:
 * 1. As localStorage namespace: Each user gets their own state
 * 2. As server session: Backend isolates data per session ID
 * 
 * IMPORTANT: Session ID is generated as full UUID (not shortened)
 * for maximum collision safety.
 */

const SESSION_KEY = 'vestia-session-id';

/**
 * Load or generate session ID.
 * Each browser gets a unique ID → completely isolated state.
 */
export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    // Full UUID for maximum security (no shortening)
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    console.log(`[Session] New session ID generated: ${sessionId}`);
  }
  return sessionId;
}

/**
 * Returns the localStorage key for this session's state.
 * Each session gets its own key → no data mixing.
 */
export function getStorageKey(): string {
  return `vestia-storage-${getSessionId()}`;
}

/**
 * Migration: Migrate old shared `vestia-storage` data to session-specific key.
 * Called once at app startup.
 */
export function migrateSharedStorage(): void {
  const OLD_KEY = 'vestia-storage';
  const newKey = getStorageKey();

  // Only migrate if old data exists and new is empty
  const oldData = localStorage.getItem(OLD_KEY);
  const newData = localStorage.getItem(newKey);

  if (oldData && !newData) {
    localStorage.setItem(newKey, oldData);
    // Remove old key so no second session inherits the same data
    localStorage.removeItem(OLD_KEY);
    console.log(`[Session] Data migrated from '${OLD_KEY}' to '${newKey}'`);
  }
}

// Run migration immediately at import
migrateSharedStorage();
