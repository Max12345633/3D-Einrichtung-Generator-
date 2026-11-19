let counter = 0;
/** Kurze, kollisionsarme IDs ohne Abhängigkeit (crypto ist nicht in jeder Laufzeit gleich verfügbar). */
export function createId(prefix = "id"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}
