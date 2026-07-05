import { build, context } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => resolve(root, 'src', p);
const out = (p) => resolve(root, 'dist', p);

const CORE_PKG = '@clynamic/dmark';

const base = {
  bundle: true,
  target: 'es2022',
  platform: 'browser',
  logLevel: 'info',
};

const core = { ...base, entryPoints: [src('index.ts')] };
// md add-on for npm: core stays external so it is shared, not re-inlined.
const md = { ...base, entryPoints: [src('md/index.ts')], external: [CORE_PKG] };
// md full for the cdn: core aliased back to source so the bundle is a
// self-contained superset exposing the same `dmark` global as core.
const full = {
  ...base,
  entryPoints: [src('full.ts')],
  alias: { [CORE_PKG]: src('index.ts') },
};

mkdirSync(resolve(root, 'dist'), { recursive: true });

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await context({
    ...core,
    format: 'esm',
    outfile: out('dmark.js'),
    sourcemap: true,
    minify: false,
  });
  await ctx.watch();
  console.log('[esbuild] watching src/ ...');
} else {
  await build({
    ...core,
    format: 'esm',
    outfile: out('dmark.js'),
    sourcemap: true,
    minify: false,
  });
  await build({
    ...core,
    format: 'esm',
    outfile: out('dmark.min.js'),
    minify: true,
  });
  await build({
    ...core,
    format: 'cjs',
    outfile: out('dmark.cjs'),
    sourcemap: true,
    minify: false,
  });
  await build({
    ...core,
    format: 'iife',
    globalName: 'dmark',
    outfile: out('dmark.iife.min.js'),
    minify: true,
  });

  await build({
    ...md,
    format: 'esm',
    outfile: out('dmark-md.js'),
    sourcemap: true,
    minify: false,
  });
  await build({
    ...md,
    format: 'cjs',
    outfile: out('dmark-md.cjs'),
    sourcemap: true,
    minify: false,
  });

  await build({
    ...full,
    format: 'esm',
    outfile: out('dmark.md.js'),
    sourcemap: true,
    minify: false,
  });
  await build({
    ...full,
    format: 'esm',
    outfile: out('dmark.md.min.js'),
    minify: true,
  });
  await build({
    ...full,
    format: 'iife',
    globalName: 'dmark',
    outfile: out('dmark.md.iife.min.js'),
    minify: true,
  });

  console.log('[esbuild] built core + md (npm) + md full (cdn)');

  console.log('[tsc] emitting .d.ts ...');
  const tscBin = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
  const r = spawnSync(tscBin, ['-p', 'tsconfig.build.json'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log('[tsc] dist/types/ ready');
}
