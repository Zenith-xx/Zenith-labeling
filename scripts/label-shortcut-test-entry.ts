import assert from 'node:assert/strict';
import {
  formatShortcutKey,
  getShortcutDigitForPageIndex,
  getShortcutLabel,
  getShortcutMaxPage,
  getShortcutStartIndex,
  getShortcutTotalPages,
  getVisibleShortcutLabels,
  parseShortcutDigit,
} from '../src/utils/labelShortcut';
import { useAnnotationStore } from '../src/store/useAnnotationStore';
import { useHistoryStore } from '../src/store/useHistoryStore';
import type { Label } from '../src/types';

function makeLabels(count: number): Label[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `l${i}`,
    name: `标签${i + 1}`,
    color: '#ff0000',
  }));
}

function resetStore(labels: Label[]): void {
  useHistoryStore.getState().clearHistory();
  useAnnotationStore.setState({
    labels,
    annotationsByImage: {},
    annotatedImageIds: {},
    pendingAnnotation: null,
    waitingForLabel: false,
    shortcutPage: 0,
    labelModalOpen: false,
    currentImage: {
      id: 'img-1',
      name: 't.jpg',
      url: '',
      width: 800,
      height: 600,
      file: null as unknown as File,
    },
  });
}

let pendingSeq = 0;

function beginPending(): void {
  pendingSeq += 1;
  useAnnotationStore.getState().beginWaitingForLabel({
    id: `pending-${pendingSeq}`,
    shapeType: 'rectangle',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
  });
}

function runTests(): void {
  // --- utils ---
  assert.equal(parseShortcutDigit('1'), 1);
  assert.equal(parseShortcutDigit('9'), 9);
  assert.equal(parseShortcutDigit('0'), 10);
  assert.equal(formatShortcutKey(10), '0');
  assert.equal(formatShortcutKey(5), '5');
  assert.equal(getShortcutDigitForPageIndex(9), 10);

  const three = makeLabels(3);
  assert.equal(getShortcutLabel(three, 1, 0)?.name, '标签1');
  assert.equal(getShortcutLabel(three, 3, 0)?.name, '标签3');
  assert.equal(getShortcutLabel(three, 1, 1), null);
  console.log('PASS utils: paginated getShortcutLabel');

  // --- test1: 1000 labels in store ---
  {
    const labels = makeLabels(1000);
    resetStore(labels);
    assert.equal(useAnnotationStore.getState().labels.length, 1000);
    console.log('PASS test1: labels.length === 1000');
  }

  // --- test2: 1000 labels pagination (10 per page) ---
  {
    const labels = makeLabels(1000);
    resetStore(labels);
    assert.equal(getShortcutTotalPages(1000), 100);
    assert.equal(getShortcutMaxPage(1000), 99);

    beginPending();
    assert.equal(getVisibleShortcutLabels(labels, 0).length, 10);
    assert.equal(getShortcutLabel(labels, 1, 0)?.name, '标签1');
    assert.equal(getShortcutLabel(labels, 10, 0)?.name, '标签10');

    useAnnotationStore.getState().nextShortcutPage();
    assert.equal(useAnnotationStore.getState().shortcutPage, 1);
    assert.equal(getShortcutLabel(labels, 1, 1)?.name, '标签11');
    assert.equal(getShortcutLabel(labels, 10, 1)?.name, '标签20');

    useAnnotationStore.setState({ shortcutPage: 99 });
    const lastPage = getVisibleShortcutLabels(labels, 99);
    assert.equal(lastPage.length, 10);
    assert.equal(lastPage[0]?.name, '标签991');
    assert.equal(getShortcutLabel(labels, 10, 99)?.name, '标签1000');
    console.log('PASS test2: 1000 labels → 100 pages, last page ok');
  }

  // --- key 0 selects 10th label on page ---
  {
    resetStore(makeLabels(10));
    beginPending();
    assert.ok(useAnnotationStore.getState().confirmPendingWithShortcutDigit(10));
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.[0]?.labelId,
      'l9'
    );
    console.log('PASS: key 0 → digit 10 → 10th label');
  }

  // --- 5 labels: single page ---
  {
    resetStore(makeLabels(5));
    beginPending();
    assert.equal(getVisibleShortcutLabels(useAnnotationStore.getState().labels, 0).length, 5);
    assert.ok(useAnnotationStore.getState().confirmPendingWithShortcutDigit(5));
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.[0]?.labelId,
      'l4'
    );
    console.log('PASS: 5 labels → single page');
  }

  // --- test3: click digit confirms, no modal ---
  {
    resetStore(makeLabels(10));
    beginPending();
    assert.ok(useAnnotationStore.getState().confirmPendingWithShortcutDigit(3));
    assert.equal(useAnnotationStore.getState().waitingForLabel, false);
    assert.equal(useAnnotationStore.getState().labelModalOpen, false);
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.[0]?.labelId,
      'l2'
    );
    console.log('PASS test3: shortcut confirm does not open modal');
  }

  // --- test4: wheel paging via next/previous ---
  {
    resetStore(makeLabels(25));
    beginPending();
    assert.equal(useAnnotationStore.getState().shortcutPage, 0);
    useAnnotationStore.getState().nextShortcutPage();
    assert.equal(useAnnotationStore.getState().shortcutPage, 1);
    useAnnotationStore.getState().previousShortcutPage();
    assert.equal(useAnnotationStore.getState().shortcutPage, 0);
    console.log('PASS test4: wheel page next/previous');
  }

  // --- page1→labels[0], page2→labels[10], undo ---
  {
    resetStore(makeLabels(20));
    beginPending();
    assert.ok(useAnnotationStore.getState().confirmPendingWithShortcutDigit(1));
    beginPending();
    useAnnotationStore.getState().nextShortcutPage();
    assert.ok(useAnnotationStore.getState().confirmPendingWithShortcutDigit(1));
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.length,
      2
    );
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.[1]?.labelId,
      'l10'
    );
    useHistoryStore.getState().undo();
    assert.equal(
      useAnnotationStore.getState().annotationsByImage['img-1']?.length,
      1
    );
    console.log('PASS: page mapping + undo');
  }

  // --- lifecycle ---
  {
    resetStore(makeLabels(20));
    beginPending();
    useAnnotationStore.getState().nextShortcutPage();
    useAnnotationStore.getState().cancelWaitingForLabel();
    assert.equal(useAnnotationStore.getState().shortcutPage, 0);
    beginPending();
    assert.equal(useAnnotationStore.getState().shortcutPage, 0);
    console.log('PASS: lifecycle resets shortcutPage');
  }

  // --- open modal button only ---
  {
    resetStore(makeLabels(3));
    beginPending();
    useAnnotationStore.getState().openLabelModalFromWaiting();
    assert.equal(useAnnotationStore.getState().labelModalOpen, true);
    assert.equal(useAnnotationStore.getState().waitingForLabel, false);
    console.log('PASS: openLabelModalFromWaiting opens modal only');
  }

  console.log('All label shortcut checks passed.');
}

runTests();
