import { validateLobbyActions } from './config-schema.js';

export function normalizeRuntimeLobbyAction(actionInput) {
  if (!isPlainObject(actionInput)) throw new Error('即时大厅动作必须是对象。');
  const action = structuredClone(actionInput);
  validateLobbyActions([action]);
  action.enabled = true;
  return action;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
