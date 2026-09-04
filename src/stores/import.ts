import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import type { ImportProgress } from '../importer/types';

interface ImportStore {
  progress: ImportProgress | null;
  visible: boolean;
  setProgress: (progress: ImportProgress) => void;
  show: () => void;
  /** 关闭弹窗但保留后台进度（图片已可用时） */
  dismissModal: () => void;
  hide: () => void;
  reset: () => void;
}

const useImportStoreVanilla = create<ImportStore>((set) => ({
  progress: null,
  visible: false,
  setProgress: (progress) => set({ progress }),
  show: () => set({ visible: true }),
  /** 仅关闭弹窗，保留进度（图片就绪后后台解析标注） */
  dismissModal: () => set({ visible: false }),
  hide: () => set({ visible: false, progress: null }),
  reset: () => set({ visible: false, progress: null }),
}));

export const useImportStore = bridgeVanillaStoreToPinia('import', useImportStoreVanilla);
