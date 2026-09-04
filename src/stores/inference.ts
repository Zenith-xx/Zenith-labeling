import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import { useModelStore } from './model';
import type { InferenceSessionConfig, InferenceSessionState } from '../features/ai/services/types';
import { DEFAULT_INFERENCE_SESSION_CONFIG } from '../features/ai/services/types';
import {
  createSessionStateFromModel,
  switchSessionModel,
} from '../features/ai/services/resolveInferenceContext';

interface InferenceStore {
  sessionModelId: string;
  config: InferenceSessionConfig;

  getSessionState: () => InferenceSessionState;
  initSession: () => Promise<void>;
  switchModel: (modelId: string) => void;
  setConfidence: (value: number) => void;
  setIou: (value: number) => void;
  setImgSize: (value: number) => void;
}

const useInferenceStoreVanilla = create<InferenceStore>((set, get) => ({
  sessionModelId: '',
  config: { ...DEFAULT_INFERENCE_SESSION_CONFIG },

  getSessionState: () => {
    const { sessionModelId, config } = get();
    return { modelId: sessionModelId, config: { ...config } };
  },

  initSession: async () => {
    await useModelStore.getState().ensureModels();
    const store = useModelStore.getState();
    const model =
      store.getDefaultModel() ??
      store.models.find((item) => item.status === 'ready');

    if (!model) {
      set({
        sessionModelId: '',
        config: { ...DEFAULT_INFERENCE_SESSION_CONFIG },
      });
      return;
    }

    const state = createSessionStateFromModel(model);
    set({
      sessionModelId: state.modelId,
      config: { ...state.config },
    });
  },

  switchModel: (modelId) => {
    const model = useModelStore.getState().getModelById(modelId);
    if (!model) return;

    const previous: InferenceSessionState = {
      modelId: get().sessionModelId,
      config: { ...get().config },
    };
    const next = switchSessionModel(model, previous);
    set({
      sessionModelId: next.modelId,
      config: { ...next.config },
    });
  },

  setConfidence: (value) =>
    set((state) => ({
      config: { ...state.config, confidence: value },
    })),

  setIou: (value) =>
    set((state) => ({
      config: { ...state.config, iou: value },
    })),

  setImgSize: (value) =>
    set((state) => ({
      config: { ...state.config, imgSize: value },
    })),
}));

export const useInferenceStore = bridgeVanillaStoreToPinia('inference', useInferenceStoreVanilla);
