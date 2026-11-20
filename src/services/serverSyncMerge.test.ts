import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerStateWithClientConfig } from './serverSyncMerge';

test('keeps client AI and autopilot configuration when loading server state', () => {
  const serverState = {
    settings: {
      aiProvider: 'openai',
      openaiModel: 'gpt-5-mini',
    },
    autopilotSettings: {
      enabled: true,
      intervalMinutes: 240,
    },
    userPositions: [{ id: 'server-position' }],
    autopilotState: {
      cycleCount: 8,
    },
  };
  const clientState = {
    settings: {
      aiProvider: 'claude',
      claudeModel: 'claude-sonnet-4-5-20250929',
    },
    autopilotSettings: {
      enabled: false,
      intervalMinutes: 60,
    },
    userPositions: [{ id: 'stale-client-position' }],
    autopilotState: {
      cycleCount: 0,
    },
  };

  const merged = mergeServerStateWithClientConfig(serverState, clientState);

  assert.deepEqual(merged.settings, clientState.settings);
  assert.deepEqual(merged.autopilotSettings, clientState.autopilotSettings);
  assert.deepEqual(merged.userPositions, serverState.userPositions);
  assert.deepEqual(merged.autopilotState, serverState.autopilotState);
});

test('includes broker and order configuration in the client-controlled fields', () => {
  const merged = mergeServerStateWithClientConfig(
    {
      orderSettings: { autoExecute: false },
      alpacaSettings: { enabled: false },
      autopilotState: { cycleCount: 4 },
    },
    {
      orderSettings: { autoExecute: true },
      alpacaSettings: { enabled: true },
      autopilotState: { cycleCount: 0 },
    },
  );

  assert.deepEqual(merged.orderSettings, { autoExecute: true });
  assert.deepEqual(merged.alpacaSettings, { enabled: true });
  assert.deepEqual(merged.autopilotState, { cycleCount: 4 });
});
