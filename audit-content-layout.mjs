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
            .filter(element => !element.closest(".table-scroll,.code-scroll"))
            .filter(element => {
              const rect = element.getBoundingClientRect();
              return rect.right > contentRect.right + 3 || rect.left < contentRect.left - 3 || rect.width > contentRect.width + 3;
            }).length;

          const legacyLayouts = [...content.querySelectorAll("*")].filter(element =>
            [...element.classList].some(name => /^(?:pricing-grid|pricing-card|comparison-grid|comparison-card|numbered-card-grid|numbered-card|content-card-grid|content-card|promo-card|media-gallery)$/.test(name))
          ).length;

          const genericLabels = new Set([
            "pricing", "faq", "my verdict", "verdict", "risk free", "risk-free", "the shift",
            "cost comparison", "value breakdown", "what you download", "full library", "overview",
            "summary", "bonuses", "bonus", "features", "evaluation", "audience fit", "what you get",
            "ideal for", "product overview", "honest assessment", "watch before you buy"
          ]);
          const orphanGenericLabels = [...content.querySelectorAll("p,div,span")]
            .filter(element => element.children.length === 0 && genericLabels.has(String(element.textContent || "").trim().toLowerCase()))
            .length;

          const ctas = [...content.querySelectorAll("a.imported-cta")];
          const media = [...content.querySelectorAll("video,iframe,object,embed")];
          const normalizerAudit = window.DigiReviewContentNormalizer?.audit(content) || { issues: ["Normalizer unavailable."] };

          return {
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
            overflow,
            legacyLayouts,
            orphanGenericLabels,
            ctaCount: ctas.length,
            ctaWithoutHref: ctas.filter(link => !/^https?:\/\//i.test(link.getAttribute("href") || "")).length,
            unwrappedMedia: media.filter(item => !item.closest(".content-video-wrap")).length,
            safeRoot: content.querySelectorAll(".dr-safe-flow-root").length,
            normalizerIssues: normalizerAudit.issues || []
          };
        });

        const failures = [];
        if (errors.length) failures.push(`JavaScript errors: ${errors.join(" | ")}`);
        if (result.pageOverflow || result.overflow) failures.push("Content overflow detected.");
        if (result.legacyLayouts) failures.push("Legacy inferred card/grid layout remains.");
        if (result.orphanGenericLabels) failures.push("Generic orphan labels remain.");
        if (result.ctaCount > 2 || result.ctaWithoutHref) failures.push("CTA validation failed.");
        if (result.unwrappedMedia) failures.push("Media wrapper validation failed.");
        if (result.safeRoot !== 1) failures.push("Safe-flow root validation failed.");
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
console.log(`Audited ${report.checks.length} desktop/mobile article renders in safe-flow mode.`);
if (report.failures.length) {
  console.error(`Layout audit failed for ${report.failures.length} render(s).`);
  report.failures.slice(0, 20).forEach(item => console.error(`${item.viewport} · ${item.slug}: ${item.failures.join("; ")}`));
  process.exitCode = 1;
} else {
  console.log("Safe-flow layout audit passed with no detected regressions.");
}
