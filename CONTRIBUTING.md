# Contributing

This is an unofficial community list, not affiliated with T3 Code or its maintainers. It exists so that, if an official plugin API arrives, the ideas people already asked for can be found quickly and ranked by demand.

## What gets collected

An idea is a request or use case that someone already described in **public**, for example in an upstream discussion or a public repository. Each entry needs:

1. **At least one public https source with its date.** Quote or summarize it faithfully. Do not paste private messages, emails, chat logs, company material or anything you were not free to share.
2. **A restrained problem statement** of one or two sentences. If the demand comes from a single post, say so; do not write "many users want".
3. **Demand with a date.** The upvote count of the source discussion or comment, and the day you read it. Counts are not added across sources.
4. **A mount today**, one of the values below, with one sentence saying why.
5. **Both languages.** The page is bilingual (English and Simplified Chinese). Every idea needs `title_zh`, `problem_zh` and `mount_today.note_zh` next to the English fields, in plain, short wording without marketing words. Source titles keep the upstream wording and are not translated.
6. **A value review**, the `review` object described under "Reviewing value" below.

Before posting, search the issues, and check whether T3 Code already ships it. On 2026-11-19 the upstream user docs on `main` describe scheduled tasks ([project-settings.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/project-settings.md)), thread snooze ([thread-sidebar.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md)), math rendering ([appearance.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md)), usage limits on the thread details card ([usage.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/usage.md)) and a suggested next prompt in Labs ([composer.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md)), so related requests are not collected as open ideas. A request whose upstream discussion was closed is not collected unless you can say why.

## Mount today: official open entries only

`mount_today.type` says which official entry could carry a minimal version **now**. It is a factual claim, so every value other than `needs-plugin-api` must rest on a sentence in the official docs or on a verified existing project; otherwise use `needs-plugin-api`, or say "untested".

| Value | Official entry | Docs |
| --- | --- | --- |
| `custom-css` | A theme's Custom CSS, applied after T3's own styles; no `@import`, `image-set()` or external `url()` | [appearance.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md) |
| `mcp` | An MCP server you add to a provider, or T3's own MCP server used by an outside agent or companion app | [outside-agents.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md), [composer.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md), [html-renders.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/html-renders.md) (MCP apps) |
| `skill` | A Skill the provider loads, listed in the `$` picker | [composer.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md) |
| `standalone-page` | A separate web page or app that connects through MCP or the `t3` command line | [outside-agents.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md) |
| `needs-plugin-api` | None of the above can carry it today | none |

Not accepted as a mount: injecting into or editing the app's ASAR package, patching the installed app, or changing its hashes or signature. T3 Code is open source (MIT) and already has Custom CSS, so a supported route exists; patches break on each nightly update, and a modified app sends the maintainers bug reports they cannot reproduce. Projects that work this way are not listed, though an idea they illustrate can be.

## How to submit

- **A new idea:** open an issue with the "Plugin idea" form. A maintainer may edit it or close it with a reason when it lacks a public source or breaks the rules above.
- **A change to the seed list:** edit `ideas/ideas.json`, then run `pnpm build` and `pnpm check`. The check validates required fields in every registered language, https sources, dates that exist on the calendar, unique slugs, mount values (every value other than `needs-plugin-api` needs a `mount_today.docs` link), category names, the `review` object (including that a `merge-into:` target exists and is itself `keep`), that no text contains an `@username` (GitHub would notify that person) and that `works-today.md` mirrors `ideas/works-today.json`; it also confirms the snapshot inside the built `docs/index.html` equals `ideas.json`, and rebuilds the page in memory to confirm the committed `docs/index.html` is byte-for-byte the current build.
- **A new interface language:** add a row to `src/i18n/languages.json` (code, label, `htmlLang`, data-field suffix, language match), add a dictionary `src/i18n/<code>.ts` typed as `Dict` and register it in `src/i18n/index.ts`, then add the suffixed fields (for example `problem_fr`) to every idea. `pnpm check` lists what is missing.
- **A project for [works-today.md](works-today.md):** it must use an official open entry, be usable without replacing the app, and have its license and any non-affiliation statement read from the repository on the day you submit.

## Please don't

- Post this list into upstream discussions or ping upstream maintainers about it; upstream's own contribution rules discourage repeated pings.
- Use T3 Code's logo, download links or wording that suggests the list is official.

## Mining upstream discussions

Ideas are curated in periodic review rounds. Run `node scripts/mine-report.mjs` first for a read-only diff of existing discussion counts, recent `docs/user/` commits, official plugin API signals, new candidate discussions, and `works-today` repository status.

1. **Where to look.** The Ideas category of [pingdotgg/t3code discussions](https://github.com/pingdotgg/t3code/discussions) (the repository also has a small Q&A category). `scripts/mine-report.mjs` queries GraphQL (`repository(owner: "pingdotgg", name: "t3code") { discussions(...) }`) and filters out discussions already listed in `ideas.json`.
2. **How to rank.** Keep open discussions only (`closed: false`) and rank by `upvoteCount`, adding `comments.totalCount` as a lesser signal. Read the full body of every candidate before writing it down or attaching it to an existing entry.
3. **What qualifies.** Something a third party could build if an extension surface existed: a UI widget or panel, an integration with another tool or service, a provider or backend, a workflow enhancement around threads, pull requests or usage. Two posts that ask for the same thing become one entry with both sources; the demand number comes from the first source and is never summed.
4. **Anti-duplicate & substance gate.**
   - **New ideas:** Prefer strong signal (e.g. ≥ 8 upvotes, a working prototype, or multiple independent posts) over single-post low-upvote chatter. Cap each review round to at most 3 high-signal ideas (0 is fine).
   - **Appending sources to existing entries:** Only add a new discussion to an existing idea's `sources` when it brings **substantive new value** — a distinct use case, a concrete design / RFC, or a runnable prototype. Pure "+1 / please add plugins instead of forks" duplicate discussions with no new substance are skipped.
5. **What does not.** Core product features and settings, bugs, performance, mobile-only changes, and requests that are only about how upstream should structure its own code. Requests for one more built-in entry in a fixed list (a named model provider, a speech endpoint, a source-control host) are skipped unless the post asks for an interface that others can fill. Also skip anything the upstream user docs already describe: read `docs/user/` on `main` (checking every file touched since the last round), and anything already in `ideas.json` or in the open issues of this repository.
6. **Record it.** Add the entry to `ideas/ideas.json` with the discussion date as the source date, the upvote and comment counts as read, and `demand.as_of` set to the day you read them; say "Single source." in the problem when it rests on one post. Fill the Chinese fields and the `review` object. Write the author's handle without `@` or leave it out. Keep `official_api` in `ideas/ideas.json` and `ideas/works-today.json` (mirrored in `works-today.md`) up to date. Then `pnpm build && pnpm check`.
7. **Refresh.** On later rounds, re-read the counts of existing entries via `scripts/mine-report.mjs`, update `demand.as_of` when counts change materially (e.g. `|Δ| ≥ 5` or `≥ 20%`), and set `status` to `shipped-upstream` when the docs now describe the feature.
8. **Review.** Re-run the value review below over every entry, new and old, and write the result into `review`. Do not open, close, edit or comment on issues from a review; `drop` and `merge-into:` are proposals applied separately via `scripts/sync-issues.mjs`.

## Reviewing value

Each entry carries `review: { value, reasons, reasons_zh, as_of, action }`.

- `value` is `high`, `medium` or `low`. It weighs five things: how strong the upstream demand is (upvotes, comments, number of independent sources, whether it is a single post), whether a plugin is the right shape rather than a core feature, whether upstream docs or the discussion state now cover it, whether it duplicates another entry, and what an ordinary user gains from it. A rough guide used so far: `high` is 20 or more upvotes or several independent sources, and a plugin-shaped need with a clear gain; `low` is a single small post, a narrow audience or a request that fits core better. The page shows `value` as a small badge and can filter by it; the default order stays upvotes.
- `reasons` is one or two sentences with the numbers read that day; a sentence that is a judgment rather than a finding says "Inference". `reasons_zh` says the same in Chinese.
- `action` is `keep`, `drop` (shipped upstream, closed, or not worth keeping) or `merge-into:<slug>` (a duplicate or a part of another entry; the target must be `keep`).

The review is advice, not a decision. The page shows `value` and `reasons`, not `action`.

The first round (2026-11-19) listed the titles and counts of all 3,918 discussions (3,159 open), read the bodies of about thirty candidates, and added the entries whose sources are listed in `ideas.json`. Titles that were not read in full were not judged.

The second round (2026-11-19, later the same day) listed 3,919 discussions (3,160 open: 3,134 in Ideas and 26 in Q&A), ranked the open Ideas discussions that were not yet sources by twice the upvotes plus the comments, ran the keyword pass over the rest and opened the bodies of about 40 candidates. It added 5 entries (shared MCP servers, a Telegram channel, more secret providers, thread status sections and agent pipelines) and 15 sources to 12 existing entries. Titles that were not read in full were not judged, and candidates that were read and skipped as core features include browser extensions in the preview browser, a Jujutsu driver, slash commands and per-project MCP settings, and others were already documented (the Issues page, the background image, the Welcome page import, `runOnSettle` for worktree threads). The round also refreshed the counts and status of all 33 earlier entries; every source discussion was still open, and `external-session-import` is marked `shipped-upstream` because the Welcome page now imports Claude, Codex and Pi conversations.
