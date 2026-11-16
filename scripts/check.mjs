// Site check: the last gate before anything goes live.
// GitHub runs it on every push and pull request, and Netlify runs it before every deploy.
// If any check fails, the deploy stops and the live site stays as it was.
// No packages to install: plain Node only.
//
// On success it copies only the site's own files into dist/, which is what Netlify publishes,
// so this script, the README and other repo files never end up on the live site.

import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (f) => readFileSync(join(ROOT, f), "utf8");

// 1. Only expected files. Anything new must be added here on purpose.
const SITE_FILES = [
  "index.html", "styles.css", "app.js", "_headers",
  "favicon.svg", "favicon.ico", "apple-touch-icon.png",
  "JLynn_Turner_Resume.pdf",
  "fonts/google-sans-latin.woff2", "fonts/google-sans-flex-latin.woff2", "fonts/OFL.txt",
];
const REPO_FILES = ["README.md", "netlify.toml", "scripts/check.mjs", ".github/workflows/check.yml", ".gitignore"];
const allowed = new Set([...SITE_FILES, ...REPO_FILES]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    if ([".git", "dist", "node_modules", ".netlify"].includes(name) && dir === "") continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}
for (const f of walk("")) if (!allowed.has(f)) fail(`Unexpected file: ${f} (add it to the list on purpose, or remove it)`);
for (const f of SITE_FILES) if (!existsSync(join(ROOT, f))) fail(`Missing file: ${f}`);
if (problems.length) finish();

const html = read("index.html");
const css = read("styles.css");
const js = read("app.js");
const headers = read("_headers");

// 2. Every file the page points to exists.
const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
for (const r of refs) {
  if (/^(https?:|mailto:|#)/.test(r)) continue;
  if (!existsSync(join(ROOT, r.split(/[?#]/)[0]))) fail(`Broken link in index.html: ${r}`);
}
for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
  if (/^data:/.test(m[1])) continue;
  if (/^https?:/.test(m[1])) fail(`styles.css loads from another site: ${m[1]}`);
  else if (!existsSync(join(ROOT, m[1]))) fail(`Broken file in styles.css: ${m[1]}`);
}

// 3. Nothing loads from other sites (privacy, and the security policy would block it anyway).
for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi)) {
  const tag = m[0];
  const url = (tag.match(/\b(?:src|href)="([^"]+)"/) || [])[1] || "";
  if (/^(https?:)?\/\//.test(url)) fail(`Loads from another site: ${tag}`);
  if (/^(iframe|embed|object)$/i.test(m[1])) fail(`Embedded frame or object not allowed: ${tag}`);
}
if (/@import/.test(css)) fail("styles.css uses @import");

// 4. No inline code (the security policy only allows code from this site's own files).
if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail("Inline <script> found in index.html");
if (/<style\b/i.test(html)) fail("Inline <style> found in index.html");
if (/\sstyle="/i.test(html)) fail("Inline style=\"...\" attribute found in index.html");
if (/\son[a-z]+="/i.test(html)) fail("Inline event handler (onclick etc.) found in index.html");
if (/javascript:/i.test(html)) fail("javascript: link found in index.html");

// 5. Links that open a new tab can't reach back into this page.
for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
  const a = m[0];
  if (/target="_blank"/.test(a) && !/rel="[^"]*noopener[^"]*noreferrer|rel="[^"]*noreferrer[^"]*noopener/.test(a))
    fail(`New-tab link missing rel="noopener noreferrer": ${a}`);
  if (/href="http:\/\//.test(a)) fail(`Insecure http:// link: ${a}`);
}

// 6. Script: valid syntax, and none of the risky ways to write to the page.
try { execFileSync(process.execPath, ["--check", join(ROOT, "app.js")], { stdio: "pipe" }); }
catch (e) { fail(`app.js has a syntax error:\n${String(e.stderr || e.message)}`); }
for (const [re, why] of [
  [/\beval\s*\(/, "eval()"], [/new\s+Function\s*\(/, "new Function()"],
  [/\.innerHTML\s*=/, "innerHTML ="], [/\.outerHTML\s*=/, "outerHTML ="],
  [/insertAdjacentHTML/, "insertAdjacentHTML"], [/document\.write/, "document.write"],
  [/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/, "network request"],
]) if (re.test(js)) fail(`app.js uses ${why}`);
for (const m of js.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g))
  if (!html.includes(`id="${m[1]}"`)) fail(`app.js looks for #${m[1]}, which isn't in index.html`);

// 7. Page basics.
if (!/<html lang="[a-z]{2}/.test(html)) fail("<html> is missing lang");
if (!/<meta charset="utf-8"/i.test(html)) fail("Missing <meta charset>");
if (!/<meta name="viewport"/.test(html)) fail("Missing viewport tag (phones)");
if (!/<title>[^<]+<\/title>/.test(html)) fail("Missing <title>");
if ((html.match(/<h1\b/g) || []).length !== 1) fail("Page should have exactly one <h1>");
for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\balt="/.test(m[0])) fail(`Image missing alt text: ${m[0]}`);
for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi))
  if (!/aria-label="[^"]+"/.test(m[0]) && !m[1].replace(/<[^>]+>/g, "").trim()) fail(`Button has no label: ${m[0].slice(0, 80)}`);
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) fail(`Duplicate id: ${id}`);
const tagStack = [];
const VOID = new Set(["meta", "link", "br", "img", "input", "hr", "source", "area", "base", "col", "wbr"]);
for (const m of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)) {
  const name = m[1].toLowerCase();
  if (VOID.has(name) || m[0].startsWith("<!")) continue;
  if (m[0].startsWith("</")) {
    if (tagStack.pop() !== name) { fail(`HTML tags don't nest correctly near </${name}>`); break; }
  } else if (!m[0].endsWith("/>")) tagStack.push(name);
}
if (tagStack.length && !problems.some((p) => p.startsWith("HTML tags"))) fail(`Unclosed HTML tags: ${tagStack.join(", ")}`);

// 8. CSS braces balance.
let depth = 0;
for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, "")) {
  if (ch === "{") depth++;
  if (ch === "}" && --depth < 0) break;
}
if (depth !== 0) fail("styles.css has unbalanced { }");

// 9. Security headers are all there.
for (const need of [
  /Content-Security-Policy:.*default-src 'none'/, /script-src https:\/\/jlynn-turner\.netlify\.app\/app\.js;/,
  /require-trusted-types-for 'script'/, /connect-src 'none'/, /frame-ancestors 'none'/,
  /Cross-Origin-Embedder-Policy: require-corp/,
  /X-Content-Type-Options: nosniff/, /X-Frame-Options: DENY/, /Referrer-Policy:/,
  /Permissions-Policy:/, /Strict-Transport-Security:/,
]) if (!need.test(headers)) fail(`_headers is missing ${need.source}`);
if (/unsafe-inline|unsafe-eval|\*;/.test(headers)) fail("_headers loosens the security policy (unsafe-inline, unsafe-eval or *)");
// Only app.js may run. 'self' would also let code the host adds under this address run (Netlify injects its own toolbar script).
if (/script-src[^;]*'self'/.test(headers)) fail("_headers lets any script from this site run; allow only app.js");
// The workflow's actions must be pinned to exact commits, not tags that can move.
const wf = read(".github/workflows/check.yml");
for (const m of wf.matchAll(/uses:\s*(\S+)/g)) if (!/@[0-9a-f]{40}$/.test(m[1])) fail(`Workflow action not pinned to a commit: ${m[1]}`);

// 10. Private details stay off the page and out of the resume file.
//     Topics that must never appear are stored as fingerprints, so this public file doesn't name them.
const BLOCKED = new Set([
  "5d96a02c8be4f56c", "fc27aed7ca281c48", "23b2a54839ee86a3", "3a519450d1092221",
  "06c8aaa93d80a768", "67ef34b7b4ef4d15", "178e8a61f93f6c20", "5beeafeac2e27eae", "5ede56738376a8c5",
]);
const fp = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
function scanPrivate(label, text) {
  const words = text.toLowerCase().replace(/<[^>]+>/g, " ").match(/[a-z0-9]+/g) || [];
  blocked: for (let i = 0; i < words.length; i++)
    for (let n = 1; n <= 3 && i + n <= words.length; n++)
      if (BLOCKED.has(fp(words.slice(i, i + n).join(" ")))) { fail(`${label} mentions a blocked topic (word ${i + 1})`); break blocked; }
  if (/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text)) fail(`${label} contains a phone number`);
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) fail(`${label} contains an email address`);
  if (/\b\d{1,5}\s+\w+\s+(ave|avenue|st|street|rd|road|blvd|apt)\b/i.test(text)) fail(`${label} contains a street address`);
}
scanPrivate("index.html", html);
scanPrivate("app.js", js);
// The resume's text is compressed, so check what can be read: its file details and its links.
const pdf = readFileSync(join(ROOT, "JLynn_Turner_Resume.pdf")).toString("latin1");
const pdfInfo = [...pdf.matchAll(/\/(?:Author|Creator|Producer|Title|Subject|Keywords)\s*\(([^)]*)\)/g)].map((m) => m[1]).join(" ");
scanPrivate("Resume PDF details", pdfInfo);
const PDF_LINKS = new Set(["mailto:jly.turn@outlook.com", "https://www.linkedin.com/in/jlynn-turner"]);
for (const m of pdf.matchAll(/\/URI\s*\(([^)]*)\)/g)) if (!PDF_LINKS.has(m[1])) fail(`Resume PDF has an unexpected link: ${m[1]}`);

// 11. Size budget: keeps the page fast on a phone.
const total = SITE_FILES.reduce((s, f) => s + statSync(join(ROOT, f)).size, 0);
if (total > 600 * 1024) fail(`Site is ${(total / 1024).toFixed(0)} KB; budget is 600 KB`);

finish();

function finish() {
  if (problems.length) {
    console.error(`\nSite check FAILED (${problems.length}):\n- ` + problems.join("\n- ") + "\n\nNothing was published.");
    process.exit(1);
  }
  rmSync(join(ROOT, "dist"), { recursive: true, force: true });
  for (const f of SITE_FILES) {
    mkdirSync(dirname(join(ROOT, "dist", f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(ROOT, "dist", f));
  }
  console.log(`Site check passed: ${SITE_FILES.length} files ready in dist/.`);
}
