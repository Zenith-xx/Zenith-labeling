const DEVICE_ID_STORAGE_KEY = 'labeling-vue3:deviceId';

const FORBIDDEN_SUBSTRINGS = ['..', '/', '\\', '\0'] as const;

/** UUID v4 (version nibble = 4, variant 8/9/a/b). */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { DEVICE_ID_STORAGE_KEY };

export function isValidDeviceId(value: string): boolean {
  const cleaned = value.trim();
  if (!cleaned) {
    return false;
  }
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    if (cleaned.includes(forbidden)) {
      return false;
    }
  }
  if (!UUID_V4_REGEX.test(cleaned)) {
    return false;
  }
  return true;
}

function generateDeviceId(): string {
  return crypto.randomUUID();
}

function persistDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    // localStorage may be unavailable (private mode, SSR).
  }
}

function readStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Return a stable per-browser UUID v4 used for Labeling-Server device isolation. */
export function getDeviceId(): string {
  const stored = readStoredDeviceId();
  if (stored && isValidDeviceId(stored)) {
    return stored.toLowerCase();
  }

  const deviceId = generateDeviceId();
  persistDeviceId(deviceId);
  return deviceId;
}
