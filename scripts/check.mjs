#!/usr/bin/env node
// 校验 ideas/ideas.json 与 ideas/works-today.json（及其人读镜像 works-today.md），并检查构建产物 docs/index.html 内嵌快照一致。
// 用法：node scripts/check.mjs [ideas.json 路径]   只校验该 ideas 文件
//       node scripts/check.mjs                     校验默认数据文件并核对页面快照（不一致就先 pnpm build）
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MOUNT_TYPES = ["custom-css", "mcp", "skill", "standalone-page", "needs-plugin-api"];
export const OPEN_MOUNT_TYPES = ["custom-css", "mcp", "skill", "standalone-page"];
export const STATUSES = ["open", "built", "shipped-upstream"];
export const VALUES = ["high", "medium", "low"];
export const API_STATUSES = ["not-available", "experimental", "available"];
// 语言登记表与页面共用：每种语言的数据字段后缀（基础语言为空）。
export const LANGUAGES = JSON.parse(readFileSync(resolve(root, "src/i18n/languages.json"), "utf8"));
const SNAPSHOT_OF = (id) => new RegExp(`<script id="${id}" type="application\\/json">([\\s\\S]*?)<\\/script>`);
// 日期写成 YYYY-MM-DD 且是日历上真实存在的一天（2026-02-30、2026-13-01 不算）。
const DATE = {
  test: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(v);
  },
};
const AT_MENTION = /(^|[^\w`])@[A-Za-z0-9-]/;

const isText = (v) => typeof v === "string" && v.trim() !== "";
const isHttps = (v) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

// categoryNames: { 语言 code: { 分类: 显示名 } }，传入时校验每个分类在每种语言的字典里都有名字。
export function validate(doc, categoryNames) {
  const errors = [];
  if (doc?.official_api !== undefined) {
    const api = doc.official_api;
    if (!API_STATUSES.includes(api?.status)) errors.push(`official_api.status 必须是 ${API_STATUSES.join(" / ")} 之一`);
    if (!DATE.test(api?.as_of ?? "")) errors.push("official_api.as_of 必须是 YYYY-MM-DD");
    if (!isHttps(api?.tracking_url)) errors.push("official_api.tracking_url 必须是 https 链接");
    for (const { suffix } of LANGUAGES) {
      if (!isText(api?.["summary" + suffix])) errors.push(`official_api 缺少必填字段 summary${suffix}`);
    }
    if (AT_MENTION.test(JSON.stringify(api))) errors.push("official_api 不得含 @用户名");
  }
  const ideas = doc?.ideas;
  if (!Array.isArray(ideas) || ideas.length === 0) return [...errors, "ideas 必须是非空数组"];
  const seen = new Set();
  ideas.forEach((idea, i) => {
    const id = isText(idea?.slug) ? idea.slug : `#${i}`;
    const bad = (msg) => errors.push(`${id}: ${msg}`);
    for (const key of ["slug", "category"]) {
      if (!isText(idea?.[key])) bad(`缺少必填字段 ${key}`);
    }
    // 每种登记的语言都要有标题、问题描述、挂载说明和审查理由。
    for (const { suffix } of LANGUAGES) {
      for (const [label, holder, key] of [
        ["title", idea, "title"],
        ["problem", idea, "problem"],
        ["mount_today.note", idea?.mount_today, "note"],
        ["review.reasons", idea?.review, "reasons"],
      ]) {
        if (!isText(holder?.[key + suffix])) bad(`缺少必填字段 ${label}${suffix}`);
      }
    }
    if (isText(idea?.slug)) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(idea.slug)) bad("slug 只能用小写字母、数字和连字符");
      if (seen.has(idea.slug)) bad("slug 重复");
      seen.add(idea.slug);
    }
    const sources = idea?.sources;
    if (!Array.isArray(sources) || sources.length === 0) bad("至少需要一个 https 来源");
    else
      sources.forEach((s, j) => {
        if (!isHttps(s?.url)) bad(`sources[${j}].url 必须是 https 链接`);
        if (!DATE.test(s?.date ?? "")) bad(`sources[${j}].date 必须是 YYYY-MM-DD`);
        if (!isText(s?.title)) bad(`sources[${j}].title 缺失`);
      });
    const d = idea?.demand;
    if (!d || !Number.isInteger(d.upvotes) || d.upvotes < 0) bad("demand.upvotes 必须是非负整数");
    if (!DATE.test(d?.as_of ?? "")) bad("demand.as_of 必须是 YYYY-MM-DD");
    if (!["discussion", "comment"].includes(d?.basis)) bad("demand.basis 只能是 discussion 或 comment");
    if (!isHttps(d?.url)) bad("demand.url 必须是 https 链接");
    const m = idea?.mount_today;
    if (!MOUNT_TYPES.includes(m?.type)) bad(`mount_today.type 必须是 ${MOUNT_TYPES.join(" / ")} 之一`);
    if (!isText(m?.note)) bad("mount_today.note 缺失");
    if (m?.docs !== undefined && !isHttps(m.docs)) bad("mount_today.docs 必须是 https 链接");
    // 今日挂载是事实判断：needs-plugin-api 以外的值要给出官方文档或已核实先例作依据。
    else if (m?.docs === undefined && OPEN_MOUNT_TYPES.includes(m?.type)) bad(`mount_today.type 为 ${m.type} 时须用 mount_today.docs 给出官方文档或已核实先例的 https 链接`);
    const r = idea?.review;
    if (!VALUES.includes(r?.value)) bad(`review.value 必须是 ${VALUES.join(" / ")} 之一`);
    if (!DATE.test(r?.as_of ?? "")) bad("review.as_of 必须是 YYYY-MM-DD");
    if (!/^(keep|drop|merge-into:[a-z0-9-]+)$/.test(r?.action ?? "")) bad("review.action 必须是 keep / drop / merge-into:<slug>");
    if (categoryNames) {
      for (const [code, names] of Object.entries(categoryNames)) {
        if (isText(idea?.category) && !isText(names[idea.category])) bad(`分类 ${idea.category} 在 ${code} 字典里没有显示名`);
      }
    }
    if (!STATUSES.includes(idea?.status)) bad(`status 必须是 ${STATUSES.join(" / ")} 之一`);
    // 文字会原样进 issue 正文，GitHub 会通知被 @ 的人。
    if (AT_MENTION.test(JSON.stringify(idea))) bad("不得含 @用户名，GitHub 会通知对方；写不带 @ 的用户名");
  });
  const byslug = new Map(ideas.map((i) => [i?.slug, i]));
  for (const idea of ideas) {
    const target = /^merge-into:(.+)$/.exec(idea?.review?.action ?? "")?.[1];
    if (target === undefined) continue;
    if (target === idea.slug) errors.push(`${idea.slug}: merge-into 不能指向自己`);
    else if (!byslug.has(target)) errors.push(`${idea.slug}: merge-into 目标 ${target} 不存在`);
    else if (byslug.get(target)?.review?.action !== "keep") errors.push(`${idea.slug}: merge-into 目标 ${target} 自身必须是 keep`);
  }
  return errors;
}

export function validateWorksToday(doc) {
  const errors = [];
  if (!DATE.test(doc?.as_of ?? "")) errors.push("works-today.as_of 必须是 YYYY-MM-DD");
  if (!Array.isArray(doc?.projects) || doc.projects.length === 0) errors.push("works-today.projects 必须是非空数组");
  else {
    const seen = new Set();
    doc.projects.forEach((p, i) => {
      const id = isText(p?.repo) ? `works-today[${p.repo}]` : `works-today[#${i}]`;
      if (!isText(p?.repo)) errors.push(`${id}: 缺少 repo`);
      else if (seen.has(p.repo)) errors.push(`${id}: repo 重复`);
      else seen.add(p.repo);
      if (!isHttps(p?.url)) errors.push(`${id}: url 必须是 https 链接`);
      if (!Array.isArray(p?.mounts) || p.mounts.length === 0 || p.mounts.some((m) => !OPEN_MOUNT_TYPES.includes(m))) {
        errors.push(`${id}: mounts 必须是 ${OPEN_MOUNT_TYPES.join(" / ")} 的非空数组`);
      }
      if (!Number.isInteger(p?.stars) || p.stars < 0) errors.push(`${id}: stars 必须是非负整数`);
      if (!DATE.test(p?.stars_as_of ?? "")) errors.push(`${id}: stars_as_of 必须是 YYYY-MM-DD`);
      if (!isText(p?.license)) errors.push(`${id}: license 缺失`);
      for (const { suffix } of LANGUAGES) {
        if (!isText(p?.["summary" + suffix])) errors.push(`${id}: 缺少 summary${suffix}`);
      }
      if (AT_MENTION.test(JSON.stringify(p))) errors.push(`${id}: 不得含 @用户名`);
    });
  }
  if (doc?.reference !== undefined) {
    if (!Array.isArray(doc.reference)) errors.push("works-today.reference 必须是数组");
    else
      doc.reference.forEach((r, i) => {
        const id = isText(r?.repo) ? `reference[${r.repo}]` : `reference[#${i}]`;
        if (!isText(r?.repo)) errors.push(`${id}: 缺少 repo`);
        if (!isHttps(r?.url)) errors.push(`${id}: url 必须是 https 链接`);
        if (!Number.isInteger(r?.stars) || r.stars < 0) errors.push(`${id}: stars 必须是非负整数`);
        if (!DATE.test(r?.stars_as_of ?? "")) errors.push(`${id}: stars_as_of 必须是 YYYY-MM-DD`);
        if (!isText(r?.license)) errors.push(`${id}: license 缺失`);
        for (const { suffix } of LANGUAGES) {
          if (!isText(r?.["reason" + suffix])) errors.push(`${id}: 缺少 reason${suffix}`);
        }
        if (AT_MENTION.test(JSON.stringify(r))) errors.push(`${id}: 不得含 @用户名`);
      });
  }
  return errors;
}

// works-today.md 是 works-today.json 的人读镜像：表格行与 projects 一一对应（链接、挂载、星数、许可证开头），
// 表头星数日期与每个项目的 stars_as_of 一致，「Listed for reference」段列出每个 reference 及其星数。
export function validateWorksTodayMarkdown(md, doc) {
  const errors = [];
  const text = md.replace(/\r\n/g, "\n");
  const header = /^\| Project \| Mount \| Stars \(([^)]*)\) \| License \|.*$/m.exec(text);
  if (!header) return ["works-today.md 缺少 | Project | Mount | Stars (YYYY-MM-DD) | License | 表头"];
  const rows = new Map();
  for (const line of text.slice(header.index).split("\n").slice(2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(cells[0] ?? "");
    if (!link) {
      errors.push(`works-today.md 表格行无法解析：${line}`);
      continue;
    }
    if (rows.has(link[1])) errors.push(`works-today.md[${link[1]}]: 表格里重复`);
    rows.set(link[1], { url: link[2], mounts: cells[1] ?? "", stars: cells[2] ?? "", license: cells[3] ?? "" });
  }
  const projects = Array.isArray(doc?.projects) ? doc.projects : [];
  for (const p of projects) {
    const id = `works-today.md[${p?.repo}]`;
    const row = rows.get(p?.repo);
    rows.delete(p?.repo);
    if (!row) {
      errors.push(`${id}: works-today.json 有此项目，表格里没有`);
      continue;
    }
    if (row.url !== p.url) errors.push(`${id}: url ${row.url} 与 json 的 ${p.url} 不一致`);
    const mounts = row.mounts.split(",").map((m) => m.trim()).filter(Boolean);
    if ([...mounts].sort().join() !== [...(p.mounts ?? [])].sort().join()) errors.push(`${id}: mounts「${row.mounts}」与 json 的 ${p.mounts?.join(", ")} 不一致`);
    if (row.stars !== String(p.stars)) errors.push(`${id}: stars ${row.stars} 与 json 的 ${p.stars} 不一致`);
    if (!isText(p.license) || !row.license.startsWith(p.license)) errors.push(`${id}: license「${row.license}」与 json 的 ${p.license} 不一致`);
    if (header[1] !== p.stars_as_of) errors.push(`${id}: 表头星数日期 ${header[1]} 与 json 的 stars_as_of ${p.stars_as_of} 不一致`);
  }
  for (const repo of rows.keys()) errors.push(`works-today.md[${repo}]: 表格里有，works-today.json 的 projects 里没有`);
  const refStart = text.search(/^## Listed for reference/m);
  const refSection = refStart < 0 ? "" : text.slice(refStart).split(/\n## /)[0];
  for (const r of Array.isArray(doc?.reference) ? doc.reference : []) {
    const line = refSection.split("\n").find((l) => l.includes(`[${r?.repo}](${r?.url})`));
    if (!line) errors.push(`works-today.md[${r?.repo}]: 「Listed for reference」段缺少此参考项或链接不一致`);
    else if (!new RegExp(`\\b${r.stars} stars\\b`).test(line)) errors.push(`works-today.md[${r.repo}]: 参考项星数与 json 的 ${r.stars} 不一致`);
  }
  return errors;
}

// 字典是 TypeScript 文件，Node 直接去掉类型后加载，只取分类名。
export async function loadCategoryNames() {
  const out = {};
  for (const { code } of LANGUAGES) out[code] = (await import(`../src/i18n/${code}.ts`))[code].categories;
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith("--"));
  const ideasPath = fileArg ? resolve(fileArg) : resolve(root, "ideas/ideas.json");
  let doc;
  try {
    doc = JSON.parse(readFileSync(ideasPath, "utf8"));
  } catch (e) {
    console.error(`FAIL 无法读取 ${ideasPath}: ${e.message}`);
    process.exit(1);
  }
  const errors = validate(doc, await loadCategoryNames());
  let works;
  if (!fileArg) {
    const worksPath = resolve(root, "ideas/works-today.json");
    try {
      works = JSON.parse(readFileSync(worksPath, "utf8"));
      errors.push(...validateWorksToday(works));
      errors.push(...validateWorksTodayMarkdown(readFileSync(resolve(root, "works-today.md"), "utf8"), works));
    } catch (e) {
      errors.push(`无法读取 ${worksPath}: ${e.message}`);
    }
  }
  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error(`${errors.length} 个问题`);
    process.exit(1);
  }
  if (!fileArg) {
    const page = readFileSync(resolve(root, "docs/index.html"), "utf8");
    for (const [id, expected, label] of [
      ["ideas-data", doc, "ideas/ideas.json"],
      ["works-today-data", works, "ideas/works-today.json"],
    ]) {
      const embedded = SNAPSHOT_OF(id).exec(page)?.[1];
      if (embedded === undefined) {
        console.error(`FAIL docs/index.html 缺少 <script id="${id}"> 快照，运行 pnpm build`);
        process.exit(1);
      }
      if (JSON.stringify(JSON.parse(embedded)) !== JSON.stringify(expected)) {
        console.error(`FAIL docs/index.html 内嵌 ${id} 快照与 ${label} 不一致，运行 pnpm build`);
        process.exit(1);
      }
    }
  }
  console.log(`OK ${doc.ideas.length} 条想法${works ? `、${works.projects.length} 个今日可用项目` : ""}通过校验`);
}

// 按真实路径比较：经符号链接调用时 argv[1] 是链接路径，而 import.meta.url 已解析成真实路径。
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
