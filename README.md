# Awesome T3 Code Plugin Ideas

**This is an unofficial community project. It is not affiliated with, endorsed by or sponsored by T3 Code or its maintainers.** "T3 Code" is named only to say what these ideas are for. No official logo or download link is used here.

A community radar for T3 Code extensions: zero-fork add-ons that work today ([works-today.md](works-today.md) and the **Works today** tab), an official plugin API status strip, and plugin ideas collected from public T3 Code discussions. If an official plugin API ever arrives, the high-demand ideas can be found quickly and built first; until then, each idea highlights which official open entry (Custom CSS, MCP, a Skill, a standalone page) can carry a minimal version today.

## What is collected

- **Works today ([ideas/works-today.json](ideas/works-today.json) / [works-today.md](works-today.md)):** small projects that already work through official open entries without a fork.
- **Plugin ideas ([ideas/ideas.json](ideas/ideas.json)):** requests someone already described in public, each with its public source link and date, bilingual problem statement, category, upstream demand (with read date), `mount_today` value with reasoning, and a short value review (`high`, `medium` or `low`). Nothing is invented and nothing comes from private messages or email.
- **Official plugin API status (`official_api` in `ideas/ideas.json`):** dated status of whether upstream `docs/user` documents a plugin API yet.

Rules are in [CONTRIBUTING.md](CONTRIBUTING.md): official open entries only, no ASAR injection or app patching.

## Language

The page has a language switch at the top right (English and Simplified Chinese). It starts from `?lang=`, then the last choice stored in your browser, and otherwise shows English. Adding a language is described in [CONTRIBUTING.md](CONTRIBUTING.md).

## How to vote

Every idea is one GitHub issue labelled `idea`. Add a 👍 reaction to the issue you want. The static page ([docs/index.html](docs/index.html), built from `src/`) reads those reactions with one GitHub API request when you open it and sorts by them. If the request fails, it falls back to the upstream upvotes stored in `ideas.json` and says so.

## How to submit

Open an issue with the "Plugin idea" form ([.github/ISSUE_TEMPLATE/idea.yml](.github/ISSUE_TEMPLATE/idea.yml)). You need a public https source with its date. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Maintaining

```sh
pnpm install                           # once
pnpm build                             # rebuild docs/index.html from src/, ideas/ideas.json and ideas/works-today.json
pnpm check                             # type check, validate data files, confirm page snapshots match them
node scripts/mine-report.mjs           # read-only upstream diff (counts, docs/user commits, candidates, works-today)
node scripts/sync-issues.mjs --repo OWNER/NAME   # dry run: what would be closed, edited or created
node scripts/sync-issues.mjs --execute --repo OWNER/NAME --model "MODEL"   # close reviewed drop/merge ideas, sync bodies, open missing issues (needs gh)
```

`pnpm check` loads the TypeScript dictionaries in `src/i18n` directly with Node, so it needs Node 22.18 or newer (type stripping is on by default from that version, per the Node documentation).

The page is a React + Tailwind CSS + shadcn/ui app in `src/`, built by `scripts/build.mjs` into one self-contained `docs/index.html` (CSS and JS inlined, no CDN or web fonts). The built file is committed because GitHub Pages publishes it directly. The repository owner and name used by the page are set in one place, `src/config.ts`. The seed script takes the repository from `--repo`.

## License

The list content (`ideas/`, `works-today.md`, docs) is dedicated to the public domain under [CC0-1.0](LICENSE). The scripts in `scripts/`, the app in `src/` and the built `docs/index.html` are covered by the same CC0-1.0 dedication. Linked projects keep their own licenses.

---

# 中文说明

**这是非官方社区项目，与 T3 Code 官方及其维护者无隶属关系，也未获其认可或赞助。** 文中提到“T3 Code”只是说明这些想法是为谁做的；这里不使用官方 logo，也不放官方下载链接。

这是一份围绕 T3 Code 扩展生态的非官方社区雷达：既收录无需 fork 今日就能用的小件（[works-today.md](works-today.md) 与页面「今日可用」标签页）与官方插件 API 现状，也汇总来自公开讨论的插件想法。日后如果官方开放插件 API，可以按需求热度快速定位高价值的想法先做；在此之前，每条想法都标明现在能走哪个官方开放入口（Custom CSS、MCP、Skill、独立网页）先做一个最小版本。

## 收什么

- **今日可用（[ideas/works-today.json](ideas/works-today.json) / [works-today.md](works-today.md)）：** 经官方开放入口即可使用、不需要 fork 的社区小件。
- **插件想法（[ideas/ideas.json](ideas/ideas.json)）：** 别人已经在公开场合提过的想法，每条附公开来源链接与日期、中英双语问题陈述、分类、上游需求（含取数日期）、`mount_today` 入口与理由，以及简短的价值审查；不编造，不来自私信或邮件。
- **官方插件 API 现状（`official_api`）：** 带日期核对上游 `docs/user` 是否已出现官方插件 API。

收录标准见 [CONTRIBUTING.md](CONTRIBUTING.md)：只收官方开放入口，不收 ASAR 注入或改应用包。

## 语言

页面右上角可以切换语言（English 与简体中文）。默认先看网址里的 `?lang=`，再看浏览器里保存的上次选择，都没有就显示英文。新增语言的做法见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 怎么投票

每个想法是一条带 `idea` 标签的 GitHub issue，给想要的 issue 点 👍。静态页 [docs/index.html](docs/index.html) 打开时用一次 GitHub API 请求读这些 👍 并排序；请求失败时回落为 `ideas.json` 里记录的上游 upvote 并显示说明。

## 怎么提交

用“Plugin idea”表单开 issue（[.github/ISSUE_TEMPLATE/idea.yml](.github/ISSUE_TEMPLATE/idea.yml)），需要一个带日期的公开 https 来源。先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

列表内容（`ideas/`、`works-today.md`、文档）以 [CC0-1.0](LICENSE) 释放到公有领域；`scripts/` 与 `docs/index.html` 的代码同样适用 CC0-1.0。被链接的项目保留各自的许可证。
