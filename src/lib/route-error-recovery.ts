export const CHUNK_RELOAD_STORAGE_KEY = "tinki:chunk-reload-attempted";
export const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /loading chunk [\w-]+ failed/i,
  /loading css chunk [\w-]+ failed/i,
];

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error ?? "");
}

export function isDynamicImportError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function tryConsumeChunkReloadAllowance(
  storage: StorageLike | null | undefined,
  nowMs: number = Date.now(),
  cooldownMs: number = CHUNK_RELOAD_COOLDOWN_MS,
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (raw) {
      const previousTs = Number(raw);
      if (Number.isFinite(previousTs) && nowMs - previousTs < cooldownMs) {
        return false;
      }
    }
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(nowMs));
    return true;
  } catch {
    return false;
  }
}
