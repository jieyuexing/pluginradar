// 构建：Tailwind 编译 CSS，esbuild 打包 JS，连同 ideas.json 与 works-today.json 快照内联成单个 docs/index.html。
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const snapshotTag = (doc, id = "ideas-data") =>
  `<script id="${id}" type="application/json">${JSON.stringify(doc).replaceAll("<", "\\u003c")}</script>`;

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "t3ideas-"));
  try {
    const cssFile = join(tmp, "styles.css");
    execFileSync(join(root, "node_modules/.bin/tailwindcss"), ["-i", join(root, "src/styles.css"), "-o", cssFile, "--minify"], { cwd: root, stdio: "inherit" });
    const result = await build({
      entryPoints: [join(root, "src/main.tsx")],
      bundle: true,
      write: false,
      outdir: join(tmp, "js"),
      platform: "browser",
      format: "iife",
      target: "es2022",
      minify: true,
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      tsconfig: join(root, "tsconfig.json"),
      loader: { ".css": "empty" },
      logLevel: "warning",
    });
    const js = result.outputFiles[0].text.replace(/<\/(script)/gi, "<\\/$1");
    const css = readFileSync(cssFile, "utf8");
    const doc = JSON.parse(readFileSync(join(root, "ideas/ideas.json"), "utf8"));
    const works = JSON.parse(readFileSync(join(root, "ideas/works-today.json"), "utf8"));
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PluginRadar for T3 Code</title>
<meta name="description" content="PluginRadar — Unofficial plugin & add-on radar for T3 Code: zero-fork add-ons that work today, official plugin API tracker, and ranked ideas from public discussions.">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
${snapshotTag(doc, "ideas-data")}
${snapshotTag(works, "works-today-data")}
<script>${js}</script>
</body>
</html>
`;
    writeFileSync(join(root, "docs/index.html"), html);
    console.log(`docs/index.html ${Buffer.byteLength(html)} B, ${doc.ideas.length} ideas, ${works.projects.length} works-today`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
