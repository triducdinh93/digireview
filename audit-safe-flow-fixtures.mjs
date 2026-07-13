import { chromium } from "playwright";
import fs from "node:fs/promises";
await import("./content-schema.js");
const Schema = globalThis.DigiReviewContentSchema;
const css = await fs.readFile("style.css", "utf8");

const fixture = Schema.normalizeModel({
  blocks: [
    { type: "heading", level: 2, text: "Structured Product Overview" },
    { type: "paragraph", text: "This fixture checks every standard block without copying source page styling." },
    { type: "list", style: "check", title: "Best for", items: ["Affiliate marketers", "Product reviewers", "Digital sellers"] },
    { type: "image", src: "https://example.com/image.jpg", alt: "Product preview", caption: "Standard image caption", display: "wide" },
    { type: "video", src: "https://example.com/video.mp4", caption: "Standard video caption" },
    { type: "table", headers: ["Feature", "Included"], rows: [["Templates", "Yes"], ["Support", "Email"]] },
    { type: "callout", style: "info", title: "Important", text: "Source design is discarded." },
    { type: "faq", items: [{ question: "Is this structured?", answer: "Yes. It uses a fixed schema." }] }
  ],
  cta: { enabled: true, url: "https://example.com/offer", buttonLabel: "View Offer" }
});

const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main style="max-width:900px;margin:auto">${Schema.renderBlocks(fixture)}${Schema.renderCta(fixture.cta)}</main></body></html>`);
  results.push(await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
    cta: document.querySelectorAll(".dr-standard-cta").length,
    schemaRoot: document.querySelectorAll("[data-dr-schema]").length,
    sourceClasses: [...document.querySelectorAll("*")].filter(element => /pricing-grid|comparison-card|promo-card|imported-/i.test(String(element.className))).length
  })));
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.overflow || result.cta !== 1 || result.schemaRoot !== 1 || result.sourceClasses)) process.exitCode = 1;
