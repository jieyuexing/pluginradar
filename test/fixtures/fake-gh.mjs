#!/usr/bin/env node
// 测试用的假 gh：只认 scripts/sync-issues.mjs 用到的几种调用，状态存在 FAKE_GH_STATE 指向的 JSON 文件里，
// 每次写操作追加到 state.calls。不联网。
import { readFileSync, writeFileSync } from "node:fs";

const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(readFileSync(file, "utf8"));
const args = process.argv.slice(2);
const flag = (name) => {
  const out = [];
  args.forEach((a, i) => a === name && out.push(args[i + 1]));
  return out;
};
const fields = Object.fromEntries(flag("-f").map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const issue = (n) => state.issues.find((i) => i.number === Number(n));
const path = args.find((a, i) => i > 0 && /^repos\//.test(a)) ?? "";
let m;

if (args[0] === "label" && args[1] === "create") {
  state.calls.push(["label", args[2]]);
  save();
  if (state.labelExists) {
    process.stderr.write("label already exists\n");
    process.exit(1);
  }
  state.labelExists = true;
  save();
} else if (args[0] === "issue" && args[1] === "create") {
  const number = Math.max(0, ...state.issues.map((i) => i.number)) + 1;
  state.issues.push({ number, title: flag("--title")[0], body: flag("--body")[0], state: "open", labels: [{ name: flag("--label")[0] }], comments: [] });
  state.calls.push(["create", number]);
  save();
  process.stdout.write(`https://github.com/fake/repo/issues/${number}\n`);
} else if (args[0] === "api" && args.includes("--paginate")) {
  const label = /labels=([^&]+)/.exec(path)?.[1];
  const list = state.issues.filter((i) => i.labels.some((l) => l.name === label)).map(({ comments, ...rest }) => rest);
  process.stdout.write(JSON.stringify([list]));
} else if (args[0] === "api" && (m = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(path))) {
  if (args.includes("POST")) {
    issue(m[1]).comments.push(fields.body);
    state.calls.push(["comment", Number(m[1])]);
    save();
  } else process.stdout.write(`${issue(m[1]).comments.filter((c) => c.includes("value review")).length}\n`);
} else if (args[0] === "api" && (m = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path))) {
  const it = issue(m[1]);
  if (args.includes("PATCH")) {
    if (fields.state) it.state = fields.state;
    if (fields.title !== undefined) it.title = fields.title;
    if (fields.body !== undefined) it.body = fields.body;
    state.calls.push([fields.state ? "close" : "edit", it.number]);
    save();
  } else process.stdout.write(`${it.state}\n`);
} else {
  process.stderr.write(`fake gh: 未知调用 ${JSON.stringify(args)}\n`);
  process.exit(2);
}
