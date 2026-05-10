import { build, context } from "esbuild";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const baseOptions = {
  entryPoints: [resolve(root, "src/index.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  logLevel: "info",
};

mkdirSync(resolve(root, "dist"), { recursive: true });

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await context({
    ...baseOptions,
    outfile: resolve(root, "dist/dmark.js"),
    sourcemap: true,
    minify: false,
  });
  await ctx.watch();
  console.log("[esbuild] watching src/ ...");
} else {
  await build({
    ...baseOptions,
    outfile: resolve(root, "dist/dmark.js"),
    sourcemap: true,
    minify: false,
  });
  await build({
    ...baseOptions,
    outfile: resolve(root, "dist/dmark.min.js"),
    minify: true,
  });

  await build({
    ...baseOptions,
    format: "iife",
    globalName: "dmark",
    outfile: resolve(root, "dist/dmark.iife.min.js"),
    minify: true,
  });

  console.log("[esbuild] built dist/dmark.js + .min.js + .iife.min.js");

  console.log("[tsc] emitting .d.ts ...");
  const tscBin = process.platform === "win32" ? "tsc.cmd" : "tsc";
  const r = spawnSync(tscBin, ["-p", "tsconfig.build.json"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("[tsc] dist/types/ ready");
}
