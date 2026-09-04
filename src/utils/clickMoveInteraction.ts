export interface MutableValue<T> {
  current: T;
}

/** 跳过下一次「确认」用的 pointerup/mouseup（激活手柄那次按下后的松开） */
export function armSkipNextCommit(skipRef: MutableValue<boolean>): void {
  skipRef.current = true;
}

function shouldSkipCommit(skipRef: MutableValue<boolean>): boolean {
  if (!skipRef.current) return false;
  skipRef.current = false;
  return true;
}

export function endClickMoveSession(endRef: MutableValue<(() => void) | null>): void {
  endRef.current?.();
  endRef.current = null;
}

/**
 * 点击激活 → 移动鼠标跟随 → 再点击（mouseup）确认（无需按住）。
 * 旋转手柄、框体按住拖动等不使用此函数。
 */
export function attachClickMoveSession(options: {
  skipCommitRef: MutableValue<boolean>;
  onMove: (e: MouseEvent) => void;
  onCommit: (e: MouseEvent) => void;
  captureFrom?: PointerEvent | MouseEvent;
}): () => void {
  const { skipCommitRef, onMove, onCommit, captureFrom } = options;

  let ended = false;
  const captureEl = captureFrom?.target as Element | undefined;
  const pointerId =
    captureFrom && 'pointerId' in captureFrom ? captureFrom.pointerId : undefined;

  if (captureEl != null && pointerId != null) {
    try {
      captureEl.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
  }

  const releaseCapture = () => {
    if (captureEl == null || pointerId == null) return;
    try {
      if (captureEl.hasPointerCapture(pointerId)) {
        captureEl.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  };

  const teardown = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp, true);
    window.removeEventListener('pointerup', handlePointerUp, true);
    releaseCapture();
  };

  const handleMove = (e: MouseEvent) => onMove(e);

  const finishCommit = (e: MouseEvent | PointerEvent) => {
    if (e.button !== 0) return;
    if (shouldSkipCommit(skipCommitRef)) return;
    e.stopPropagation();
    teardown();
    onCommit(e as MouseEvent);
  };

  const handleUp = (e: MouseEvent) => finishCommit(e);
  const handlePointerUp = (e: PointerEvent) => finishCommit(e);

  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleUp, true);
  window.addEventListener('pointerup', handlePointerUp, true);

  return teardown;
}

/** 在激活的 mousedown 中同步启动会话 */
export function startClickMoveSession(options: {
  skipCommitRef: MutableValue<boolean>;
  onMove: (e: MouseEvent) => void;
  onCommit: (e: MouseEvent) => void;
  captureFrom?: PointerEvent | MouseEvent;
}): () => void {
  return attachClickMoveSession(options);
}
