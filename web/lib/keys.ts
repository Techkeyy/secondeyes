import { KeyPair } from 'near-api-js';

// The agent key lives only in this browser. It is never sent to the server.
const PREFIX = 'secondeyes:agent:';

export interface AgentKey {
  publicKey: string;
  secret: string;
}

export function generateAgentKey(): AgentKey {
  const kp = KeyPair.fromRandom('ed25519');
  return { publicKey: kp.getPublicKey().toString(), secret: kp.toString() };
}

/** Stored under the public key because the key exists before the mandate id does. */
export function saveAgentKey(key: AgentKey): void {
  localStorage.setItem(PREFIX + key.publicKey, key.secret);
}

export function loadAgentKey(publicKey: string): string | null {
  return localStorage.getItem(PREFIX + publicKey);
}

/** Null when `secret` is not a valid ed25519 key or belongs to a different public key. */
export function checkAgentKey(secret: string, publicKey: string): string | null {
  try {
    const kp = KeyPair.fromString(secret.trim() as `ed25519:${string}`);
    return kp.getPublicKey().toString() === publicKey ? kp.toString() : null;
  } catch {
    return null;
  }
}
