#!/usr/bin/env node
// 只读预采集脚本：一次性用 gh 抓取上游 pingdotgg/t3code 的全部确定性信号，供每周维护任务做语义判断，不修改任何文件或 GitHub 状态。
// 用法：node scripts/mine-report.mjs [--since YYYY-MM-DD] [--json]
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_OWNER = "pingdotgg";
const UPSTREAM_REPO = "t3code";
const KEYWORD_RE = /\b(plugin|plugins|extension|extensions|hook|hooks|webhook|integration|panel|widget|notification|provider|mcp|skill|theme|tray|sidebar|addon|mod|mods)\b/i;

function ghJson(args, retries = 1) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const out = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
      return JSON.parse(out);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function graphql(query, vars = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null) continue;
    args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  }
  const res = ghJson(args);
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join("; "));
  return res.data;
}

const discNumber = (url) => {
  const m = /\/discussions\/(\d+)/.exec(url ?? "");
  return m ? Number(m[1]) : null;
};

function fetchExistingDiscussions(numbers) {
  const result = new Map();
  const unique = [...new Set(numbers.filter(Boolean))];
  const batchSize = 20;
  for (let i = 0; i < unique.length; i += batchSize) {
    const slice = unique.slice(i, i + batchSize);
    const fields = slice
      .map((n) => `d${n}: discussion(number: ${n}) { number title closed stateReason upvoteCount comments { totalCount } updatedAt }`)
      .join("\n");
    const data = graphql(`query { repository(owner: "${UPSTREAM_OWNER}", name: "${UPSTREAM_REPO}") { ${fields} } }`);
    for (const n of slice) {
      const node = data.repository[`d${n}`];
      if (node) result.set(n, node);
    }
  }
  return result;
}

function fetchRecentCandidates(sinceIso, knownNumbers, maxPages = 3) {
  const candidates = [];
  let cursor = null;
  let scanned = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const data = graphql(
      `query($cursor: String) {
        repository(owner: "${UPSTREAM_OWNER}", name: "${UPSTREAM_REPO}") {
          discussions(first: 100, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
            pageInfo { hasNextPage endCursor }
            nodes {
              number title closed createdAt updatedAt url upvoteCount
              category { name }
              comments { totalCount }
              bodyText
            }
          }
        }
      }`,
      cursor ? { cursor } : {},
    );
    const conn = data.repository.discussions;
    for (const d of conn.nodes) {
      scanned += 1;
      if (d.updatedAt < sinceIso) return { scanned, candidates };
      if (d.closed || knownNumbers.has(d.number)) continue;
      if (d.category?.name !== "Ideas") continue;
      const keywordHit = KEYWORD_RE.test(d.title);
      if (d.upvoteCount >= 5 || (keywordHit && d.upvoteCount >= 3)) {
        candidates.push({
          number: d.number,
          title: d.title,
          url: d.url,
          createdAt: d.createdAt.slice(0, 10),
          updatedAt: d.updatedAt.slice(0, 10),
          upvotes: d.upvoteCount,
          comments: d.comments.totalCount,
          keywordHit,
          snippet: (d.bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, 360),
        });
      }
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return { scanned, candidates };
}

function fetchDocsChanges(sinceIso) {
  const commits = ghJson(["api", `repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits?path=docs/user&since=${encodeURIComponent(sinceIso)}&per_page=30`]);
  const files = ghJson(["api", `repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/contents/docs/user`]).map((f) => f.name);
  return {
    totalFiles: files.length,
    pluginDocMatches: files.filter((f) => /plugin|extension|addon/i.test(f)),
    recentCommits: commits.map((c) => ({
      sha: c.sha.slice(0, 8),
      date: c.commit.author.date.slice(0, 10),
      message: c.commit.message.split("\n")[0],
    })),
  };
}

function fetchOfficialApiSignals() {
  const pr34534 = ghJson(["api", `repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls/34534`]);
  const searchPrs = ghJson([
    "api",
    `search/issues?q=${encodeURIComponent(`repo:${UPSTREAM_OWNER}/${UPSTREAM_REPO} is:pr is:open (plugin OR extension) in:title`)}&per_page=10`,
  ]);
  return {
    pr34534: {
      state: pr34534.state,
      draft: pr34534.draft,
      updatedAt: pr34534.updated_at.slice(0, 10),
      labels: pr34534.labels.map((l) => l.name),
      comments: pr34534.comments,
      reviewComments: pr34534.review_comments,
    },
    openPluginPrs: searchPrs.items.map((p) => ({
      number: p.number,
      title: p.title,
      url: p.html_url,
      updatedAt: p.updated_at.slice(0, 10),
      labels: p.labels.map((l) => l.name),
    })),
  };
}

function fetchWorksTodayStatus(worksDoc) {
  const all = [...(worksDoc.projects ?? []), ...(worksDoc.reference ?? [])];
  return all.map((p) => {
    try {
      const r = ghJson(["api", `repos/${p.repo}`]);
      return {
        repo: p.repo,
        oldStars: p.stars,
        stars: r.stargazers_count,
        delta: r.stargazers_count - p.stars,
        archived: r.archived,
        pushedAt: r.pushed_at?.slice(0, 10) ?? null,
      };
    } catch (e) {
      return { repo: p.repo, error: e.message };
    }
  });
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const sinceArg = args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined;

  const ideasDoc = JSON.parse(readFileSync(resolve(root, "ideas/ideas.json"), "utf8"));
  const worksDoc = JSON.parse(readFileSync(resolve(root, "ideas/works-today.json"), "utf8"));
  const sinceDate = sinceArg ?? ideasDoc.as_of;
  const sinceIso = `${sinceDate}T00:00:00Z`;

  const knownNumbers = new Set();
  const primaryNumbers = [];
  for (const idea of ideasDoc.ideas) {
    const p = discNumber(idea.demand?.url);
    if (p) primaryNumbers.push(p);
    for (const s of idea.sources ?? []) {
      const n = discNumber(s.url);
      if (n) knownNumbers.add(n);
    }
  }

  const existingMap = fetchExistingDiscussions(primaryNumbers);
  const existingDeltas = ideasDoc.ideas.map((idea) => {
    const num = discNumber(idea.demand?.url);
    const live = num ? existingMap.get(num) : null;
    if (!live) return { slug: idea.slug, number: num, error: "not-found" };
    const upDelta = live.upvoteCount - idea.demand.upvotes;
    const cmDelta = live.comments.totalCount - (idea.demand.comments ?? 0);
    const pct = idea.demand.upvotes > 0 ? Math.abs(upDelta) / idea.demand.upvotes : upDelta > 0 ? 1 : 0;
    const notable = live.closed || Math.abs(upDelta) >= 5 || (Math.abs(upDelta) >= 3 && pct >= 0.2);
    return {
      slug: idea.slug,
      number: num,
      closed: live.closed,
      stateReason: live.stateReason,
      oldUpvotes: idea.demand.upvotes,
      upvotes: live.upvoteCount,
      upDelta,
      oldComments: idea.demand.comments ?? 0,
      comments: live.comments.totalCount,
      cmDelta,
      asOf: idea.demand.as_of,
      notable,
    };
  });

  const docs = fetchDocsChanges(sinceIso);
  const officialApi = fetchOfficialApiSignals();
  const { scanned, candidates } = fetchRecentCandidates(sinceIso, knownNumbers);
  candidates.sort((a, b) => b.upvotes - a.upvotes || b.comments - a.comments);
  const works = fetchWorksTodayStatus(worksDoc);

  const report = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sinceDate,
    existingCount: ideasDoc.ideas.length,
    existingClosed: existingDeltas.filter((x) => x.closed),
    existingNotable: existingDeltas.filter((x) => x.notable),
    existingAll: existingDeltas,
    docs,
    officialApi,
    scannedDiscussions: scanned,
    candidates,
    worksToday: works,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`# mine-report (${report.generatedAt}, since ${sinceDate})`);
  console.log(`\n## 1. 官方插件 API 信号`);
  console.log(`- docs/user 命中 plugin/extension 文件: ${docs.pluginDocMatches.length ? docs.pluginDocMatches.join(", ") : "无"} (共 ${docs.totalFiles} 份)`);
  console.log(`- PR #34534: ${officialApi.pr34534.state} (updated ${officialApi.pr34534.updatedAt}, labels: ${officialApi.pr34534.labels.join(", ") || "none"})`);
  for (const p of officialApi.openPluginPrs) {
    if (p.number !== 34534) console.log(`- 其他开放插件 PR #${p.number}: ${p.title} (${p.updatedAt}) ${p.url}`);
  }

  console.log(`\n## 2. docs/user 自 ${sinceDate} 起的提交 (${docs.recentCommits.length})`);
  for (const c of docs.recentCommits) console.log(`- ${c.date} ${c.sha} ${c.message}`);

  console.log(`\n## 3. 现有 ${existingDeltas.length} 条想法状态复核`);
  console.log(`- 已关闭: ${report.existingClosed.length}`);
  for (const x of report.existingClosed) console.log(`  - [CLOSED] ${x.slug} (#${x.number}, reason=${x.stateReason})`);
  console.log(`- 需求明显变化 (|Δ|>=5 或 >=20%): ${report.existingNotable.length}`);
  for (const x of report.existingNotable) {
    console.log(`  - ${x.slug} (#${x.number}): upvotes ${x.oldUpvotes}->${x.upvotes} (${x.upDelta >= 0 ? "+" : ""}${x.upDelta}), comments ${x.oldComments}->${x.comments}`);
  }

  console.log(`\n## 4. 新候选讨论 (扫描 ${scanned} 条更新讨论，筛出 ${candidates.length} 条)`);
  for (const c of candidates.slice(0, 20)) {
    console.log(`- #${c.number} [${c.upvotes}↑ ${c.comments}💬${c.keywordHit ? " kw" : ""}] (${c.createdAt}) ${c.title}\n  ${c.url}\n  ${c.snippet}`);
  }

  console.log(`\n## 5. works-today 仓库复核 (${works.length})`);
  for (const w of works) {
    if (w.error) console.log(`- ${w.repo}: ERROR ${w.error}`);
    else console.log(`- ${w.repo}: ${w.oldStars}->${w.stars} (${w.delta >= 0 ? "+" : ""}${w.delta}) archived=${w.archived} pushed=${w.pushedAt}`);
  }
}

// 按真实路径比较：经符号链接调用时 argv[1] 是链接路径，而 import.meta.url 已解析成真实路径。
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
