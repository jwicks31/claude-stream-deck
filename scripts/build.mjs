/* Build the plugin bundle into com.articulate.claude-usage.sdPlugin/bin. */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdPlugin = path.join(root, "com.articulate.claude-usage.sdPlugin");
const bin = path.join(sdPlugin, "bin");
mkdirSync(bin, { recursive: true });

// 1. Bundle the plugin (ESM, .mjs so Node's module type is unambiguous).
await build({
  entryPoints: [path.join(root, "src/plugin.ts")],
  outfile: path.join(bin, "plugin.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: "inline",
  // ws optional native accelerators — resolved at runtime if present, fine if absent.
  external: ["bufferutil", "utf-8-validate"],
  banner: {
    js: "import { createRequire as __cdCreateRequire } from 'node:module'; const require = __cdCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});

// 2. Hook script, verbatim (dependency-free).
cpSync(path.join(root, "hooks/claude-state-hook.mjs"), path.join(bin, "claude-state-hook.mjs"));

// 3. Bundle ccusage: per-platform native binaries + npm launcher fallback.
const ccusageDir = path.join(bin, "ccusage");
mkdirSync(ccusageDir, { recursive: true });
const scoped = path.join(root, "node_modules", "@ccusage");
if (existsSync(scoped)) {
  for (const pkg of readdirSync(scoped)) {
    const m = pkg.match(/^ccusage-(.+)-(.+)$/); // e.g. ccusage-darwin-arm64
    const src = path.join(scoped, pkg, "bin", process.platform === "win32" ? "ccusage.exe" : "ccusage");
    if (!m || !existsSync(src)) continue;
    const destDir = path.join(ccusageDir, `${m[1]}-${m[2]}`);
    mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(src));
    cpSync(src, dest);
    chmodSync(dest, 0o755);
    console.log(`bundled ccusage binary: ${m[1]}-${m[2]}`);
  }
}
cpSync(path.join(root, "node_modules", "ccusage", "src", "cli.js"), path.join(ccusageDir, "cli.js"));

console.log("build complete →", path.relative(root, bin));
