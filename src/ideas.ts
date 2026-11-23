import { CONFIG } from "./config";

export type MountType = "custom-css" | "mcp" | "skill" | "standalone-page" | "needs-plugin-api";
export type OpenMountType = Exclude<MountType, "needs-plugin-api">;

export type Value = "high" | "medium" | "low";
export const VALUES: Value[] = ["high", "medium", "low"];

export type SortMode = "upstream" | "value" | "votes" | "buildable";

export interface OfficialApi {
  status: "not-available" | "experimental" | "available";
  as_of: string;
  tracking_url: string;
  summary: string;
  summary_zh?: string;
}

export interface Review {
  value: Value;
  reasons: string;
  reasons_zh?: string;
  as_of: string;
  action: string;
}

// 带 _zh 等后缀的字段是其他语言的版本，用户从 issue 提交的想法没有，页面回落英文。
export interface Idea {
  slug: string;
  title: string;
  title_zh?: string;
  problem: string;
  problem_zh?: string;
  category: string;
  sources: { url: string; title: string; date: string }[];
  demand: { basis: "discussion" | "comment"; upvotes: number; comments?: number; url: string; as_of: string } | null;
  mount_today: { type: MountType; note: string; note_zh?: string; docs?: string };
  review?: Review;
  status: string;
  votes: number;
  issueUrl: string | null;
  submitted: boolean;
}

export interface Snapshot {
  as_of: string;
  official_api?: OfficialApi;
  ideas: Omit<Idea, "votes" | "issueUrl" | "submitted">[];
}

export interface WorksTodayProject {
  repo: string;
  url: string;
  mounts: OpenMountType[];
  stars: number;
  stars_as_of: string;
  license: string;
  non_affiliation: string | null;
  summary: string;
  summary_zh?: string;
}

export interface WorksTodayReference {
  repo: string;
  url: string;
  stars: number;
  stars_as_of: string;
  license: string;
  reason: string;
  reason_zh?: string;
}

export interface WorksTodaySnapshot {
  as_of: string;
  projects: WorksTodayProject[];
  reference: WorksTodayReference[];
}

interface Issue {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  pull_request?: unknown;
  reactions?: { "+1"?: number };
}

export const MOUNT_TYPES: MountType[] = ["custom-css", "mcp", "skill", "standalone-page", "needs-plugin-api"];

export const isBuildableToday = (idea: Pick<Idea, "mount_today">): boolean => idea.mount_today.type !== "needs-plugin-api";

export function readSnapshot(): Snapshot {
  return JSON.parse(document.getElementById("ideas-data")!.textContent!);
}

export function readWorksToday(): WorksTodaySnapshot {
  const el = document.getElementById("works-today-data");
  return el ? JSON.parse(el.textContent!) : { as_of: "", projects: [], reference: [] };
}

// issue 正文按 .github/ISSUE_TEMPLATE/idea.yml 的字段标题分节。
function sectionsOf(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.replace(/\r\n/g, "\n").split(/^### /m).slice(1)) {
    const nl = part.indexOf("\n");
    const value = part.slice(nl < 0 ? part.length : nl + 1).trim();
    out[part.slice(0, nl < 0 ? part.length : nl).trim()] = value === "_No response_" ? "" : value;
  }
  return out;
}

// 把 API 返回的 issue 并入快照：<!-- idea:slug --> 标记对应已有想法，没有标记的当作用户新提交的。
export function mergeIssues(snapshot: Snapshot, issues: Issue[]): Idea[] {
  const bySlug = new Map<string, Idea>(snapshot.ideas.map((i) => [i.slug, { ...i, votes: 0, issueUrl: null, submitted: false }]));
  const extra: Idea[] = [];
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const votes = issue.reactions?.["+1"] ?? 0;
    const slug = /<!-- idea:([a-z0-9-]+) -->/.exec(issue.body ?? "")?.[1];
    const known = slug ? bySlug.get(slug) : undefined;
    if (known) {
      known.votes = votes;
      known.issueUrl = issue.html_url;
      continue;
    }
    const s = sectionsOf(issue.body ?? "");
    const mount = s["Mount today"] as MountType;
    extra.push({
      slug: `issue-${issue.number}`,
      title: issue.title.replace(/^\[idea\]\s*/i, ""),
      title_zh: s["Title (中文)"] || undefined,
      problem: s["Problem"] ?? "",
      category: s["Category"] || "other",
      sources: [],
      demand: null,
      mount_today: { type: MOUNT_TYPES.includes(mount) ? mount : "needs-plugin-api", note: s["Why that mount"] ?? "" },
      status: "open",
      votes,
      issueUrl: issue.html_url,
      submitted: true,
    });
  }
  return [...bySlug.values(), ...extra];
}

export async function fetchIssues(timeoutMs: number): Promise<Issue[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues?labels=${CONFIG.label}&state=open&per_page=100`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const VALUE_RANK: Record<Value, number> = { high: 3, medium: 2, low: 1 };

export function sortIdeas(list: Idea[], mode: SortMode): Idea[] {
  const up = (i: Idea) => i.demand?.upvotes ?? -1;
  const cm = (i: Idea) => i.demand?.comments ?? 0;
  const vr = (i: Idea) => (i.review ? VALUE_RANK[i.review.value] : 0);
  const bt = (i: Idea) => (isBuildableToday(i) ? 1 : 0);
  return [...list].sort((a, b) => {
    if (mode === "votes") return b.votes - a.votes || up(b) - up(a) || cm(b) - cm(a);
    if (mode === "value") return vr(b) - vr(a) || b.votes - a.votes || up(b) - up(a) || cm(b) - cm(a);
    if (mode === "buildable") return bt(b) - bt(a) || vr(b) - vr(a) || up(b) - up(a);
    return up(b) - up(a) || cm(b) - cm(a) || a.title.localeCompare(b.title);
  });
}

// 搜索同时匹配各语言的标题、问题描述、分类与当前挂载方式。
export function matches(i: Idea, query: string, categoryName: string, mountName: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [i.title, i.title_zh, i.problem, i.problem_zh, i.category, categoryName, i.mount_today.type, mountName].some((t) =>
    t?.toLowerCase().includes(q),
  );
}
