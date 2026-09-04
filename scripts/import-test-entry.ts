import assert from 'node:assert/strict';
import {
  ImportTaskManager,
  LabelRegistry,
  matchDatasetItems,
  parseAnnotationBatch,
  scanDatasetFiles,
  yieldToMain,
} from '../src/importer';
import { useAnnotationStore } from '../src/store/useAnnotationStore';
import { useHistoryStore } from '../src/store/useHistoryStore';

function mockFile(name: string, content = ''): File {
  return new File([content], name, {
    type: name.endsWith('.json') ? 'application/json' : 'image/jpeg',
  });
}

function makeDatasetFiles(count: number, withJson = true): File[] {
  const files: File[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = String(i + 1).padStart(5, '0');
    files.push(mockFile(`${id}.jpg`));
    if (withJson) {
      files.push(
        mockFile(
          `${id}.json`,
          JSON.stringify({
            annotations: [
              {
                labelName: 'crack',
                shapeType: 'rectangle',
                x: 1,
                y: 2,
                width: 10,
                height: 8,
              },
            ],
          })
        )
      );
    }
  }
  return files;
}

function resetStores(): void {
  useHistoryStore.getState().clearHistory();
  useAnnotationStore.getState().prepareDatasetImport();
}

async function runTests(): Promise<void> {
  // test1: 10000 image index
  {
    const files = makeDatasetFiles(10000, false);
    const start = performance.now();
    const index = scanDatasetFiles(files);
    const elapsed = performance.now() - start;
    assert.equal(index.images.size, 10000);
    assert.ok(elapsed < 3000, `scan should be fast, took ${elapsed.toFixed(0)}ms`);
    console.log(`PASS test1: 10000 image index in ${elapsed.toFixed(0)}ms`);
  }

  // test2: 10000 JSON matching (case insensitive)
  {
    const files: File[] = [];
    for (let i = 0; i < 10000; i += 1) {
      const id = String(i + 1).padStart(5, '0');
      files.push(mockFile(i % 2 === 0 ? `${id}.JPG` : `${id}.jpg`));
      files.push(mockFile(`${id}.json`, '{}'));
    }
    const index = scanDatasetFiles(files);
    const items = matchDatasetItems(index);
    assert.equal(items.length, 10000);
    assert.equal(items.filter((x) => x.annotationFile).length, 10000);
    console.log('PASS test2: 10000 JSON matched');
  }

  // test3: batch parse
  {
    const files = makeDatasetFiles(500);
    const index = scanDatasetFiles(files);
    const items = matchDatasetItems(index);
    const inputs = items
      .filter((item) => item.annotationFile)
      .map((item) => ({
        imageId: item.id,
        annotationFile: item.annotationFile!,
      }));

    const registry = new LabelRegistry();
    const result = await parseAnnotationBatch(inputs, registry, 200);
    assert.equal(Object.keys(result.annotationsByImage).length, 500);
    assert.equal(result.annotationCount, 500);
    console.log('PASS test3: batch parse 500 json files');
  }

  // test4: cancel task
  {
    resetStores();
    const files = makeDatasetFiles(2000);
    const manager = new ImportTaskManager();
    const importPromise = manager.startImport(files);
    await yieldToMain(0);
    manager.cancel();
    const result = await importPromise;
    assert.equal(result.status, 'cancelled');
    assert.ok(useAnnotationStore.getState().imageList.length < 2000);
    console.log('PASS test4: cancel import task');
  }

  // test5: import yields (not one long sync block)
  {
    resetStores();
    const files = makeDatasetFiles(1000);
    let yieldCount = 0;
    const originalYield = yieldToMain;
    const patchedYield = async (timeoutMs?: number) => {
      yieldCount += 1;
      return originalYield(timeoutMs);
    };

    // Monkey-patch via dynamic import not easy; instead verify batch append grows incrementally
    const manager = new ImportTaskManager();
    const checkpoints: number[] = [];
    const poll = setInterval(() => {
      checkpoints.push(useAnnotationStore.getState().imageList.length);
    }, 5);

    const result = await manager.startImport(files);
    clearInterval(poll);

    assert.equal(result.status, 'completed');
    assert.equal(useAnnotationStore.getState().imageList.length, 1000);
    assert.ok(checkpoints.some((n) => n > 0 && n < 1000), 'list should grow in batches');
    console.log('PASS test5: incremental batch append (UI-friendly)');
  }

  console.log('All import checks passed.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
