import { chromium } from "playwright";
import fs from "node:fs/promises";

const read = file => fs.readFile(file, "utf8");
const [indexHtml, css, postsSource, normalizerSource, originalApp] = await Promise.all([
  read("index.html"), read("style.css"), read("posts.js"), read("content-normalizer.js"), read("app.js")
]);

const body = indexHtml.match(/<body>([\s\S]*)<\/body>/i)?.[1] || "<main id=\"app\"></main>";
const appSource = originalApp
  .replaceAll("localStorage", "__auditStorage")
  .replaceAll("sessionStorage", "__auditSessionStorage");
const dataMatch = postsSource.match(/window\.BLOG_DATA\s*=\s*([\s\S]*);\s*$/);
if (!dataMatch) throw new Error("posts.js does not contain window.BLOG_DATA.");
const data = JSON.parse(dataMatch[1]);
const posts = Array.isArray(data.posts) ? data.posts : [];

const baseHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
const storageSource = `
window.__auditStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}};
window.__auditSessionStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}};
`;

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];
const report = { generatedAt: new Date().toISOString(), posts: posts.length, checks: [], failures: [] };
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.route("**/*", route => route.abort()).catch(() => {});

    for (const post of posts) {
      const errors = [];
      const onError = error => errors.push(String(error));
      page.on("pageerror", onError);
      try {
        await page.setContent(baseHtml, { waitUntil: "domcontentloaded" });
        await page.evaluate(slug => { location.hash = `#post=${slug}`; }, post.slug);
        await page.addScriptTag({ content: postsSource });
        await page.addScriptTag({ content: storageSource });
        await page.addScriptTag({ content: normalizerSource });
        await page.addScriptTag({ content: appSource });
        await page.waitForSelector("#article-content", { timeout: 15_000 });

        const result = await page.evaluate(() => {
          const content = document.getElementById("article-content");
          const contentRect = content.getBoundingClientRect();
          const visible = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const overflow = [...content.querySelectorAll("*")]
            .filter(visible)
            .filter(element => !element.closest(".table-scroll,.code-scroll,.directory-tree"))
            .filter(element => {
              const rect = element.getBoundingClientRect();
              return rect.right > contentRect.right + 3 || rect.left < contentRect.left - 3 || rect.width > contentRect.width + 3;
            }).length;

          const unevenGrids = [...content.querySelectorAll(".comparison-grid,.pricing-grid,.numbered-card-grid,.content-card-grid")]
            .filter(grid => {
              const rows = new Map();
              [...grid.children].filter(visible).forEach(card => {
                const rect = card.getBoundingClientRect();
                const key = Math.round(rect.top / 4) * 4;
                if (!rows.has(key)) rows.set(key, []);
                rows.get(key).push(rect.height);
              });
              return [...rows.values()].some(heights => heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 3);
            }).length;

          const mixedComponents = [...content.querySelectorAll("*")].filter(element => {
            const grids = ["pricing-grid", "comparison-grid", "numbered-card-grid", "content-card-grid", "media-gallery"].filter(name => element.classList.contains(name));
            const cards = ["pricing-card", "comparison-card", "numbered-card", "content-card", "media-card"].filter(name => element.classList.contains(name));
            return grids.length > 1 || cards.length > 1;
          }).length;

          const ctas = [...content.querySelectorAll("a.imported-cta")];
          const media = [...content.querySelectorAll("video,iframe,object,embed")];
          const normalizerAudit = window.DigiReviewContentNormalizer?.audit(content) || { issues: ["Normalizer unavailable."] };
          return {
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
            overflow,
            unevenGrids,
            mixedComponents,
            ctaCount: ctas.length,
            ctaWithoutHref: ctas.filter(link => !link.getAttribute("href")).length,
            unwrappedMedia: media.filter(item => !item.closest(".content-video-wrap,.media-card")).length,
            mediaCardErrors: [...content.querySelectorAll(".media-card")].filter(card => card.querySelectorAll("video,iframe,object,embed").length !== 1).length,
            pricingConflicts: content.querySelectorAll(".pricing-grid.comparison-grid,.pricing-card.comparison-card").length,
            normalizerIssues: normalizerAudit.issues || []
          };
        });

        const failures = [];
        if (errors.length) failures.push(`JavaScript errors: ${errors.join(" | ")}`);
        if (result.pageOverflow || result.overflow) failures.push("Content overflow detected.");
        if (result.unevenGrids) failures.push("Adjacent card heights are inconsistent.");
        if (result.mixedComponents || result.pricingConflicts) failures.push("Mutually exclusive components overlap.");
        if (result.ctaCount > 3 || result.ctaWithoutHref) failures.push("CTA validation failed.");
        if (result.unwrappedMedia || result.mediaCardErrors) failures.push("Media card validation failed.");
        if (result.normalizerIssues.length) failures.push(...result.normalizerIssues);

        const record = { viewport: viewport.name, slug: post.slug, ...result, failures };
        report.checks.push(record);
        if (failures.length) report.failures.push(record);
      } catch (error) {
        const record = { viewport: viewport.name, slug: post.slug, failures: [String(error)] };
        report.checks.push(record);
        report.failures.push(record);
      } finally {
        page.off("pageerror", onError);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile("layout-audit-report.json", JSON.stringify(report, null, 2) + "\n");
console.log(`Audited ${report.checks.length} desktop/mobile article renders.`);
if (report.failures.length) {
  console.error(`Layout audit failed for ${report.failures.length} render(s).`);
  report.failures.slice(0, 20).forEach(item => console.error(`${item.viewport} · ${item.slug}: ${item.failures.join("; ")}`));
  process.exitCode = 1;
} else {
  console.log("Layout audit passed with no detected regressions.");
}
