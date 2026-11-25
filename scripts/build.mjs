// 构建：Tailwind 编译 CSS，esbuild 打包 JS，连同 ideas.json 与 works-today.json 快照内联成单个 docs/index.html。
// 用法：node scripts/build.mjs           写出 docs/index.html
//       node scripts/build.mjs --check   只在内存里构建，与已提交的 docs/index.html 逐字节比对，不一致就失败
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const snapshotTag = (doc, id = "ideas-data") =>
  `<script id="${id}" type="application/json">${JSON.stringify(doc).replaceAll("<", "\\u003c")}</script>`;

export const pagePath = join(root, "docs/index.html");

// 产物只取决于 src/ 与两份数据文件：Tailwind 的源由 src/styles.css 显式声明（source(none) 关闭自动探测）。
export async function renderPage() {
  const tmp = mkdtempSync(join(tmpdir(), "t3ideas-"));
  try {
    const cssFile = join(tmp, "styles.css");
    execFileSync(join(root, "node_modules/.bin/tailwindcss"), ["-i", join(root, "src/styles.css"), "-o", cssFile, "--minify"], { cwd: root, stdio: "pipe" });
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
    return {
      html: `<!doctype html>
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
`,
      summary: `${doc.ideas.length} ideas, ${works.projects.length} works-today`,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 指出两份页面第一处不同落在哪一段，方便判断是样式、脚本还是数据快照过期。
const SECTIONS = ["<style>", '<script id="ideas-data"', '<script id="works-today-data"', "<script>"];
export function firstDifference(expected, actual) {
  if (expected === actual) return null;
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i += 1;
  const before = expected.slice(0, i);
  return { offset: i, part: SECTIONS.filter((m) => before.includes(m)).at(-1) ?? "<head>" };
}

async function main() {
  const { html, summary } = await renderPage();
  if (process.argv.includes("--check")) {
    const diff = firstDifference(readFileSync(pagePath, "utf8"), html);
    if (diff) {
      console.error(`FAIL docs/index.html 不是当前源码与数据的构建结果（第一处不同在 ${diff.part}，偏移 ${diff.offset}），运行 pnpm build 后提交`);
      process.exit(1);
    }
    console.log(`OK docs/index.html 与重新构建结果一致（${summary}）`);
    return;
  }
  writeFileSync(pagePath, html);
  console.log(`docs/index.html ${Buffer.byteLength(html)} B, ${summary}`);
}

// 按真实路径比较：经符号链接调用时 argv[1] 是链接路径，而 import.meta.url 已解析成真实路径。
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
