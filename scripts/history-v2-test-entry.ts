/**
 * History V2 自检入口（由 verify-history-v2.mjs 打包运行）
 */
import assert from 'node:assert/strict';
import { useAnnotationStore } from '../src/store/useAnnotationStore';
import { useHistoryStore } from '../src/store/useHistoryStore';
import { HistoryManager } from '../src/history/historyManager';
import { BatchCommand } from '../src/history/commands/BatchCommand';
import { AddAnnotationCommand } from '../src/history/commands/AddAnnotationCommand';
import { CreateLabelCommand } from '../src/history/commands/CreateLabelCommand';
import { DeleteLabelCommand } from '../src/history/commands/DeleteLabelCommand';
import { MoveAnnotationCommand } from '../src/history/commands/MoveAnnotationCommand';
import { ChangeAnnotationLabelCommand } from '../src/history/commands/ChangeAnnotationLabelCommand';
import {
  beginTransaction,
  commitTransaction,
  recordTransactionCommand,
} from '../src/history/transaction';
import type { Annotation, Label } from '../src/types';

const DEFAULT_LABEL: Label = {
  id: 'label-1',
  name: 'test',
  color: '#ff0000',
};

function resetStores(options?: { withDefaultLabel?: boolean }): void {
  useHistoryStore.getState().clearHistory();
  useAnnotationStore.setState({
    labels: options?.withDefaultLabel ? [DEFAULT_LABEL] : [],
    annotationsByImage: {},
    annotatedImageIds: {},
    selectedAnnotation: null,
    currentImage: { id: 'img-1', name: 't.jpg', url: '', width: 1000, height: 1000, file: null as unknown as File },
    currentImageIndex: 0,
    imageList: [{ id: 'img-1', name: 't.jpg', url: '', width: 1000, height: 1000, file: null as unknown as File }],
  });
}

function makeAnn(i: number): Annotation {
  return {
    id: `ann-${i}`,
    labelId: 'label-1',
    shapeType: 'rectangle',
    x: i % 100,
    y: Math.floor(i / 100),
    width: 20,
    height: 15,
  };
}

export function runHistoryV2Tests(): void {
  // --- 1. 1000 annotation Undo/Redo ---
  {
    resetStores();
    const imageId = 'img-1';
    for (let i = 0; i < 1000; i++) {
      useHistoryStore
        .getState()
        .executeCommand(new AddAnnotationCommand(imageId, makeAnn(i)));
    }
    assert.equal(
      useHistoryStore.getState().undoSize,
      1000,
      `expected 1000 undo entries, got ${useHistoryStore.getState().undoSize}`
    );
    assert.equal(
      useAnnotationStore.getState().annotationsByImage[imageId]?.length,
      1000
    );
    for (let i = 0; i < 1000; i++) {
      assert.ok(useHistoryStore.getState().canUndo);
      useHistoryStore.getState().undo();
    }
    assert.equal(
      useAnnotationStore.getState().annotationsByImage[imageId]?.length ?? 0,
      0
    );
    for (let i = 0; i < 1000; i++) {
      assert.ok(useHistoryStore.getState().canRedo);
      useHistoryStore.getState().redo();
    }
    assert.equal(
      useAnnotationStore.getState().annotationsByImage[imageId]?.length,
      1000
    );
    console.log('PASS test1: 1000 annotation undo/redo');
  }

  // --- 2. 垃圾桶清空不可撤销 ---
  {
    resetStores({ withDefaultLabel: true });
    const imageId = 'img-1';
    const anns = Array.from({ length: 1000 }, (_, i) => makeAnn(i));
    useAnnotationStore.getState().replaceImageAnnotations(imageId, anns);
    for (let i = 0; i < 5; i++) {
      useHistoryStore
        .getState()
        .executeCommand(new AddAnnotationCommand(imageId, makeAnn(1000 + i)));
    }
    assert.equal(useHistoryStore.getState().undoSize, 5);
    useAnnotationStore.getState().clearCurrentImageAnnotations();
    assert.equal(
      useAnnotationStore.getState().annotationsByImage[imageId]?.length ?? 0,
      0
    );
    assert.equal(useHistoryStore.getState().undoSize, 0);
    assert.equal(useHistoryStore.getState().canUndo, false);
    assert.equal(useHistoryStore.getState().undo(), undefined);
    console.log('PASS test2: trash clear → not undoable, history cleared');
  }

  // --- 3. 连续移动各自独立入栈，可逐步撤销 ---
  {
    const mgr = new HistoryManager(1000, 100 * 1024 * 1024);
    resetStores();
    const imageId = 'img-1';
    useAnnotationStore.getState().replaceImageAnnotations(imageId, [makeAnn(0)]);
    for (let i = 1; i <= 10; i++) {
      mgr.execute(
        new MoveAnnotationCommand(imageId, 'ann-0', { x: i - 1, y: 0 }, { x: i, y: 0 })
      );
    }
    assert.equal(mgr.undoSize, 10, 'each move should be its own undo step');
    mgr.undo();
    assert.equal(
      useAnnotationStore.getState().annotationsByImage[imageId]?.[0]?.x,
      9
    );
    console.log('PASS test3: separate moves stay separate undo steps');
  }

  // --- 4. 删除标签 Undo 恢复标签与关联 annotation ---
  {
    resetStores();
    const label: Label = {
      id: 'label-fire',
      name: 'fire',
      color: '#ff0000',
    };
    useHistoryStore.getState().executeCommand(new CreateLabelCommand(label));
    useHistoryStore.getState().executeCommand(
      new AddAnnotationCommand('img-1', {
        ...makeAnn(1),
        labelId: label.id,
      })
    );
    const snapshot = DeleteLabelCommand.capture([label.id]);
    assert.ok(snapshot);
    useHistoryStore.getState().executeCommand(new DeleteLabelCommand(snapshot!));
    assert.equal(useAnnotationStore.getState().labels.length, 0);
    assert.ok(useHistoryStore.getState().canUndo);
    useHistoryStore.getState().undo();
    assert.equal(useAnnotationStore.getState().labels.length, 1);
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.length,
      1
    );
    console.log('PASS test4: delete label undo restores label + annotation');
  }

  // --- 5. Transaction: 100 次改标签，一次 Undo ---
  {
    resetStores();
    const label: Label = { id: 'l1', name: 'a', color: '#111' };
    const label2: Label = { id: 'l2', name: 'b', color: '#222' };
    useAnnotationStore.getState().addLabel(label);
    useAnnotationStore.getState().addLabel(label2);
    useAnnotationStore.getState().replaceImageAnnotations('img-1', [
      { ...makeAnn(0), labelId: 'l1' },
    ]);

    beginTransaction('bulk-label-change');
    for (let i = 0; i < 100; i++) {
      recordTransactionCommand(
        new ChangeAnnotationLabelCommand('img-1', 'ann-0', 'l1', 'l2')
      );
    }
    const batch = commitTransaction();
    assert.ok(batch);
    useHistoryStore.getState().pushCommand(batch!);
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.[0]?.labelId,
      'l2'
    );
    assert.ok(useHistoryStore.getState().canUndo);
    useHistoryStore.getState().undo();
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.[0]?.labelId,
      'l1'
    );
    console.log('PASS test5: transaction 100 ops, single undo');
  }

  console.log('All History V2 checks passed.');
}

runHistoryV2Tests();
