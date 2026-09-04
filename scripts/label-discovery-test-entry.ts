import assert from 'node:assert/strict';
import {
  extractLabelsFromAnnotations,
  LabelRegistry,
  parseAnnotationBatch,
  syncImportedLabels,
} from '../src/importer';
import type { ProjectJson } from '../src/importer/annotationParser';
import { useAnnotationStore } from '../src/store/useAnnotationStore';
import { useHistoryStore } from '../src/store/useHistoryStore';
import type { Label } from '../src/types';

function makeLabel(index: number): Label {
  return {
    id: `existing-${index}`,
    name: `标签${index}`,
    color: '#ff0000',
  };
}

function makeShapesJson(labels: string[]): ProjectJson {
  return {
    shapes: labels.map((label) => ({
      label,
      points: [
        [0, 0],
        [10, 10],
      ],
      shape_type: 'rectangle',
    })),
  };
}

function mockJsonFile(name: string, data: ProjectJson): File {
  return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

function resetStore(labels: Label[] = []): void {
  useHistoryStore.getState().clearHistory();
  useAnnotationStore.setState({
    labels,
    annotationsByImage: {},
    annotatedImageIds: {},
    imageList: [],
    currentImage: null,
    currentImageIndex: -1,
  });
}

async function runTests(): Promise<void> {
  // test1: 100 unique labels -> 100 new
  {
    resetStore();
    const registry = new LabelRegistry();
    const names = Array.from({ length: 100 }, (_, i) => `类别${i + 1}`);
    const data = makeShapesJson(names);
    const discovered = extractLabelsFromAnnotations(data);
    assert.equal(discovered.size, 100);

    const sync = syncImportedLabels(discovered, registry);
    assert.equal(sync.newlyCreatedCount, 100);
    assert.equal(registry.byName.size, 100);
    console.log('PASS test1: 100 unique labels -> 100 created');
  }

  // test2: 50 existing + 100 in JSON -> 50 new
  {
    resetStore(Array.from({ length: 50 }, (_, i) => makeLabel(i + 1)));
    const registry = new LabelRegistry(useAnnotationStore.getState().labels);
    const allNames = Array.from({ length: 100 }, (_, i) => `标签${i + 1}`);
    const sync = syncImportedLabels(allNames, registry);
    assert.equal(sync.newlyCreatedCount, 50);
    assert.equal(registry.byName.size, 100);
    console.log('PASS test2: 50 existing + 100 json -> 50 new');
  }

  // test3: duplicate labels not duplicated
  {
    resetStore();
    const registry = new LabelRegistry();
    const data = makeShapesJson(['裂缝', '渗水', '裂缝', '渗水']);
    const discovered = extractLabelsFromAnnotations(data);
    assert.equal(discovered.size, 2);

    syncImportedLabels(discovered, registry);
    syncImportedLabels(discovered, registry);
    assert.equal(registry.byName.size, 2);
    console.log('PASS test3: duplicate labels deduped');
  }

  // test4: 10000 annotations import performance
  {
    resetStore();
    const registry = new LabelRegistry();
    const inputs = Array.from({ length: 1000 }, (_, i) => ({
      imageId: `img-${i}`,
      annotationFile: mockJsonFile(`${i}.json`, {
        shapes: Array.from({ length: 10 }, (_, j) => ({
          label: `标签${j}`,
          points: [
            [0, 0],
            [5, 5],
          ],
          shape_type: 'rectangle',
        })),
      }),
    }));

    const start = performance.now();
    const result = await parseAnnotationBatch(inputs, registry, 200);
    const elapsed = performance.now() - start;

    assert.equal(result.annotationCount, 10000);
    assert.equal(registry.byName.size, 10);
    assert.ok(elapsed < 15000, `parse took ${elapsed.toFixed(0)}ms`);
    console.log(`PASS test4: 10000 annotations in ${elapsed.toFixed(0)}ms`);
  }

  // test5: transaction -> single undo batch
  {
    resetStore();
    useHistoryStore.getState().beginTransaction('IMPORT_LABELS');
    const registry = new LabelRegistry();
    syncImportedLabels(['裂缝', '渗水', '脱落'], registry, { useTransaction: true });
    useHistoryStore.getState().commitTransaction();
    assert.equal(useAnnotationStore.getState().labels.length, 3);
    assert.equal(useHistoryStore.getState().undoSize, 1);
    useHistoryStore.getState().undo();
    assert.equal(useAnnotationStore.getState().labels.length, 0);
    console.log('PASS test5: IMPORT_LABELS transaction -> one undo');
  }

  console.log('All label discovery checks passed.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
