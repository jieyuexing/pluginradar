// scripts/check.mjs 的坏样本表：每种坏数据单独喂给校验器都必须报错，组合起来也必须报错；有效夹具与真实数据必须零报错。
// 契约出处：CONTRIBUTING.md「What gets collected」1–6 条、「Mount today」表下第一段、「Reviewing value」；AGENTS.md 第 2–3 条。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as check from "../scripts/check.mjs";
import { clone, forAll } from "./helpers.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const IDEAS = JSON.parse(read("./fixtures/ideas.valid.json"));
const WORKS = JSON.parse(read("./fixtures/works-today.valid.json"));
const WORKS_MD = read("./fixtures/works-today.valid.md");
const names = await check.loadCategoryNames();

const del = (obj, key) => {
  delete obj[key];
};

// [名称, 改坏方式, 报错里应出现的片段]
const IDEA_BREAKS = [
  ["缺 title_zh", (d) => del(d.ideas[0], "title_zh"), /title_zh/],
  ["缺 problem_zh", (d) => del(d.ideas[1], "problem_zh"), /problem_zh/],
  ["缺 mount_today.note_zh", (d) => del(d.ideas[0].mount_today, "note_zh"), /mount_today\.note_zh/],
  ["缺 review.reasons_zh", (d) => del(d.ideas[0].review, "reasons_zh"), /review\.reasons_zh/],
  ["_zh 只有空白", (d) => (d.ideas[0].title_zh = "  "), /title_zh/],
  ["缺 review", (d) => del(d.ideas[1], "review"), /review/],
  ["review.value 非法", (d) => (d.ideas[0].review.value = "huge"), /review\.value/],
  ["review.as_of 非日期", (d) => (d.ideas[0].review.as_of = "soon"), /review\.as_of/],
  ["review.action 非法", (d) => (d.ideas[0].review.action = "archive"), /review\.action/],
  ["merge-into 目标不存在", (d) => (d.ideas[2].review.action = "merge-into:nope"), /不存在/],
  ["merge-into 指向自己", (d) => (d.ideas[2].review.action = "merge-into:gamma"), /自己/],
  ["merge-into 目标不是 keep", (d) => (d.ideas[0].review.action = "drop"), /keep/],
  ["来源为空", (d) => (d.ideas[0].sources = []), /来源/],
  ["来源不是 https", (d) => (d.ideas[0].sources[0].url = "http://github.com/x"), /sources\[0\]\.url/],
  ["来源不是链接", (d) => (d.ideas[0].sources[0].url = "github.com/x"), /sources\[0\]\.url/],
  ["来源无日期", (d) => del(d.ideas[0].sources[0], "date"), /sources\[0\]\.date/],
  ["来源日期格式错", (d) => (d.ideas[0].sources[0].date = "2026-11-1"), /sources\[0\]\.date/],
  ["来源日期月份不存在", (d) => (d.ideas[0].sources[0].date = "2026-13-01"), /sources\[0\]\.date/],
  ["来源日期当月没有这天", (d) => (d.ideas[0].sources[0].date = "2026-02-30"), /sources\[0\]\.date/],
  ["来源缺标题", (d) => del(d.ideas[0].sources[0], "title"), /sources\[0\]\.title/],
  ["slug 重复", (d) => (d.ideas[1].slug = "alpha"), /重复/],
  ["slug 含大写", (d) => (d.ideas[1].slug = "Beta"), /slug/],
  ["缺分类", (d) => del(d.ideas[0], "category"), /category/],
  ["分类在字典里没有显示名", (d) => (d.ideas[0].category = "made-up"), /字典/],
  ["upvotes 为负", (d) => (d.ideas[0].demand.upvotes = -1), /upvotes/],
  ["upvotes 为小数", (d) => (d.ideas[0].demand.upvotes = 1.5), /upvotes/],
  ["demand.as_of 日期不存在", (d) => (d.ideas[0].demand.as_of = "2026-04-31"), /demand\.as_of/],
  ["demand.basis 非法", (d) => (d.ideas[0].demand.basis = "reaction"), /basis/],
  ["demand.url 非 https", (d) => (d.ideas[0].demand.url = "ftp://x"), /demand\.url/],
  ["mount 类型非法", (d) => (d.ideas[0].mount_today.type = "asar-patch"), /mount_today\.type/],
  ["mount 非 needs-plugin-api 却无依据", (d) => del(d.ideas[1].mount_today, "docs"), /mount_today\.docs/],
  ["mount 依据不是 https", (d) => (d.ideas[1].mount_today.docs = "http://example.com"), /mount_today\.docs/],
  ["status 非法", (d) => (d.ideas[0].status = "done"), /status/],
  ["正文含 @用户名", (d) => (d.ideas[0].problem = "Asked by @someone."), /@/],
  ["ideas 为空", (d) => (d.ideas = []), /非空/],
  ["official_api.status 非法", (d) => (d.official_api.status = "soon"), /official_api\.status/],
  ["official_api.tracking_url 非 https", (d) => (d.official_api.tracking_url = "http://x"), /tracking_url/],
  ["official_api 缺 summary_zh", (d) => del(d.official_api, "summary_zh"), /summary_zh/],
];

const WORKS_BREAKS = [
  ["repo 重复", (w) => (w.projects[1].repo = "example/one"), /重复/],
  ["url 非 https", (w) => (w.projects[0].url = "http://github.com/example/one"), /url/],
  ["mounts 为空", (w) => (w.projects[0].mounts = []), /mounts/],
  ["mounts 含 needs-plugin-api", (w) => (w.projects[0].mounts = ["needs-plugin-api"]), /mounts/],
  ["stars 为负", (w) => (w.projects[0].stars = -3), /stars/],
  ["stars_as_of 日期不存在", (w) => (w.projects[0].stars_as_of = "2026-02-29"), /stars_as_of/],
  ["缺 license", (w) => del(w.projects[0], "license"), /license/],
  ["缺 summary_zh", (w) => del(w.projects[1], "summary_zh"), /summary_zh/],
  ["as_of 非日期", (w) => (w.as_of = "today"), /as_of/],
  ["reference 缺 reason_zh", (w) => del(w.reference[0], "reason_zh"), /reason_zh/],
  ["reference url 非 https", (w) => (w.reference[0].url = "git@github.com:a/b"), /url/],
];

// works-today.md 是 works-today.json 的人读镜像（AGENTS.md：两者同步保持一致）。
const MD_BREAKS = [
  ["表里少一个项目", (md) => md.replace(/^\| \[example\/two\].*\n/m, ""), /example\/two/],
  ["表里多一个项目", (md) => md.replace(/^(\| \[example\/two\].*\n)/m, "$1| [example/three](https://github.com/example/three) | mcp | 1 | MIT | None |\n"), /example\/three/],
  ["星数不一致", (md) => md.replace("| skill, mcp | 30 |", "| skill, mcp | 31 |"), /stars/],
  ["挂载不一致", (md) => md.replace("| skill, mcp |", "| skill |"), /mounts/],
  ["链接不一致", (md) => md.replace("[example/one](https://github.com/example/one)", "[example/one](https://github.com/example/uno)"), /url/],
  ["许可证不一致", (md) => md.replace("| MIT (plus notices) |", "| GPL-3.0 |"), /license/],
  ["表头日期不一致", (md) => md.replace("Stars (2026-11-23)", "Stars (2026-11-19)"), /2026-11-19|日期/],
  ["参考项缺失", (md) => md.replace(/^- \[example\/ref\].*\n/m, ""), /example\/ref/],
  ["参考项星数不一致", (md) => md.replace("17 stars", "18 stars"), /example\/ref/],
];

const ideaErrors = (d) => check.validate(d, names);

test("有效夹具与真实数据零报错", () => {
  assert.deepEqual(ideaErrors(clone(IDEAS)), []);
  assert.deepEqual(check.validateWorksToday(clone(WORKS)), []);
  assert.deepEqual(check.validateWorksTodayMarkdown(WORKS_MD, clone(WORKS)), []);
  const real = JSON.parse(read("../ideas/ideas.json"));
  const realWorks = JSON.parse(read("../ideas/works-today.json"));
  assert.deepEqual(ideaErrors(real), []);
  assert.deepEqual(check.validateWorksToday(realWorks), []);
  assert.deepEqual(check.validateWorksTodayMarkdown(read("../works-today.md"), realWorks), []);
});

for (const [name, breakIt, pattern] of IDEA_BREAKS) {
  test(`ideas 坏样本必须报错：${name}`, () => {
    const d = clone(IDEAS);
    breakIt(d);
    const errors = ideaErrors(d);
    assert.ok(errors.some((e) => pattern.test(e)), `没有拦住，报错为：${JSON.stringify(errors)}`);
  });
}

for (const [name, breakIt, pattern] of WORKS_BREAKS) {
  test(`works-today 坏样本必须报错：${name}`, () => {
    const w = clone(WORKS);
    breakIt(w);
    const errors = check.validateWorksToday(w);
    assert.ok(errors.some((e) => pattern.test(e)), `没有拦住，报错为：${JSON.stringify(errors)}`);
  });
}

for (const [name, breakIt, pattern] of MD_BREAKS) {
  test(`works-today.md 与 json 不一致必须报错：${name}`, () => {
    const md = breakIt(WORKS_MD);
    assert.notEqual(md, WORKS_MD, "改坏方式没生效，夹具变了");
    const errors = check.validateWorksTodayMarkdown(md, clone(WORKS));
    assert.ok(errors.some((e) => pattern.test(e)), `没有拦住，报错为：${JSON.stringify(errors)}`);
  });
}

// 生成式：随机挑 1–4 种改坏方式叠加，校验器不得因为多处同时出错而漏报（至少一条报错）；
// 同时随机打乱合法条目顺序、随机删掉非被引用的条目，合法文档始终零报错（不误报）。
test("生成式：任意坏样本组合都会报错，合法变形都不报错", () => {
  forAll(
    400,
    (r) => ({ breaks: r.shuffle(IDEA_BREAKS.map((_, i) => i)).slice(0, r.int(1, 4)), order: r.shuffle([0, 1, 2]), dropBeta: r.bool() }),
    ({ breaks, order, dropBeta }) => {
      const ok = clone(IDEAS);
      ok.ideas = order.map((i) => ok.ideas[i]).filter((i) => !(dropBeta && i.slug === "beta"));
      assert.deepEqual(ideaErrors(ok), [], "合法变形被误报");
      const bad = clone(IDEAS);
      // 前一种改坏可能已删掉后一种要改的结构（例如 ideas 已清空），这时跳过后者；第一种总能生效。
      for (const i of breaks) {
        try {
          IDEA_BREAKS[i][1](bad);
        } catch {
          // 结构已被前一种改坏方式删掉
        }
      }
      assert.ok(ideaErrors(bad).length > 0, `漏报：${breaks.map((i) => IDEA_BREAKS[i][0]).join(" + ")}`);
    },
  );
});
