import { onMounted, onUnmounted } from 'vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { isTypingTarget } from '@/utils/keyboard';

/** 全局图片切换快捷键：A 上一张，D 下一张 */
export function useImageNavigation(): void {
  const annotationStore = useAnnotationStore();

  function handleKeyDown(e: KeyboardEvent): void {
    if (isTypingTarget()) return;
    if (annotationStore.labelModalOpen || annotationStore.waitingForLabel) return;

    if (e.key === 'a' || e.key === 'A') {
      annotationStore.goToPreviousImage();
      (document.activeElement as HTMLElement | null)?.blur();
    } else if (e.key === 'd' || e.key === 'D') {
      annotationStore.goToNextImage();
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
}
