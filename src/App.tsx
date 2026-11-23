import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ExternalLink,
  Info,
  Languages,
  Layers,
  MessageSquare,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { issuesUrl, newIdeaUrl, repoUrl, votesTimeoutMs } from "./config";
import { applyLanguage, detectLanguage, dictOf, LANGUAGES, pick } from "./i18n";
import type { Dict } from "./i18n/en";
import {
  fetchIssues,
  isBuildableToday,
  matches,
  matchesVoteFilter,
  mergeIssues,
  MOUNT_TYPES,
  netScore,
  readSnapshot,
  readWorksToday,
  sortIdeas,
  VALUES,
  type Idea,
  type MountType,
  type SortMode,
  type Value,
  type VoteFilter,
} from "./ideas";

const snapshot = readSnapshot();
const worksToday = readWorksToday();

type VoteState = "loading" | "live" | "fallback";
type ActiveTab = "ideas" | "works-today";
type MountFilter = "all" | "buildable" | MountType;

function detectInitialTab(): ActiveTab {
  return new URLSearchParams(location.search).get("tab") === "works-today" ? "works-today" : "ideas";
}

function ExtLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("text-primary underline-offset-4 hover:underline", className)}>
      {children}
      <ExternalLink className="ml-1 inline size-3 align-[-1px]" aria-hidden />
    </a>
  );
}

const discussionLabel = (url: string, t: Dict) => {
  const m = /\/discussions\/(\d+)/.exec(url);
  return m ? t.discussion(m[1]) : t.source;
};

const VALUE_STYLE: Record<Value, string> = {
  high: "border-transparent bg-primary/10 text-primary",
  medium: "border-transparent bg-secondary text-secondary-foreground",
  low: "text-muted-foreground",
};

const BUILDABLE_BADGE =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";

const categoryName = (t: Dict, category: string) => t.categories[category] ?? category;

function IdeaCard({ idea, live, lang, t }: { idea: Idea; live: boolean; lang: string; t: Dict }) {
  const [open, setOpen] = useState(false);
  const d = idea.demand;
  const first = idea.sources[0];
  const buildable = isBuildableToday(idea);
  const hasReactions = live && (idea.votes > 0 || idea.downvotes > 0);
  const net = netScore(idea);
  const voteHref = idea.issueUrl ?? issuesUrl;

  return (
    <Card size="sm" className="gap-0 rounded-lg ring-border">
      <CardContent className="flex gap-3 px-3">
        <div className="w-11 shrink-0 pt-0.5 text-center" title={d ? t.upstreamTitle(d.upvotes, d.as_of) : undefined}>
          <div className="text-base leading-none font-semibold tabular-nums">{d ? d.upvotes : "–"}</div>
          <div className="mt-1 text-[10px] leading-none text-muted-foreground">{t.upstream}</div>
          {hasReactions && (
            <div
              title={t.netTitle(idea.votes, idea.downvotes)}
              className={cn(
                "mt-2 text-xs leading-none font-semibold tabular-nums",
                net > 0 ? "text-emerald-600 dark:text-emerald-400" : net < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {net > 0 ? `+${net}` : net}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm leading-snug font-medium [overflow-wrap:anywhere]">{pick(idea, "title", lang)}</h2>
          <p className={cn("mt-1 text-sm text-foreground/80 [overflow-wrap:anywhere]", !open && "line-clamp-2")}>{pick(idea, "problem", lang)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            <Badge variant="outline" className={buildable ? BUILDABLE_BADGE : "text-muted-foreground"}>
              {t.mountShort[idea.mount_today.type]}
            </Badge>
            <Badge variant="outline">{categoryName(t, idea.category)}</Badge>
            {idea.review && (
              <Badge variant="outline" className={VALUE_STYLE[idea.review.value]}>
                {t.valueName[idea.review.value]}
              </Badge>
            )}
            {idea.submitted && <Badge variant="secondary">{t.newBadge}</Badge>}
            <span className="inline-flex items-center overflow-hidden rounded-md border border-border">
              <a
                href={voteHref}
                target="_blank"
                rel="noopener noreferrer"
                title={t.upvoteTitle}
                aria-label={t.upvoteTitle}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 tabular-nums transition-colors hover:bg-muted",
                  live && idea.votes > 0 ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
                )}
              >
                <ThumbsUp className="size-3" aria-hidden />
                {live && idea.votes > 0 && <span>{idea.votes}</span>}
              </a>
              <span className="h-3.5 w-px bg-border" aria-hidden />
              <a
                href={voteHref}
                target="_blank"
                rel="noopener noreferrer"
                title={t.downvoteTitle}
                aria-label={t.downvoteTitle}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 tabular-nums transition-colors hover:bg-muted",
                  live && idea.downvotes > 0 ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                <ThumbsDown className="size-3" aria-hidden />
                {live && idea.downvotes > 0 && <span>{idea.downvotes}</span>}
              </a>
            </span>
            {d?.comments !== undefined && (
              <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                <MessageSquare className="size-3" aria-hidden />
                {d.comments}
              </span>
            )}
            {idea.sources.length > 1 && <span className="text-muted-foreground">{t.sourcesCount(idea.sources.length)}</span>}
            {first && <ExtLink href={first.url}>{discussionLabel(first.url, t)}</ExtLink>}
            <Button variant="ghost" size="xs" className="-ml-1 text-muted-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
              {t.details}
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
            </Button>
          </div>
          {open && (
            <div className="mt-2.5 space-y-2 border-t pt-2.5 text-xs text-muted-foreground">
              {d && <p>{t.demandDetail(d.upvotes, t.basis[d.basis], d.as_of)}</p>}
              {idea.sources.length > 0 && (
                <ul className="space-y-1">
                  {idea.sources.map((s) => (
                    <li key={s.url} className="[overflow-wrap:anywhere]">
                      <ExtLink href={s.url}>{s.title}</ExtLink> <span className="whitespace-nowrap">({s.date})</span>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                <span className="font-medium text-foreground/80">{t.mountLead} </span>
                {t.mount[idea.mount_today.type]}
                {idea.mount_today.note && ` — ${pick(idea.mount_today, "note", lang)}`}
                {idea.mount_today.docs && (
                  <>
                    {" "}
                    <ExtLink href={idea.mount_today.docs}>{t.officialDocs}</ExtLink>
                  </>
                )}
              </p>
              {idea.review && (
                <p>
                  <span className="font-medium text-foreground/80">{t.reviewLead(idea.review.as_of)} </span>
                  {pick(idea.review, "reasons", lang)}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WorksTodayView({ lang, t }: { lang: string; t: Dict }) {
  return (
    <section className="mt-3 space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t.worksTodayIntro(worksToday.as_of)}</p>
      <div className="space-y-2">
        {worksToday.projects.map((p) => (
          <Card key={p.repo} size="sm" className="gap-0 rounded-lg ring-border">
            <CardContent className="flex gap-3 px-3">
              <div className="w-11 shrink-0 pt-0.5 text-center" title={t.worksTodayStars(p.stars, p.stars_as_of)}>
                <div className="flex items-center justify-center gap-0.5 text-sm leading-none font-semibold tabular-nums">
                  <Star className="size-3 text-muted-foreground" aria-hidden />
                  {p.stars}
                </div>
                <div className="mt-1 text-[10px] leading-none text-muted-foreground">{p.license}</div>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm leading-snug font-medium [overflow-wrap:anywhere]">
                  <ExtLink href={p.url}>{p.repo}</ExtLink>
                </h2>
                <p className="mt-1 text-sm text-foreground/80 [overflow-wrap:anywhere]">{pick(p, "summary", lang)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {p.mounts.map((m) => (
                    <Badge key={m} variant="outline" className={BUILDABLE_BADGE}>
                      {t.mount[m]}
                    </Badge>
                  ))}
                  {p.non_affiliation && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t.worksTodayNonAffil}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {worksToday.reference.length > 0 && (
        <div className="pt-2">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t.worksTodayReferenceTitle}</h3>
          <div className="space-y-2">
            {worksToday.reference.map((ref) => (
              <Card key={ref.repo} size="sm" className="gap-0 rounded-lg bg-muted/30 ring-border">
                <CardContent className="px-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <ExtLink href={ref.url} className="font-medium">
                      {ref.repo}
                    </ExtLink>
                    <span className="tabular-nums">{t.worksTodayStars(ref.stars, ref.stars_as_of)}</span>
                    <Badge variant="outline">{ref.license}</Badge>
                  </div>
                  <p className="mt-1 leading-relaxed">{pick(ref, "reason", lang)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t.worksTodayPolicy}</p>
    </section>
  );
}

export function App() {
  const [lang, setLang] = useState(detectLanguage);
  const [tab, setTab] = useState<ActiveTab>(detectInitialTab);
  const [ideas, setIdeas] = useState<Idea[]>(() => mergeIssues(snapshot, []));
  const [vote, setVote] = useState<VoteState>("loading");
  const [category, setCategory] = useState("all");
  const [mountFilter, setMountFilter] = useState<MountFilter>("all");
  const [value, setValue] = useState("all");
  const [voteFilter, setVoteFilter] = useState<VoteFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("upstream");
  const [sortTouched, setSortTouched] = useState(false);
  const [query, setQuery] = useState("");
  const t = dictOf(lang);

  useEffect(() => {
    applyLanguage(lang, false);
    document.title = t.docTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t.docDescription);
  }, [lang, t]);

  useEffect(() => {
    fetchIssues(votesTimeoutMs)
      .then((issues) => {
        const merged = mergeIssues(snapshot, issues);
        setIdeas(merged);
        setVote("live");
        const total = merged.reduce((sum, item) => sum + item.votes + item.downvotes, 0);
        if (total > 0 && !sortTouched) setSortMode("net");
      })
      .catch(() => setVote("fallback"));
  }, [sortTouched]);

  const switchTab = (next: ActiveTab) => {
    setTab(next);
    const url = new URL(location.href);
    if (next === "ideas") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    history.replaceState(history.state, "", url);
  };

  const live = vote === "live";
  const voteTotals = useMemo(
    () => ideas.reduce((acc, i) => ({ up: acc.up + i.votes, down: acc.down + i.downvotes }), { up: 0, down: 0 }),
    [ideas],
  );
  const counts = useMemo(
    () => ({
      all: ideas.length,
      high: ideas.filter((i) => i.review?.value === "high").length,
      buildable: ideas.filter(isBuildableToday).length,
      needsApi: ideas.filter((i) => !isBuildableToday(i)).length,
    }),
    [ideas],
  );

  const voteNote =
    vote === "loading"
      ? t.voteLoading
      : live
        ? voteTotals.up + voteTotals.down > 0
          ? t.voteLive(voteTotals.up, voteTotals.down)
          : t.voteLiveZero
        : t.voteFallback(snapshot.as_of);

  const languageItems = useMemo(() => LANGUAGES.map((l) => ({ value: l.code, label: l.label })), []);
  const categoryItems = useMemo(
    () => [
      { value: "all", label: t.allCategories },
      ...[...new Set(ideas.map((i) => i.category))]
        .map((c) => ({ value: c, label: categoryName(t, c) }))
        .sort((a, b) => a.label.localeCompare(b.label, lang)),
    ],
    [ideas, t, lang],
  );
  const mountItems = useMemo(
    () => [
      { value: "all", label: t.allMounts },
      { value: "buildable", label: t.buildableToday },
      ...MOUNT_TYPES.map((m) => ({ value: m, label: t.mount[m] })),
    ],
    [t],
  );
  const valueItems = useMemo(() => [{ value: "all", label: t.allValues }, ...VALUES.map((v) => ({ value: v, label: t.valueName[v] }))], [t]);
  const voteFilterItems = useMemo(
    () => [
      { value: "all", label: t.voteFilters.all },
      { value: "positive", label: t.voteFilters.positive },
      { value: "liked", label: t.voteFilters.liked },
      { value: "disliked", label: t.voteFilters.disliked },
      { value: "controversial", label: t.voteFilters.controversial },
    ],
    [t],
  );
  const sortItems = useMemo(
    () => [
      { value: "upstream", label: t.sortModes.upstream },
      { value: "net", label: t.sortModes.net },
      { value: "upvotes", label: t.sortModes.upvotes },
      { value: "downvotes", label: t.sortModes.downvotes },
      { value: "value", label: t.sortModes.value },
      { value: "buildable", label: t.sortModes.buildable },
    ],
    [t],
  );

  const shown = useMemo(
    () =>
      sortIdeas(
        ideas.filter((i) => {
          if (category !== "all" && i.category !== category) return false;
          if (value !== "all" && i.review?.value !== value) return false;
          if (mountFilter === "buildable" && !isBuildableToday(i)) return false;
          if (mountFilter !== "all" && mountFilter !== "buildable" && i.mount_today.type !== mountFilter) return false;
          if (!matchesVoteFilter(i, voteFilter)) return false;
          return matches(i, query, categoryName(t, i.category), t.mount[i.mount_today.type]);
        }),
        sortMode,
      ),
    [ideas, category, mountFilter, value, voteFilter, query, sortMode, t],
  );

  const switchLanguage = (code: string | null) => {
    if (code && LANGUAGES.some((l) => l.code === code)) {
      setLang(code);
      applyLanguage(code, true);
    }
  };

  const applyQuickChip = (chip: "all" | "high" | "buildable" | "needs-api") => {
    setCategory("all");
    setVoteFilter("all");
    setQuery("");
    if (chip === "all") {
      setValue("all");
      setMountFilter("all");
    } else if (chip === "high") {
      setValue("high");
      setMountFilter("all");
    } else if (chip === "buildable") {
      setValue("all");
      setMountFilter("buildable");
    } else {
      setValue("all");
      setMountFilter("needs-plugin-api");
    }
  };

  const activeChip =
    category !== "all" || voteFilter !== "all" || query.trim() !== ""
      ? null
      : value === "all" && mountFilter === "all"
        ? "all"
        : value === "high" && mountFilter === "all"
          ? "high"
          : value === "all" && mountFilter === "buildable"
            ? "buildable"
            : value === "all" && mountFilter === "needs-plugin-api"
              ? "needs-api"
              : null;

  const api = snapshot.official_api;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{t.docTitle}</h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <a href={repoUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t.github}
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <a href={newIdeaUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
              <Plus data-icon="inline-start" aria-hidden />
              {t.submit}
            </a>
            <Select items={languageItems} value={lang} onValueChange={switchLanguage}>
              <SelectTrigger className="shrink-0" size="sm" aria-label={t.language}>
                <Languages aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end">
                {languageItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{t.tagline}</p>
        <p className="mt-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">{t.disclaimer}</p>

        {api && (
          <div className="mt-2.5 flex flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    api.status === "available"
                      ? "bg-emerald-500"
                      : api.status === "experimental"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/60",
                  )}
                  aria-hidden
                />
                {t.officialApiLabel}: {t.officialApiStatus[api.status] ?? api.status}
              </span>
              <span className="ml-2 text-muted-foreground">({t.officialApiAsOf(api.as_of)})</span>
              <p className="mt-0.5 text-muted-foreground">{pick(api, "summary", lang)}</p>
            </div>
            <ExtLink href={api.tracking_url} className="shrink-0 font-medium whitespace-nowrap">
              {t.officialApiTrack}
            </ExtLink>
          </div>
        )}
      </header>

      <nav className="mt-4 flex items-center gap-1 border-b" aria-label="View">
        <button
          type="button"
          onClick={() => switchTab("ideas")}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === "ideas" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          {t.tabIdeas}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{ideas.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("works-today")}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === "works-today" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <PackageCheck className="size-3.5" aria-hidden />
          {t.tabWorksToday}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{worksToday.projects.length}</span>
        </button>
      </nav>

      {tab === "works-today" ? (
        <WorksTodayView lang={lang} t={t} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", `${t.chipAll} (${counts.all})`],
                ["buildable", `${t.chipBuildable} (${counts.buildable})`],
                ["high", `${t.chipHighValue} (${counts.high})`],
                ["needs-api", `${t.chipNeedsApi} (${counts.needsApi})`],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="xs"
                variant={activeChip === key ? "default" : "outline"}
                onClick={() => applyQuickChip(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
            <div className="relative sm:col-span-4">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchPlaceholder}
                className="pl-8"
              />
            </div>
            <div className="sm:col-span-3">
              <Select items={mountItems} value={mountFilter} onValueChange={(v) => setMountFilter((v ?? "all") as MountFilter)}>
                <SelectTrigger className="w-full" aria-label={t.mountFilter}>
                  <Layers className="size-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {mountItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Select items={categoryItems} value={category} onValueChange={(v) => setCategory(v ?? "all")}>
                <SelectTrigger className="w-full" aria-label={t.category}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {categoryItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Select items={voteFilterItems} value={voteFilter} onValueChange={(v) => setVoteFilter((v ?? "all") as VoteFilter)}>
                <SelectTrigger className="w-full" aria-label={t.voteFilterLabel}>
                  <ThumbsUp className="size-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {voteFilterItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p role="status" className="flex min-w-0 flex-1 items-start gap-1.5">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{voteNote}</span>
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Select items={valueItems} value={value} onValueChange={(v) => setValue(v ?? "all")}>
                <SelectTrigger size="sm" className="h-7 text-xs" aria-label={t.value}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="end">
                  {valueItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                items={sortItems}
                value={sortMode}
                onValueChange={(v) => {
                  if (v) {
                    setSortMode(v as SortMode);
                    setSortTouched(true);
                  }
                }}
              >
                <SelectTrigger size="sm" className="h-7 text-xs" aria-label={t.sortLabel}>
                  <ArrowUpDown className="size-3 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="end">
                  {sortItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="whitespace-nowrap tabular-nums">
                {shown.length} / {ideas.length}
              </span>
            </div>
          </div>

          <main className="mt-3 space-y-2">
            {shown.length ? (
              shown.map((i) => <IdeaCard key={i.slug} idea={i} live={live} lang={lang} t={t} />)
            ) : (
              <p className="py-6 text-sm text-muted-foreground">{t.empty}</p>
            )}
          </main>
        </>
      )}

      <footer className="mt-8 border-t pt-3 text-xs text-muted-foreground">{t.footer}</footer>
    </div>
  );
}
