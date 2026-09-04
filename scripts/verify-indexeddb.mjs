/**
 * IndexedDB 存储层自检（Node + fake-indexeddb）。
 * 运行：node scripts/verify-indexeddb.mjs
 *
 * 不修改业务逻辑；仅验证 src/storage 读写一致性。
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// fake-indexeddb 提供全局 indexedDB（测试用 polyfill，非业务依赖）
try {
  require('fake-indexeddb/auto');
} catch {
  console.error(
    '缺少 fake-indexeddb。请执行：npm i -D fake-indexeddb\n然后重新运行本脚本。'
  );
  process.exit(1);
}

async function loadStorage() {
  // 动态编译：用 vite-node 不在依赖中时，改为直接读 ts 不可行。
  // 这里用 esbuild-register 或先构建 —— 最简：内联复制 API 测试逻辑太重。
  // 采用：通过 vite SSR / 或把测试写成纯 mjs 调原生 IDB 的同构实现。
  //
  // 方案：脚本内实现一份与 src/storage/indexedDB.ts 对齐的最小验证，
  // 并提示正式代码在 src/storage；同时用子进程跑 tsc 后 import dist —— 无 dist。
  //
  // 最终：用 Node 原生动态 import TypeScript 不可行。
  // 安装 esbuild 已随 vite 带来，用 esbuild 打包 storage 入口到临时文件。
  const esbuild = await import('esbuild');
  const outfile = path.join(root, 'scripts', '.tmp-storage-bundle.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/storage/index.ts')],
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

async function main() {
  const storage = await loadStorage();
  const {
    idb,
    deleteDatabase,
    STORE_PROJECTS,
    STORE_IMAGES,
    STORE_ANNOTATIONS,
    STORE_LABELS,
  } = storage;

  await deleteDatabase();

  const projectId = 'proj-test-1';
  const now = Date.now();

  // --- 创建 project ---
  const project = {
    id: projectId,
    name: 'verify-project',
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await idb.put(STORE_PROJECTS, project);
  const loadedProject = await idb.get(STORE_PROJECTS, projectId);
  assert.deepEqual(loadedProject, project);
  console.log('PASS: create/read project');

  // --- image ---
  const image = {
    id: 'img-1',
    projectId,
    filename: 'demo.jpg',
    width: 1920,
    height: 1080,
    index: 0,
  };
  await idb.put(STORE_IMAGES, image);
  assert.equal((await idb.get(STORE_IMAGES, 'img-1'))?.filename, 'demo.jpg');
  console.log('PASS: create/read image');

  // --- label ---
  await idb.put(STORE_LABELS, {
    id: 'label-fire',
    projectId,
    data: { id: 'label-fire', name: 'fire', color: '#ff0000' },
  });
  console.log('PASS: create label');

  // --- 1000 annotations ---
  const N = 1000;
  const records = [];
  for (let i = 0; i < N; i++) {
    records.push({
      id: `ann-${i}`,
      projectId,
      imageId: 'img-1',
      data: {
        id: `ann-${i}`,
        labelId: 'label-fire',
        shapeType: 'rectangle',
        x: i % 100,
        y: Math.floor(i / 100),
        width: 20,
        height: 15,
      },
    });
  }
  const t0 = performance.now();
  await idb.putMany(STORE_ANNOTATIONS, records);
  const writeMs = performance.now() - t0;

  const t1 = performance.now();
  const all = await idb.getAll(STORE_ANNOTATIONS);
  const readMs = performance.now() - t1;

  assert.equal(all.length, N);
  const byId = new Map(all.map((r) => [r.id, r]));
  for (let i = 0; i < N; i++) {
    const got = byId.get(`ann-${i}`);
    assert.ok(got, `missing ann-${i}`);
    assert.equal(got.projectId, projectId);
    assert.equal(got.imageId, 'img-1');
    assert.equal(got.data.x, i % 100);
    assert.equal(got.data.width, 20);
  }

  const byImage = await idb.getAll(STORE_ANNOTATIONS, 'byImageId', 'img-1');
  assert.equal(byImage.length, N);

  console.log(`PASS: write ${N} annotations in ${writeMs.toFixed(1)}ms`);
  console.log(`PASS: read ${N} annotations in ${readMs.toFixed(1)}ms`);
  console.log('PASS: data consistency check');

  // --- delete / clear ---
  await idb.delete(STORE_ANNOTATIONS, 'ann-0');
  assert.equal(await idb.get(STORE_ANNOTATIONS, 'ann-0'), undefined);
  assert.equal(await idb.count(STORE_ANNOTATIONS), N - 1);
  console.log('PASS: delete one annotation');

  await idb.clear(STORE_ANNOTATIONS);
  assert.equal(await idb.count(STORE_ANNOTATIONS), 0);
  console.log('PASS: clear annotations');

  await deleteDatabase();
  console.log('All IndexedDB storage checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
