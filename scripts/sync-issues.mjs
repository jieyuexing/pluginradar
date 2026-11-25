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
  const errors = validate(doc);
  if (errors.length) {
    errors.forEach((e) => console.error(`FAIL ${e}`));
    process.exit(1);
  }
  const note = noteLine(model ?? "<model>");
  const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" });
  const api = (...a) => gh("api", ...a);
  const issues = repo
    ? JSON.parse(api("--paginate", "--slurp", `repos/${repo}/issues?labels=${LABEL.name}&state=all&per_page=100`))
        .flat()
        .filter((i) => !i.pull_request)
    : [];
  const issueOf = (slug) => issues.find((i) => (i.body ?? "").includes(marker(slug)));
  console.log(execute ? `EXECUTE on ${repo}` : `DRY-RUN${repo ? ` against ${repo}` : "（未给 --repo，只看数据）"}`);

  // 1. 按审查关闭 drop 与 merge，并把 merge 的来源并入目标。
  const bySlug = new Map(doc.ideas.map((i) => [i.slug, i]));
  const removed = new Set();
  for (const idea of doc.ideas) {
    const action = idea.review.action;
    if (action === "keep") continue;
    const target = action.startsWith("merge-into:") ? bySlug.get(action.slice("merge-into:".length)) : undefined;
    const issue = issueOf(idea.slug);
    const targetIssue = target && issueOf(target.slug);
    const text = target
      ? `Merged into ${targetIssue ? `#${targetIssue.number}` : target.slug} (${target.title}) after the ${idea.review.as_of} ${REVIEW_MARK}; its sources were added there.${targetIssue ? ` Please vote on #${targetIssue.number}.` : ""} Review note: ${idea.review.reasons}`
      : `Closing after the ${idea.review.as_of} ${REVIEW_MARK}: ${idea.review.reasons}`;
    console.log(`close ${issue ? `#${issue.number} (${issue.state})` : "(无 issue)"} ${idea.slug} -> ${action}`);
    if (target) {
      const urls = new Set(target.sources.map((s) => s.url));
      for (const s of idea.sources) if (!urls.has(s.url)) target.sources.push(s), urls.add(s.url);
    }
    removed.add(idea.slug);
    if (!execute || !issue) continue;
    if (api(`repos/${repo}/issues/${issue.number}`, "--jq", ".state").trim() === "closed") continue;
    const commented = api(`repos/${repo}/issues/${issue.number}/comments`, "--jq", `[.[] | select(.body | contains("${REVIEW_MARK}"))] | length`).trim();
    if (commented === "0") api("-X", "POST", `repos/${repo}/issues/${issue.number}/comments`, "-f", `body=${note}\n\n${text}`);
    api("-X", "PATCH", `repos/${repo}/issues/${issue.number}`, "-f", "state=closed", "-f", "state_reason=not_planned");
  }
  doc.ideas = doc.ideas.filter((i) => !removed.has(i.slug));
  const after = validate(doc);
  if (after.length) {
    after.forEach((e) => console.error(`FAIL ${e}`));
    process.exit(1);
  }
  if (execute && removed.size) writeFileSync(ideasPath, `${JSON.stringify(doc, null, 2)}\n`);

  // 2. 同步正文（保留 issue 原有的起草说明），缺的新开。
  if (execute && repo) {
    try {
      gh("label", "create", LABEL.name, "--repo", repo, "--color", LABEL.color, "--description", LABEL.description);
    } catch {
      // 标签已存在
    }
  }
  let edited = 0;
  let created = 0;
  for (const idea of doc.ideas) {
    const issue = issueOf(idea.slug);
    if (!issue) {
      created += 1;
      console.log(`create ${idea.slug}`);
      if (execute) gh("issue", "create", "--repo", repo, "--title", idea.title, "--label", LABEL.name, "--body", issueBody(idea, note));
      continue;
    }
    const kept = normalize(issue.body).match(NOTE_RE)?.[0] ?? note;
    const body = issueBody(idea, kept);
    if (normalize(issue.body) === normalize(body) && issue.title === idea.title) continue;
    edited += 1;
    console.log(`edit #${issue.number} ${idea.slug}`);
    if (execute) api("-X", "PATCH", `repos/${repo}/issues/${issue.number}`, "-f", `title=${idea.title}`, "-f", `body=${body}`);
  }
  console.log(`${execute ? "完成" : "预演"}：关闭 ${removed.size}、改正文 ${edited}、新开 ${created}${execute && removed.size ? "；ideas.json 已改，运行 pnpm build && pnpm check 后提交" : ""}`);
}

// 按真实路径比较：经符号链接调用时 argv[1] 是链接路径，而 import.meta.url 已解析成真实路径。
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
