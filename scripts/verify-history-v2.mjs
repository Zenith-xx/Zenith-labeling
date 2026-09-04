/**
 * History V2 自检（Node + esbuild bundle）。
 * 运行：node scripts/verify-history-v2.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const esbuild = await import('esbuild');
  const outfile = path.join(root, 'scripts', '.tmp-history-v2-bundle.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'scripts', 'history-v2-test-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
    alias: {
      '@': path.join(root, 'src'),
    },
  });
  await import(pathToFileURL(outfile).href);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
