import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import { useAiStore } from './ai';
import {
  deleteModelById,
  fetchModelDetail,
  fetchModelList,
  setDefaultModel,
  updateModelConfig,
  uploadModelFile,
} from '../features/modelCenter/modelApi';
import type { AiModel, AiModelUpdateInput } from '../features/modelCenter/types';
import { MODEL_CENTER_STORAGE_KEY } from '../features/modelCenter/types';

const CACHE_TTL_MS = 60_000;

interface PersistedModelCenter {
  defaultModelId: string | null;
}

function readPersisted(): PersistedModelCenter {
  try {
    const raw = localStorage.getItem(MODEL_CENTER_STORAGE_KEY);
    if (!raw) return { defaultModelId: null };
    return JSON.parse(raw) as PersistedModelCenter;
  } catch {
    return { defaultModelId: null };
  }
}

function writePersisted(data: PersistedModelCenter) {
  try {
    localStorage.setItem(MODEL_CENTER_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

interface ModelStore {
  centerOpen: boolean;
  models: AiModel[];
  defaultModelId: string | null;
  loading: boolean;
  uploading: boolean;
  lastFetchedAt: number | null;
  selectedModelId: string | null;
  detailModel: AiModel | null;
  detailLoading: boolean;
  search: string;
  taskFilter: string | 'all';
  formatFilter: string | 'all';

  setCenterOpen: (open: boolean) => void;
  setSearch: (value: string) => void;
  setTaskFilter: (value: string | 'all') => void;
  setFormatFilter: (value: string | 'all') => void;
  setSelectedModelId: (id: string | null) => void;
  getModelById: (id: string) => AiModel | undefined;
  getDefaultModel: () => AiModel | undefined;
  ensureModels: (force?: boolean) => Promise<AiModel[]>;
  refreshModels: () => Promise<AiModel[]>;
  loadModelDetail: (modelId: string) => Promise<AiModel>;
  uploadModel: (file: File, replace?: boolean) => Promise<AiModel>;
  saveModelConfig: (modelId: string, updates: AiModelUpdateInput) => Promise<AiModel>;
  removeModel: (modelId: string) => Promise<void>;
  makeDefault: (modelId: string) => Promise<void>;
}

const persisted = readPersisted();

async function getServerOptions() {
  const ai = useAiStore.getState();
  const serverUrl = await ai.ensureServerConnection();
  return { serverUrl, timeoutSec: ai.timeoutSec };
}

const useModelStoreVanilla = create<ModelStore>((set, get) => ({
  centerOpen: false,
  models: [],
  defaultModelId: persisted.defaultModelId,
  loading: false,
  uploading: false,
  lastFetchedAt: null,
  selectedModelId: null,
  detailModel: null,
  detailLoading: false,
  search: '',
  taskFilter: 'all',
  formatFilter: 'all',

  setCenterOpen: (open) => set({ centerOpen: open }),

  setSearch: (value) => set({ search: value }),

  setTaskFilter: (value) => set({ taskFilter: value }),

  setFormatFilter: (value) => set({ formatFilter: value }),

  setSelectedModelId: (id) => set({ selectedModelId: id, detailModel: null }),

  getModelById: (id) => get().models.find((model) => model.id === id),

  getDefaultModel: () => {
    const { defaultModelId, models } = get();
    if (!defaultModelId) return models.find((m) => m.isDefault);
    return models.find((model) => model.id === defaultModelId);
  },

  ensureModels: async (force = false) => {
    const { lastFetchedAt, models, loading } = get();
    if (
      !force &&
      models.length > 0 &&
      lastFetchedAt &&
      Date.now() - lastFetchedAt < CACHE_TTL_MS
    ) {
      return models;
    }
    if (loading) return models;
    return get().refreshModels();
  },

  refreshModels: async () => {
    set({ loading: true });
    try {
      const options = await getServerOptions();
      const { models, defaultModelId } = await fetchModelList(options);
      const resolvedDefault =
        defaultModelId ?? get().defaultModelId ?? models.find((m) => m.isDefault)?.id ?? null;
      set({
        models,
        defaultModelId: resolvedDefault,
        lastFetchedAt: Date.now(),
      });
      writePersisted({ defaultModelId: resolvedDefault });
      return models;
    } finally {
      set({ loading: false });
    }
  },

  loadModelDetail: async (modelId) => {
    set({ detailLoading: true, selectedModelId: modelId });
    try {
      const cached = get().getModelById(modelId);
      if (cached) {
        set({ detailModel: cached });
      }
      const options = await getServerOptions();
      const detail = await fetchModelDetail({ ...options, modelId });
      set((state) => ({
        detailModel: detail,
        models: state.models.some((m) => m.id === modelId)
          ? state.models.map((m) => (m.id === modelId ? detail : m))
          : [detail, ...state.models],
      }));
      return detail;
    } finally {
      set({ detailLoading: false });
    }
  },

  uploadModel: async (file, replace = false) => {
    set({ uploading: true });
    try {
      const options = await getServerOptions();
      const model = await uploadModelFile({ ...options, file, replace });
      await get().refreshModels();
      return model;
    } finally {
      set({ uploading: false });
    }
  },

  saveModelConfig: async (modelId, updates) => {
    const options = await getServerOptions();
    const updated = await updateModelConfig({ ...options, modelId, updates });
    set((state) => ({
      models: state.models.map((m) => (m.id === modelId ? updated : m)),
      detailModel: state.detailModel?.id === modelId ? updated : state.detailModel,
      lastFetchedAt: Date.now(),
    }));
    return updated;
  },

  removeModel: async (modelId) => {
    const options = await getServerOptions();
    await deleteModelById({ ...options, modelId });
    set((state) => ({
      models: state.models.filter((m) => m.id !== modelId),
      detailModel: state.detailModel?.id === modelId ? null : state.detailModel,
      selectedModelId: state.selectedModelId === modelId ? null : state.selectedModelId,
      defaultModelId:
        state.defaultModelId === modelId ? null : state.defaultModelId,
    }));
    if (get().defaultModelId === modelId) {
      writePersisted({ defaultModelId: null });
    }
  },

  makeDefault: async (modelId) => {
    const options = await getServerOptions();
    await setDefaultModel({ ...options, modelId });
    set((state) => ({
      defaultModelId: modelId,
      models: state.models.map((m) => ({ ...m, isDefault: m.id === modelId })),
    }));
    writePersisted({ defaultModelId: modelId });
  },
}));

export const useModelStore = bridgeVanillaStoreToPinia('model', useModelStoreVanilla);
