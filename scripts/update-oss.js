#!/usr/bin/env node
/**
 * Refreshes the open-source highlights block in the profile README.
 *
 * Rewrites everything between the `<!-- OSS:START -->` and `<!-- OSS:END -->`
 * markers with the most recent public PRs and issues authored by the user.
 */

const fs = require("node:fs");
const path = require("node:path");

const USER = process.env.GITHUB_USER || "shaheeranser";
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_ITEMS = 5;

const START = "<!-- OSS:START -->";
const END = "<!-- OSS:END -->";
const API = "https://api.github.com";

function requestHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${USER}-profile-readme`,
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  return headers;
}

async function searchIssues(query) {
  const url =
    `${API}/search/issues?q=${encodeURIComponent(query)}` +
    "&sort=created&order=desc&per_page=30";

  const res = await fetch(url, { headers: requestHeaders() });
  if (!res.ok) {
    throw new Error(`Search API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  return body.items || [];
}

function statusFor(item) {
  const isPullRequest = Boolean(item.pull_request);
  if (isPullRequest) {
    if (item.pull_request.merged_at) return { emoji: "🟣", label: "Merged" };
    if (item.state === "open") return { emoji: "🟢", label: "Open PR" };
    return { emoji: "🔴", label: "Closed PR" };
  }
  if (item.state === "open") return { emoji: "🟢", label: "Open issue" };
  return { emoji: "🔴", label: "Closed issue" };
}

function repoOf(item) {
  return (item.repository_url || "").split("/repos/")[1] || "unknown";
}

function renderBlock(items) {
  if (items.length === 0) return "_No public contributions yet._";

  const lines = items.slice(0, MAX_ITEMS).map((item) => {
    const { emoji, label } = statusFor(item);
    const date = (item.created_at || "").slice(0, 10);
    return `- ${emoji} **${label}** — [${item.title}](${item.html_url}) · \`${repoOf(item)}\` · ${date}`;
  });

  return lines.join("\n");
}

function locateReadme(root) {
  for (const name of ["README.md", "readme.md"]) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Neither README.md nor readme.md was found in the repo root.");
}

async function main() {
  // Prefer contributions to repos the user does not own; fall back to everything.
  let items = await searchIssues(`author:${USER} -user:${USER}`);
  if (items.length === 0) items = await searchIssues(`author:${USER}`);

  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const readmePath = locateReadme(process.cwd());
  const original = fs.readFileSync(readmePath, "utf8");

  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (!pattern.test(original)) {
    throw new Error(`Could not find ${START} / ${END} markers in ${path.basename(readmePath)}.`);
  }

  const updated = original.replace(pattern, `${START}\n${renderBlock(items)}\n${END}`);
  if (updated === original) {
    console.log(`No changes — ${path.basename(readmePath)} is already up to date.`);
    return;
  }

  fs.writeFileSync(readmePath, updated);
  console.log(`Updated ${path.basename(readmePath)} with ${Math.min(items.length, MAX_ITEMS)} item(s).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
