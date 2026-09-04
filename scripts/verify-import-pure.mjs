/**
 * Import / Export 纯函数自检（无 Store）。
 * 运行：node scripts/verify-import-pure.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function setupDomGlobals() {
  const window = new Window();
  globalThis.document = window.document;
  globalThis.DOMParser = window.DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer;
}

async function main() {
  setupDomGlobals();
  const esbuild = await import('esbuild');
  const outfile = path.join(root, 'scripts', '.tmp-import-export-pure-bundle.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'scripts', 'import-export-pure-test-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': 'true',
    },
  });
  await import(pathToFileURL(outfile).href);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
