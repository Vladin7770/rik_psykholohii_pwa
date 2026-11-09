import './validate-academic.cjs';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { publicConfig, configScript } from './public-config.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (!process.env.VERCEL && !process.env.RIK_SKIP_LOCAL_ENV) {
  for (const name of ['.env.local', '.env']) {
    const path = join(root, name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
const config = publicConfig(process.env);
const runtime = configScript(config);
const bundled = await build({
  absWorkingDir: root, entryPoints: ['src/auth.mjs'], bundle: true,
  platform: 'browser', format: 'iife', target: ['es2020'], minify: true,
  write: false, legalComments: 'inline',
});
const bundle = bundled.outputFiles[0].text;
const files = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'content/curriculum.js', 'content/academic-core.js', 'content/academic-ui.js'];
const sourceWorker = await readFile(join(root, 'service-worker.js'), 'utf8');
const hash = createHash('sha256').update(bundle).update(runtime).update(sourceWorker);
for (const file of files) hash.update(await readFile(join(root, file)));
const fingerprint = hash.digest('hex').slice(0, 16);
const worker = sourceWorker
  .replace(/const BUILD = '([^']+)'/, (_, base) => `const BUILD = '${base}-${fingerprint}'`);

const out = join(root, 'dist');
await mkdir(out, { recursive: true });
await mkdir(join(out, 'content'), { recursive: true });
await Promise.all(files.map(file => copyFile(join(root, file), join(out, file))));
await Promise.all([
  writeFile(join(out, 'auth.js'), bundle),
  writeFile(join(out, 'runtime-config.js'), runtime),
  writeFile(join(out, 'service-worker.js'), worker),
]);
console.log('Static PWA built in dist/. Supabase Auth: ' + (config.SUPABASE_URL ? 'configured.' : 'not configured; local study remains available.'));
