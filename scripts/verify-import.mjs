/**
 * 数据集导入自检。
 * 运行：node scripts/verify-import.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const esbuild = await import('esbuild');
  const outfile = path.join(root, 'scripts', '.tmp-import-bundle.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'scripts', 'import-test-entry.ts')],
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
