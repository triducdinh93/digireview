import { chromium } from "playwright";
import fs from "node:fs/promises";

const [css, normalizer] = await Promise.all([
  fs.readFile("style.css", "utf8"),
  fs.readFile("content-normalizer.js", "utf8")
]);

const fixture = `
  <div class="pricing-grid comparison-grid">
    <div class="pricing-card comparison-card"><div>Regular Price</div><h3>Standard</h3><p>$97</p><ul><li>Feature A</li><li>Feature B</li></ul></div>
    <div class="pricing-card comparison-card"><div>Best Value</div><h3>Launch Special</h3><p>$39</p><ul><li>Feature A</li><li>Feature B</li></ul><p><a href="https://example.com/buy">Get Instant Access</a></p></div>
  </div>
  <p>Pricing</p><h2>Pricing Section</h2><p>Explanation paragraph.</p>
  <div class="numbered-card-grid">
    <div class="numbered-card"><div>01</div><h3>Learn & Execute</h3><p>Body one.</p><p>Best for beginners</p></div>
    <div class="numbered-card"><div>02</div><h3>Resell With PLR</h3><p>Body two with more words to simulate uneven source cards.</p><p>Best for sellers</p></div>
    <div class="numbered-card"><div>03</div><h3>Content Machine</h3><p>Body three.</p><p>Best for creators</p></div>
  </div>
  <p>FAQ</p><h2>Quick Answers</h2>
  <section class="promo-card"><h3>Your Competitors Are Already Listing Products</h3><p>Short promo content without a hyperlink must remain ordinary article content.</p></section>
  <p><a href="https://example.com/buy">Get It Now</a></p>
  <p><a href="https://example.com/buy">Buy Now</a></p>
  <p><a href="https://example.com/other">Download Today</a></p>
  <div class="media-card"><div class="content-video-wrap"><video controls></video></div><div class="media-caption"><strong>Video Title</strong><p>Video caption.</p></div></div>
  <div class="table-scroll"><table><thead><tr><th>Plan</th><th>Price</th></tr></thead><tbody><tr><td>Standard</td><td>$97</td></tr><tr><td>Launch</td><td>$39</td></tr></tbody></table></div>
`;

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main style="max-width:1180px;margin:auto"><div class="article-layout"><article><div id="article-content" class="article-content">${fixture}</div></article></div></main></body></html>`);
    await page.addScriptTag({ content: normalizer });
    await page.evaluate(() => DigiReviewContentNormalizer.normalize(document.getElementById("article-content"), { force: true }));

    const result = await page.evaluate(() => {
      const content = document.getElementById("article-content");
      const rect = content.getBoundingClientRect();
      const overflow = [...content.querySelectorAll("*")]
        .filter(element => !element.closest(".table-scroll,.code-scroll"))
        .filter(element => {
          const box = element.getBoundingClientRect();
          return box.right > rect.right + 3 || box.left < rect.left - 3 || box.width > rect.width + 3;
        }).length;
      const legacy = [...content.querySelectorAll("*")].filter(element =>
        [...element.classList].some(name => /^(?:pricing-grid|pricing-card|comparison-grid|comparison-card|numbered-card-grid|numbered-card|promo-card|media-gallery)$/.test(name))
      ).length;
      return {
        overflow,
        legacy,
        ctas: content.querySelectorAll("a.imported-cta").length,
        invalidCtas: [...content.querySelectorAll("a.imported-cta")].filter(link => !/^https?:\/\//i.test(link.getAttribute("href") || "")).length,
        unwrappedMedia: [...content.querySelectorAll("video,iframe,object,embed")].filter(media => !media.closest(".content-video-wrap")).length,
        genericLabels: [...content.querySelectorAll("p,div,span")].filter(element => ["pricing", "faq"].includes(String(element.textContent || "").trim().toLowerCase())).length,
        safeRoots: content.querySelectorAll(".dr-safe-flow-root").length,
        audit: DigiReviewContentNormalizer.audit(content)
      };
    });

    const errors = [];
    if (result.overflow) errors.push(`overflow=${result.overflow}`);
    if (result.legacy) errors.push(`legacy=${result.legacy}`);
    if (result.ctas > 2 || result.invalidCtas) errors.push(`CTA validation failed (${result.ctas}/${result.invalidCtas})`);
    if (result.unwrappedMedia) errors.push(`unwrapped media=${result.unwrappedMedia}`);
    if (result.genericLabels) errors.push(`generic labels=${result.genericLabels}`);
    if (result.safeRoots !== 1) errors.push(`safe roots=${result.safeRoots}`);
    if (result.audit.issues.length) errors.push(...result.audit.issues);
    if (errors.length) failures.push(`${viewport.name}: ${errors.join("; ")}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("Safe-flow fixture audit failed:");
  failures.forEach(failure => console.error(failure));
  process.exitCode = 1;
} else {
  console.log("Safe-flow fixture audit passed on desktop and mobile.");
}
