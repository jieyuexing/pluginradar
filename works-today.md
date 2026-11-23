# Works today, no fork needed

Small community projects that add to T3 Code through an official open entry (Custom CSS or theme file, MCP, Skill) and do not ask you to replace or patch the app. Stars, licenses and statements were read from each repository on **2026-11-23** (GitHub API and README; structured mirror in [ideas/works-today.json](ideas/works-today.json)). Star counts change; this is a dated snapshot, not an endorsement. Nothing here was installed or run for this list, so "works" means what the project's own README claims.

This list is unofficial and not affiliated with T3 Code or its maintainers.

| Project | Mount | Stars (2026-11-23) | License | Non-affiliation statement in README |
| --- | --- | --- | --- | --- |
| [chhoumann/t3-pstack](https://github.com/chhoumann/t3-pstack) | skill, mcp | 306 | MIT (plus MIT notices for imported Cursor skills) | None found on 2026-11-19 |
| [rohit3a/t3-clawd](https://github.com/rohit3a/t3-clawd) | custom-css | 141 | MIT | Yes: "Unofficial. Not affiliated with Anthropic or T3." |
| [josikinzz/t3buddy](https://github.com/josikinzz/t3buddy) | mcp, standalone-page | 4 | MIT | None found on 2026-11-19 |
| [emmsixx/t3code-mcp](https://github.com/emmsixx/t3code-mcp) | mcp | 3 | MIT | Yes: "Not affiliated with or endorsed by T3 Tools Inc. or Clerk." |
| [danschewy/afterglow-theme](https://github.com/danschewy/afterglow-theme) | custom-css | 0 | MIT | None found on 2026-11-19 |

Notes, all from the projects' own READMEs:

- **t3-clawd** is one theme file that uses T3's theme system. It says it uses 19k of a 20k-character CSS limit and was tested on a nightly (`0.1.10-nightly.20261115`); it warns that a T3 update may break parts because it targets internal attributes. The official docs ([appearance.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md)) recommend `data-` attributes for rules that keep working.
- **afterglow-theme** is a theme file imported through Settings → Appearance → Add a theme.
- **t3-pstack** is a Skill set whose subagents and panels go through T3's `t3-code` MCP tools; its README says it works only inside T3.
- **t3code-mcp** is a stdio MCP gateway that discovers your T3 Connect machines and calls each machine's official T3 MCP tools; each machine still needs its own OAuth approval. Its README says the published release predates the gateway and to install from source.
- **t3buddy** is a macOS desktop HUD that reads live thread state from T3's MCP server.

## Listed for reference, outside the mount standard

- [Deepusleepy/t3-tots](https://github.com/Deepusleepy/t3-tots), 217 stars, MIT, says "T3 Tots is unofficial". Its README says `t3ctl` and `t3listen` use T3 Code's internal local websocket API, which is not public or stable, and `t3q.py` reads T3's database read-only, and that it is moving features onto the official MCP server and `t3 thread` command as they gain coverage. Because the internal API is not an official open entry, it does not meet [CONTRIBUTING.md](CONTRIBUTING.md) today.

## Not listed

- [vulonviing/t3-code-addons](https://github.com/vulonviing/t3-code-addons) (1 star, no license detected by GitHub): per the author's own comment in upstream discussion #31472 it works by patching the installed app bundle, and its README has a signing-setup step for the official app. That is the kind of mount this list does not accept; see CONTRIBUTING.md.

Want to add something? Open an issue with the details above (link, mount, license, statement) read from the repository on the day you submit.
