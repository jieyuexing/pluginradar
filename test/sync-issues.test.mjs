// scripts/sync-issues.mjs 的决策与幂等：用内存里的假 GitHub 和假 gh 命令，不联网、不碰真实仓库。
// 契约出处：sync-issues.mjs 文件头（“重跑不会重复评论或重复开 issue”）；CONTRIBUTING.md「Reviewing value」（drop、merge-into 由该脚本执行）。
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validate } from "../scripts/check.mjs";
import { applyPlan, issueBody, marker, noteLine, planSync } from "../scripts/sync-issues.mjs";
import { clone, forAll } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const IDEAS = JSON.parse(readFileSync(join(here, "fixtures/ideas.valid.json"), "utf8"));
const NOTE = noteLine("Model A");

// 内存版 GitHub：与 ghClient 同一组方法，记录每次写操作。
function fakeGitHub(issues) {
  const state = { issues: clone(issues), calls: [] };
  const find = (n) => state.issues.find((i) => i.number === n);
  return {
    state,
    listIssues: () => state.issues.map(({ comments, ...rest }) => clone(rest)),
    issueState: (n) => find(n).state,
    hasReviewComment: (n) => find(n).comments.some((c) => c.includes("value review")),
    comment: (n, body) => (find(n).comments.push(body), state.calls.push(["comment", n])),
    close: (n) => ((find(n).state = "closed"), state.calls.push(["close", n])),
    ensureLabel: () => state.calls.push(["label"]),
    edit: (n, title, body) => (Object.assign(find(n), { title, body }), state.calls.push(["edit", n])),
    create: (title, body) => {
      const number = Math.max(0, ...state.issues.map((i) => i.number)) + 1;
      state.issues.push({ number, title, body, state: "open", comments: [] });
      state.calls.push(["create", number]);
    },
  };
}
const writes = (gh) => gh.state.calls.filter(([kind]) => kind !== "label");
const empty = (plan) => plan.closes.every((c) => !c.issue || c.issue.state === "closed") && plan.edits.length === 0 && plan.creates.length === 0;

test("计划：merge 的来源并入目标并移除，过期正文要改，缺 issue 要开，入参不被改动", () => {
  const before = clone(IDEAS);
  const alpha = IDEAS.ideas[0];
  const issues = [
    { number: 1, title: alpha.title, body: issueBody({ ...alpha, demand: { ...alpha.demand, upvotes: 1 } }, noteLine("Old model")), state: "open" },
    { number: 2, title: "Idea gamma", body: issueBody(IDEAS.ideas[2], NOTE), state: "open" },
    { number: 3, title: "PR", body: marker("beta"), state: "open", pull_request: {} },
  ];
  const plan = planSync(IDEAS, issues, NOTE);
  assert.deepEqual(IDEAS, before);
  assert.deepEqual(plan.closes.map((c) => [c.slug, c.issue?.number]), [["gamma", 2]]);
  assert.match(plan.closes[0].text, /Merged into #1 .*Please vote on #1\./);
  assert.deepEqual(plan.doc.ideas.map((i) => i.slug), ["alpha", "beta"]);
  assert.deepEqual(plan.doc.ideas[0].sources.map((s) => s.url), [alpha.sources[0].url, IDEAS.ideas[2].sources[0].url]);
  assert.deepEqual(plan.edits.map((e) => e.number), [1]);
  assert.match(plan.edits[0].body, /Drafted by Old model/, "改正文时保留 issue 原有的起草说明");
  assert.deepEqual(plan.creates.map((c) => c.slug), ["beta"], "PR 不算 issue");
});

// 随机数据：slug 互为前缀（a、a-b），来源 URL 有重叠，审查动作随机（merge 目标都是 keep）。
const SLUGS = ["a", "a-b", "a-b-c", "b", "b-1", "c"];
function genDoc(r) {
  const slugs = r.shuffle(SLUGS).slice(0, r.int(2, SLUGS.length));
  const keep = new Set([slugs[0], ...slugs.filter(() => r.bool(0.6))]);
  const ideas = slugs.map((slug) => {
    const idea = clone(IDEAS.ideas[0]);
    idea.slug = slug;
    idea.title = `Idea ${slug}${r.bool(0.2) ? " (v2)" : ""}`;
    idea.sources = r.shuffle([1, 2, 3, 4, 5]).slice(0, r.int(1, 3)).map((n) => ({ url: `https://github.com/pingdotgg/t3code/discussions/${n}`, title: `D${n}`, date: "2026-11-01" }));
    idea.demand.upvotes = r.int(0, 40);
    if (!keep.has(slug)) idea.review.action = r.bool() ? "drop" : `merge-into:${r.pick([...keep])}`;
    return idea;
  });
  return { ...clone(IDEAS), ideas };
}
// 每条想法在 GitHub 上的初始样子：没有、已是最新、正文过期、标题过期、CRLF 换行、已关闭、已有审查评论。
function genIssues(r, doc) {
  const issues = [];
  for (const idea of doc.ideas) {
    const kind = r.pick(["none", "fresh", "stale", "title", "crlf", "closed", "commented"]);
    if (kind === "none") continue;
    const note = noteLine(r.pick(["Model A", "Model B"]));
    let body = issueBody(idea, note);
    if (kind === "stale") body = issueBody({ ...idea, demand: { ...idea.demand, upvotes: idea.demand.upvotes + 1 } }, note);
    if (kind === "crlf") body = `${body.replace(/\n/g, "\r\n")}\r\n`;
    issues.push({
      number: issues.length + 1,
      title: kind === "title" ? `[idea] ${idea.title}` : idea.title,
      body,
      state: kind === "closed" ? "closed" : "open",
      comments: kind === "commented" ? ["Closing after the value review: earlier run"] : [],
    });
  }
  return issues;
}

test("生成式：执行一次后再算计划为空；中途失败后用原数据重跑也不会重复评论或重复开 issue", () => {
  forAll(
    300,
    (r) => {
      const doc = genDoc(r);
      return { doc, issues: genIssues(r, doc) };
    },
    ({ doc, issues }) => {
      assert.deepEqual(validate(doc), [], "生成的数据本身应合法");
      const gh = fakeGitHub(issues);
      const plan = planSync(doc, gh.listIssues(), NOTE);
      assert.deepEqual(validate(plan.doc), [], "计划后的数据仍合法");
      assert.ok(plan.doc.ideas.every((i) => i.review.action === "keep"));
      applyPlan(plan, gh, NOTE);
      // 每条保留的想法恰好有一个带标记的 issue，正文与数据一致。
      for (const idea of plan.doc.ideas) {
        const own = gh.state.issues.filter((i) => i.body.includes(marker(idea.slug)));
        assert.equal(own.length, 1, `${idea.slug} 应恰好一个 issue`);
        assert.ok(own[0].body.includes(`${idea.demand.upvotes} upvotes`));
      }
      // 被关闭的 issue 恰好一条审查评论。
      for (const c of plan.closes.filter((x) => x.issue)) {
        const it = gh.state.issues.find((i) => i.number === c.issue.number);
        assert.equal(it.state, "closed");
        if (c.issue.state === "open") assert.equal(it.comments.filter((x) => x.includes("value review")).length, 1);
      }
      const again = planSync(plan.doc, gh.listIssues(), NOTE);
      assert.ok(empty(again) && again.closes.length === 0, `第二次仍有动作：${JSON.stringify({ edits: again.edits.map((e) => e.slug), creates: again.creates.map((c) => c.slug) })}`);
      // 模拟 ideas.json 还没写回就中断：用原数据重跑，GitHub 上不应再有任何写操作。
      const done = writes(gh).length;
      applyPlan(planSync(doc, gh.listIssues(), NOTE), gh, NOTE);
      assert.equal(writes(gh).length, done, `重跑多出写操作：${JSON.stringify(writes(gh).slice(done))}`);
    },
  );
});

// 已经一致的 issue（不论起草说明来自哪个模型、换行是 LF 还是 GitHub 表单常见的 CRLF）不应被改写。
test("生成式：数据与 issue 已一致时计划为空，不做多余的改写", () => {
  forAll(
    200,
    (r) => {
      const doc = genDoc(r);
      for (const idea of doc.ideas) idea.review.action = "keep";
      const issues = doc.ideas.map((idea, i) => {
        const body = issueBody(idea, noteLine(r.pick(["Model A", "Model B"])));
        return { number: i + 1, title: idea.title, body: r.bool() ? `${body.replace(/\n/g, "\r\n")}\r\n` : body, state: r.pick(["open", "closed"]) };
      });
      return { doc, issues };
    },
    ({ doc, issues }) => {
      const plan = planSync(doc, issues, NOTE);
      assert.deepEqual([plan.closes, plan.edits, plan.creates], [[], [], []]);
    },
  );
});

// 命令行端到端：把脚本与数据拷到临时目录，PATH 里放假 gh，确认干跑不写、执行后数据与 GitHub 一致、第二次执行无写操作。
test("命令行：干跑不写 GitHub，执行一次后再执行没有写操作", () => {
  const dir = mkdtempSync(join(tmpdir(), "pluginradar-sync-"));
  try {
    const repo = join(here, "..");
    for (const p of ["scripts/sync-issues.mjs", "scripts/check.mjs", "src/i18n/languages.json"]) cpSync(join(repo, p), join(dir, p), { recursive: true });
    mkdirSync(join(dir, "ideas"));
    writeFileSync(join(dir, "ideas/ideas.json"), JSON.stringify(IDEAS, null, 2));
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/gh"), `#!/bin/sh\nexec "${process.execPath}" "${join(here, "fixtures/fake-gh.mjs")}" "$@"\n`);
    chmodSync(join(dir, "bin/gh"), 0o755);
    const stateFile = join(dir, "gh-state.json");
    const alpha = IDEAS.ideas[0];
    writeFileSync(
      stateFile,
      JSON.stringify({
        labelExists: true,
        calls: [],
        issues: [
          { number: 7, title: alpha.title, body: `${marker("alpha")}\nstale`, state: "open", labels: [{ name: "idea" }], comments: [] },
          { number: 8, title: "Idea gamma", body: issueBody(IDEAS.ideas[2], NOTE), state: "open", labels: [{ name: "idea" }], comments: [] },
        ],
      }),
    );
    // PATH 只含假 gh 所在目录、不带 GitHub 令牌：假 gh 缺失时直接找不到 gh，绝不会落到真 gh 上。
    const env = { HOME: dir, PATH: join(dir, "bin"), FAKE_GH_STATE: stateFile };
    const run = (...args) => spawnSync(process.execPath, [join(dir, "scripts/sync-issues.mjs"), ...args], { env, encoding: "utf8" });
    const calls = () => JSON.parse(readFileSync(stateFile, "utf8")).calls;

    assert.equal(run("--execute", "--repo", "fake/repo").status, 1, "--execute 缺 --model 必须拒绝");
    const dry = run("--repo", "fake/repo");
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /预演：关闭 1、改正文 1、新开 1/);
    assert.deepEqual(calls(), [], "干跑不得写 GitHub");
    assert.equal(readFileSync(join(dir, "ideas/ideas.json"), "utf8"), JSON.stringify(IDEAS, null, 2), "干跑不得改数据");

    const first = run("--execute", "--repo", "fake/repo", "--model", "Model A");
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(calls().map(([k]) => k).sort(), ["close", "comment", "create", "edit", "label"]);
    const after = JSON.parse(readFileSync(join(dir, "ideas/ideas.json"), "utf8"));
    assert.deepEqual(after.ideas.map((i) => i.slug), ["alpha", "beta"]);

    const n = calls().length;
    const second = run("--execute", "--repo", "fake/repo", "--model", "Model B");
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /完成：关闭 0、改正文 0、新开 0/);
    assert.deepEqual(calls().slice(n).filter(([k]) => k !== "label"), [], "第二次执行不得再写 GitHub");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
