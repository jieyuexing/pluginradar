// 仓库 owner、名字和标签只在这里配置；改名只改这一处。
export const CONFIG = { owner: "jieyuexing", repo: "pluginradar", label: "idea" } as const;

export const repoUrl = `https://github.com/${CONFIG.owner}/${CONFIG.repo}`;
export const issuesUrl = `${repoUrl}/issues?q=${encodeURIComponent(`is:issue is:open label:${CONFIG.label}`)}`;
export const newIdeaUrl = `${repoUrl}/issues/new?template=idea.yml`;
export const votesTimeoutMs = 8000;
