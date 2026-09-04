import { onMounted, onUnmounted, ref } from 'vue';
import { listProjects, loadProject } from '@/storage/projectRepository';
import {
  getLastProjectId,
  setDismissedRestore,
  shouldOfferRestore,
} from '@/storage/lastProject';
import { restorePersistedProject } from '@/storage/projectRestore';
import { useAnnotationStore } from '@/store/useAnnotationStore';

export interface RestoreOffer {
  projectId: string;
  name: string;
  updatedAt: number;
  imageCount: number;
  labelCount: number;
  annotationCount: number;
}

export function useStartupRestore() {
  const offer = ref<RestoreOffer | null>(null);
  const restoring = ref(false);
  const checkedRef = ref(false);

  async function inspectPersistedProject(): Promise<void> {
    const { imageList } = useAnnotationStore.getState();
    if (checkedRef.value || imageList.length > 0) return;
    checkedRef.value = true;

    try {
      const projects = await listProjects();
      if (projects.length === 0) return;

      const lastId = getLastProjectId();
      const project =
        (lastId ? projects.find((item) => item.id === lastId) : undefined) ??
        projects[0];

      if (!shouldOfferRestore(project)) return;

      const loaded = await loadProject(project.id);
      if (!loaded || loaded.images.length === 0) return;

      offer.value = {
        projectId: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        imageCount: loaded.images.length,
        labelCount: loaded.labels.length,
        annotationCount: loaded.annotations.length,
      };
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn('[startupRestore] failed to inspect persisted project', err);
      }
    }
  }

  let unsubStore: (() => void) | undefined;

  onMounted(() => {
    void inspectPersistedProject();
    unsubStore = useAnnotationStore.subscribe((state) => {
      if (checkedRef.value || state.imageList.length > 0) return;
      void inspectPersistedProject();
    });
  });

  onUnmounted(() => {
    unsubStore?.();
    unsubStore = undefined;
  });

  async function acceptRestore() {
    if (!offer.value) return null;
    restoring.value = true;
    try {
      const summary = await restorePersistedProject(offer.value.projectId);
      offer.value = null;
      return summary;
    } finally {
      restoring.value = false;
    }
  }

  function dismissRestore(): void {
    if (!offer.value) return;
    setDismissedRestore(offer.value.projectId, offer.value.updatedAt);
    offer.value = null;
  }

  return {
    offer,
    restoring,
    acceptRestore,
    dismissRestore,
  };
}
