import type { Command } from '../command';
import { FIXED_LIGHT_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import type { ShowViewSnapshot } from './ShowAnnotationCommand';

/** 批量显示标注（不改变画布缩放/平移） */
export class ShowAnnotationsCommand implements Command {
  readonly name = 'SHOW_ANNOTATIONS';

  constructor(
    private readonly imageId: string,
    private readonly annotationIds: string[],
    private readonly beforeView: ShowViewSnapshot,
    private readonly selectedIds: string[]
  ) {}

  execute(): void {
    const store = useAnnotationStore.getState();
    for (const id of this.annotationIds) {
      store.setAnnotationHidden(this.imageId, id, false);
    }
    if (this.selectedIds.length > 0) {
      store.setSelectedAnnotations(this.selectedIds);
    }
  }

  undo(): void {
    const store = useAnnotationStore.getState();
    for (const id of this.annotationIds) {
      store.setAnnotationHidden(this.imageId, id, true);
    }
    store.restoreViewSnapshot(this.beforeView);
  }

  getSize(): number {
    return FIXED_LIGHT_COMMAND_SIZE + this.annotationIds.length * 16;
  }
}
