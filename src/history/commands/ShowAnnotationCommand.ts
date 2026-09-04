import type { Command } from '../command';
import { FIXED_LIGHT_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

export interface ShowViewSnapshot {
  currentImageId: string | null;
  currentImageIndex: number;
  stagePosition: { x: number; y: number };
  selectedAnnotation: string | null;
  selectedAnnotationIds?: string[];
}

/** 显示标注（Undo 时重新隐藏） */
export class ShowAnnotationCommand implements Command {
  readonly name = 'SHOW_ANNOTATION';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private readonly beforeView: ShowViewSnapshot,
    private readonly focusView = true
  ) {}

  execute(): void {
    useAnnotationStore
      .getState()
      .setAnnotationHidden(this.imageId, this.annotationId, false);
    if (this.focusView) {
      useAnnotationStore.getState().focusAnnotationView(
        this.imageId,
        this.annotationId
      );
    }
  }

  undo(): void {
    useAnnotationStore
      .getState()
      .setAnnotationHidden(this.imageId, this.annotationId, true);
    useAnnotationStore.getState().restoreViewSnapshot(this.beforeView);
  }

  getSize(): number {
    return FIXED_LIGHT_COMMAND_SIZE + 64;
  }
}
