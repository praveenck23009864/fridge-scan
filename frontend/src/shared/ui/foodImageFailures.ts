const failures = new Map<string, number>();
const listeners = new Set<() => void>();
const RETRY_AFTER_MS = 5 * 60 * 1000;

export function imageFailed(key: string | undefined) {
  return key !== undefined && (failures.get(key) ?? 0) > Date.now();
}
export function rememberImageFailure(key: string) {
  failures.set(key, Date.now() + RETRY_AFTER_MS);
  for (const listener of listeners) listener();
}
export function subscribeImageFailures(listener: () => void) {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
}
