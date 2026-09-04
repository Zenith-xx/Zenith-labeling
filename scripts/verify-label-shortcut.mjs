/**
 * 标签数字快捷键自检。
 * 运行：node scripts/verify-label-shortcut.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const esbuild = await import('esbuild');
  const outfile = path.join(root, 'scripts', '.tmp-label-shortcut-bundle.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'scripts', 'label-shortcut-test-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  await import(pathToFileURL(outfile).href);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
