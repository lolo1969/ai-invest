export const CLIENT_CONTROLLED_SYNC_FIELDS = [
  'settings',
  'orderSettings',
  'autopilotSettings',
  'alpacaSettings',
  'priceAlerts',
] as const;

export function mergeServerStateWithClientConfig(
  serverState: Record<string, any>,
  clientState: Record<string, any>,
): Record<string, any> {
  const merged = { ...serverState };

  for (const field of CLIENT_CONTROLLED_SYNC_FIELDS) {
    if (clientState[field] !== undefined) {
      merged[field] = clientState[field];
    }
  }

  return merged;
}
