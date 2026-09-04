import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import { getDefaultLabelingServerUrl } from '../config/labelingServer';
import { resolveLabelingServerUrl } from '../services/autoLabel/resolveServerUrl';
import { setRuntimeLabelingApiToken } from '../services/labelingApiHeaders';

const STORAGE_KEY = 'labeling-vue3:aiSettings';
const DEFAULT_SERVER_URL = getDefaultLabelingServerUrl();

function normalizePersistedServerUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (
    trimmed === 'http://localhost:8000' ||
    trimmed === 'http://127.0.0.1:8000'
  ) {
    return DEFAULT_SERVER_URL;
  }
  return trimmed;
}

interface PersistedAiSettings {
  serverUrl?: string;
  timeoutSec?: number;
  replaceExisting?: boolean;
  apiToken?: string;
}

function readPersisted(): PersistedAiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as PersistedAiSettings & Record<string, unknown>;
    if (typeof data.serverUrl === 'string') {
      data.serverUrl = normalizePersistedServerUrl(data.serverUrl);
    }
    return {
      serverUrl: typeof data.serverUrl === 'string' ? data.serverUrl : undefined,
      timeoutSec: typeof data.timeoutSec === 'number' ? data.timeoutSec : undefined,
      replaceExisting:
        typeof data.replaceExisting === 'boolean' ? data.replaceExisting : undefined,
      apiToken: typeof data.apiToken === 'string' ? data.apiToken : undefined,
    };
  } catch {
    return {};
  }
}

function writePersisted(settings: PersistedAiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface AiStore {
  panelOpen: boolean;
  predicting: boolean;
  serverUrl: string;
  timeoutSec: number;
  replaceExisting: boolean;
  apiToken: string;

  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setPredicting: (predicting: boolean) => void;
  setServerUrl: (url: string) => void;
  setTimeoutSec: (sec: number) => void;
  setReplaceExisting: (value: boolean) => void;
  setApiToken: (token: string) => void;
  ensureServerConnection: () => Promise<string>;
}

const persisted = readPersisted();
setRuntimeLabelingApiToken(persisted.apiToken);

const useAiStoreVanilla = create<AiStore>((set, get) => ({
  panelOpen: false,
  predicting: false,
  serverUrl: persisted.serverUrl ?? DEFAULT_SERVER_URL,
  timeoutSec: persisted.timeoutSec ?? 120,
  replaceExisting: persisted.replaceExisting ?? true,
  apiToken: persisted.apiToken ?? '',

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  setPanelOpen: (open) => set({ panelOpen: open }),

  setPredicting: (predicting) => set({ predicting }),

  setServerUrl: (url) => {
    set({ serverUrl: url });
    persist(get());
  },

  setTimeoutSec: (sec) => {
    set({ timeoutSec: sec });
    persist(get());
  },

  setReplaceExisting: (value) => {
    set({ replaceExisting: value });
    persist(get());
  },

  setApiToken: (token) => {
    const normalized = token.trim();
    set({ apiToken: normalized });
    setRuntimeLabelingApiToken(normalized);
    persist(get());
  },

  ensureServerConnection: async () => {
    const { serverUrl, timeoutSec } = get();
    const resolved = await resolveLabelingServerUrl(
      serverUrl,
      Math.min(timeoutSec, 10)
    );
    if (resolved !== serverUrl) {
      set({ serverUrl: resolved });
      persist(get());
    }
    return resolved;
  },
}));

function persist(state: AiStore) {
  writePersisted({
    serverUrl: state.serverUrl,
    timeoutSec: state.timeoutSec,
    replaceExisting: state.replaceExisting,
    apiToken: state.apiToken,
  });
}

export const useAiStore = bridgeVanillaStoreToPinia('ai', useAiStoreVanilla);
