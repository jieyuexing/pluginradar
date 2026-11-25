#!/usr/bin/env node
// 让 GitHub issue 与 ideas/ideas.json 一致：按 review.action 关闭 drop 与 merge 的条目（留评论、not planned），
// 把 merge 的来源并入目标并从数据里移除，同步其余条目的正文，缺 issue 的新开。
// 默认 dry-run 只打印；带 --execute --repo OWNER/NAME --model "<模型名>" 才动 GitHub 并改写 ideas.json。
// 用 REST 且每步先查状态，重跑不会重复评论或重复开 issue。改完数据后要 pnpm build && pnpm check 再提交。
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./check.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ideasPath = resolve(root, "ideas/ideas.json");
const LABEL = { name: "idea", color: "1d76db", description: "A plugin idea collected from public discussion" };
const REVIEW_MARK = "value review";

export const marker = (slug) => `<!-- idea:${slug} -->`;
export const noteLine = (model) => `> [!NOTE]\n> Drafted by ${model} in T3 Code; reviewed and posted by @jieyuexing`;
const NOTE_RE = /^> \[!NOTE\]\n> Drafted by .*$/m;

// 正文的小节标题与 .github/ISSUE_TEMPLATE/idea.yml 的字段标签一致，页面按同样的标题解析。
export function issueBody(idea, note) {
  const sources = idea.sources.map((s) => `- [${s.title}](${s.url}) (${s.date})`).join("\n");
  const d = idea.demand;
  return [
    marker(idea.slug),
    note,
    `### Title (中文)\n\n${idea.title_zh}`,
    `### Problem\n\n${idea.problem}`,
    `### Category\n\n${idea.category}`,
    `### Public sources\n\n${sources}`,
    `### Upstream demand\n\n${d.upvotes} upvotes on the ${d.basis} at ${d.url}, read ${d.as_of}. This is the upstream count, not votes on this repository.`,
    `### Mount today\n\n${idea.mount_today.type}`,
    `### Why that mount\n\n${idea.mount_today.note}${idea.mount_today.docs ? `\n\nDocs: ${idea.mount_today.docs}` : ""}`,
    `Vote by adding a 👍 reaction to this issue.`,
  ].join("\n\n");
}

const normalize = (body) => (body ?? "").replace(/\r\n/g, "\n").trim();

// 纯计算：由数据与 GitHub 上现有的 idea issue 算出要做的事，不碰 GitHub、不改入参。
// 返回 closes（按审查关闭）、doc（并入 merge 来源并移除 drop/merge 后的数据）、edits（要同步的正文）、creates（要新开的 issue）。
export function planSync(input, issues, note) {
  const doc = structuredClone(input);
  const issueOf = (slug) => issues.find((i) => !i.pull_request && (i.body ?? "").includes(marker(slug)));
  const bySlug = new Map(doc.ideas.map((i) => [i.slug, i]));
  const closes = [];
  for (const idea of doc.ideas) {
    const action = idea.review.action;
    if (action === "keep") continue;
    const target = action.startsWith("merge-into:") ? bySlug.get(action.slice("merge-into:".length)) : undefined;
    const issue = issueOf(idea.slug);
    const targetIssue = target && issueOf(target.slug);
    const text = target
      ? `Merged into ${targetIssue ? `#${targetIssue.number}` : target.slug} (${target.title}) after the ${idea.review.as_of} ${REVIEW_MARK}; its sources were added there.${targetIssue ? ` Please vote on #${targetIssue.number}.` : ""} Review note: ${idea.review.reasons}`
      : `Closing after the ${idea.review.as_of} ${REVIEW_MARK}: ${idea.review.reasons}`;
    closes.push({ slug: idea.slug, action, issue: issue ? { number: issue.number, state: issue.state } : null, text });
    if (target) {
      const urls = new Set(target.sources.map((s) => s.url));
      for (const s of idea.sources) if (!urls.has(s.url)) target.sources.push(s), urls.add(s.url);
    }
  }
  const removed = new Set(closes.map((c) => c.slug));
  doc.ideas = doc.ideas.filter((i) => !removed.has(i.slug));
  const edits = [];
  const creates = [];
  for (const idea of doc.ideas) {
    const issue = issueOf(idea.slug);
    if (!issue) {
      creates.push({ slug: idea.slug, title: idea.title, body: issueBody(idea, note) });
      continue;
    }
    const kept = normalize(issue.body).match(NOTE_RE)?.[0] ?? note;
    const body = issueBody(idea, kept);
    if (normalize(issue.body) === normalize(body) && issue.title === idea.title) continue;
    edits.push({ slug: idea.slug, number: issue.number, title: idea.title, body });
  }
  return { closes, doc, edits, creates };
}

// 按计划改 GitHub。client 见 ghClient；关闭前先查状态与已有审查评论，重跑不会重复评论或重复开 issue。
export function applyPlan(plan, client, note) {
  for (const c of plan.closes) {
    if (!c.issue || client.issueState(c.issue.number) === "closed") continue;
    if (!client.hasReviewComment(c.issue.number)) client.comment(c.issue.number, `${note}\n\n${c.text}`);
    client.close(c.issue.number);
  }
  client.ensureLabel();
  for (const e of plan.edits) client.edit(e.number, e.title, e.body);
  for (const c of plan.creates) client.create(c.title, c.body);
}

// 经 gh 访问 GitHub 的客户端（REST）。
export function ghClient(repo) {
  const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" });
  const api = (...a) => gh("api", ...a);
  return {
    listIssues: () =>
      JSON.parse(api("--paginate", "--slurp", `repos/${repo}/issues?labels=${LABEL.name}&state=all&per_page=100`))
        .flat()
        .filter((i) => !i.pull_request),
    issueState: (n) => api(`repos/${repo}/issues/${n}`, "--jq", ".state").trim(),
    hasReviewComment: (n) => api(`repos/${repo}/issues/${n}/comments`, "--jq", `[.[] | select(.body | contains("${REVIEW_MARK}"))] | length`).trim() !== "0",
    comment: (n, body) => api("-X", "POST", `repos/${repo}/issues/${n}/comments`, "-f", `body=${body}`),
    close: (n) => api("-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", "state=closed", "-f", "state_reason=not_planned"),
    ensureLabel: () => {
      try {
        gh("label", "create", LABEL.name, "--repo", repo, "--color", LABEL.color, "--description", LABEL.description);
      } catch {
        // 标签已存在
      }
    },
    edit: (n, title, body) => api("-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", `title=${title}`, "-f", `body=${body}`),
    create: (title, body) => gh("issue", "create", "--repo", repo, "--title", title, "--label", LABEL.name, "--body", body),
  };
}

function failOn(errors) {
  if (!errors.length) return;
  errors.forEach((e) => console.error(`FAIL ${e}`));
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const execute = args.includes("--execute");
  const repo = opt("--repo");
  const model = opt("--model");
  if (execute && (!repo || !model)) {
    console.error("--execute 需要 --repo OWNER/NAME 与 --model \"<起草模型名>\"");
    process.exit(1);
  }
  const doc = JSON.parse(readFileSync(ideasPath, "utf8"));
  failOn(validate(doc));
  const note = noteLine(model ?? "<model>");
  const client = repo ? ghClient(repo) : undefined;
  const plan = planSync(doc, client ? client.listIssues() : [], note);
  console.log(execute ? `EXECUTE on ${repo}` : `DRY-RUN${repo ? ` against ${repo}` : "（未给 --repo，只看数据）"}`);
  for (const c of plan.closes) console.log(`close ${c.issue ? `#${c.issue.number} (${c.issue.state})` : "(无 issue)"} ${c.slug} -> ${c.action}`);
  failOn(validate(plan.doc));
  for (const e of plan.edits) console.log(`edit #${e.number} ${e.slug}`);
  for (const c of plan.creates) console.log(`create ${c.slug}`);
  if (execute) {
    applyPlan(plan, client, note);
    if (plan.closes.length) writeFileSync(ideasPath, `${JSON.stringify(plan.doc, null, 2)}\n`);
  }
  console.log(`${execute ? "完成" : "预演"}：关闭 ${plan.closes.length}、改正文 ${plan.edits.length}、新开 ${plan.creates.length}${execute && plan.closes.length ? "；ideas.json 已改，运行 pnpm build && pnpm check 后提交" : ""}`);
}

// 按真实路径比较：经符号链接调用时 argv[1] 是链接路径，而 import.meta.url 已解析成真实路径。
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
