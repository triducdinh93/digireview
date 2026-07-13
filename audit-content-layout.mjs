import { chromium } from "playwright";
import fs from "node:fs/promises";
import vm from "node:vm";

await import("./content-schema.js");
const Schema = globalThis.DigiReviewContentSchema;

const postsSource = await fs.readFile("posts.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(postsSource, sandbox);
const posts = Array.isArray(sandbox.window.BLOG_DATA?.posts) ? sandbox.window.BLOG_DATA.posts : [];
const css = await fs.readFile("style.css", "utf8");

const canonical = posts.filter(post => post.contentModel?.blocks);
const legacy = posts.filter(post => !post.contentModel?.blocks);
const structuralIssues = [];

for (const post of canonical) {
  const audit = Schema.audit(post.contentModel);
  if (!audit.valid) structuralIssues.push(`${post.slug}: ${audit.issues.join("; ")}`);
  const cta = Schema.normalizeCta(post.cta || post.contentModel?.cta);
  if (cta.enabled && !cta.url) structuralIssues.push(`${post.slug}: enabled CTA lacks a valid URL.`);
}

const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];
const renderIssues = [];

for (const post of canonical) {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const content = Schema.renderBlocks(post.contentModel);
    const cta = Schema.renderCta(post.cta || post.contentModel?.cta);
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main style="width:min(1180px,calc(100% - 24px));margin:auto"><div class="article-layout"><article><div id="article-content" class="article-content">${content}</div>${cta}</article></div></main></body></html>`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(() => {
      const root = document.querySelector("article");
      const rootRect = root.getBoundingClientRect();
      const overflow = [...root.querySelectorAll("*")].filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.display === "none" || rect.width === 0) return false;
        if (element.closest(".dr-table-scroll")) return false;
        return rect.left < rootRect.left - 3 || rect.right > rootRect.right + 3 || rect.width > rootRect.width + 3;
      }).slice(0, 8).map(element => `${element.tagName}.${String(element.className || "")}`);
      return {
        viewportOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
        overflow,
        ctaCount: document.querySelectorAll(".dr-standard-cta").length,
        rawCtaLinks: document.querySelectorAll("#article-content a").length,
        invalidMedia: [...document.querySelectorAll(".dr-video")].filter(figure => !figure.querySelector(".dr-video-frame video,.dr-video-frame iframe")).length,
        schemaRoots: document.querySelectorAll('[data-dr-schema="dr-content-v1"]').length
      };
    });
    if (result.viewportOverflow || result.overflow.length) renderIssues.push(`${post.slug} (${viewport.name}): overflow ${result.overflow.join(", ")}`);
    if (result.ctaCount > 1) renderIssues.push(`${post.slug} (${viewport.name}): more than one standard CTA.`);
    if (result.rawCtaLinks) renderIssues.push(`${post.slug} (${viewport.name}): article body contains hyperlinks; CTA links must live in the standard CTA form.`);
    if (result.invalidMedia) renderIssues.push(`${post.slug} (${viewport.name}): invalid video block.`);
    if (result.schemaRoots !== 1) renderIssues.push(`${post.slug} (${viewport.name}): expected one canonical schema root.`);
    await context.close();
  }
}
await browser.close();

console.log(JSON.stringify({
  posts: posts.length,
  canonical: canonical.length,
  legacy: legacy.length,
  structuralIssues,
  renderIssues
}, null, 2));

if (structuralIssues.length || renderIssues.length) process.exitCode = 1;
