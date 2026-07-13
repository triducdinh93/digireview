import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

await import("./content-schema.js");
const Schema = globalThis.DigiReviewContentSchema;
if (!Schema) throw new Error("content-schema.js did not initialize.");

const REQUESTS_DIR = path.resolve("autofill/requests");
const RESULTS_DIR = path.resolve("autofill/results");

const cleanText = value => String(value || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, " ")
  .trim();

const wordCount = value => cleanText(value).split(/\s+/).filter(Boolean).length;

const expectedWordsFromUrl = url => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "")
      .toLowerCase()
      .replace(/-/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(word => word.length >= 3 && !["review", "home", "page"].includes(word));
  } catch {
    return [];
  }
};

const titleRelevance = (title, expectedWords) => {
  const actual = new Set(String(title || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean));
  if (!expectedWords.length) return 0;
  return expectedWords.filter(word => actual.has(word)).length / expectedWords.length;
};

const titleCaseFromUrl = url => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase())
      .trim();
  } catch {
    return "";
  }
};

const excerptFromText = value => {
  const source = cleanText(value);
  if (source.length <= 280) return source;
  const cut = source.slice(0, 280);
  const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, boundary > 180 ? boundary + 1 : 245).trim()}…`;
};

async function ensureDirectories() {
  await fs.mkdir(REQUESTS_DIR, { recursive: true });
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

async function listRequests() {
  try {
    return (await fs.readdir(REQUESTS_DIR)).filter(name => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => {
        const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
        window.scrollBy(0, 800);
        total += 800;
        if (total >= height || total > 18000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 110);
    });
  }).catch(() => {});
}

async function inspectFrame(frame) {
  return frame.evaluate(() => {
    const normalize = value => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const absolute = value => {
      try { return new URL(value, location.href).href; }
      catch { return ""; }
    };
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 1 && rect.height > 1;
    };
    const textOnly = element => normalize(element?.innerText || element?.textContent || "");
    const isDecorativeText = value => /^(?:✓|✔|☑|✅|✗|✘|❌|×|•|▪|▫|\d{1,3})$/u.test(normalize(value));
    const genericLabels = new Set([
      "pricing", "faq", "my verdict", "verdict", "risk free", "risk-free", "the shift",
      "cost comparison", "value breakdown", "what you download", "full library", "overview",
      "summary", "bonuses", "bonus", "features", "evaluation", "audience fit", "what you get",
      "ideal for", "product overview", "honest assessment", "watch before you buy"
    ]);
    const actionPattern = /\b(?:get|buy|download|access|start|launch|try|claim|order|join|view|check|shop|unlock|grab|visit|secure|see offer|learn more)\b/i;

    const roots = [
      ...document.querySelectorAll("article,main,[role='main'],.article,.post,.entry-content"),
      document.body
    ].filter(Boolean);

    let root = document.body;
    let bestWords = 0;
    for (const candidate of roots) {
      const words = textOnly(candidate).split(/\s+/).filter(Boolean).length;
      if (words > bestWords) { bestWords = words; root = candidate; }
    }

    if (!root) return { frameUrl: location.href, title: document.title, text: "", blocks: [], ctaCandidates: [], images: [], score: -9999 };

    const firstHeading = normalize(root.querySelector("h1")?.textContent || root.querySelector("h2")?.textContent || document.title);
    const paragraphs = [...root.querySelectorAll("p")].filter(visible).map(node => textOnly(node)).filter(value => value.length >= 40);
    const description = normalize(document.querySelector('meta[name="description"]')?.content || document.querySelector('meta[property="og:description"]')?.content || paragraphs.slice(0, 2).join(" "));

    const ctaCandidates = [...root.querySelectorAll("a[href]")]
      .filter(visible)
      .map((anchor, index) => {
        const label = textOnly(anchor);
        const href = absolute(anchor.getAttribute("href") || "");
        if (!/^https?:\/\//i.test(href) || !label || label.length > 100) return null;
        if (/sites\.google\.com|googleusercontent\.com|accounts\.google\.com/i.test(href)) return null;
        const rect = anchor.getBoundingClientRect();
        let score = 0;
        if (actionPattern.test(label)) score += 8;
        if (/\$\s*\d|offer|price|checkout|discount|save/i.test(label)) score += 5;
        if (label.length >= 8 && label.length <= 55) score += 2;
        if (rect.top < innerHeight * 1.5) score += 2;
        if (index > root.querySelectorAll("a[href]").length * 0.65) score += 1;
        return { label, url: href, score, index };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const ctaUrls = new Set(ctaCandidates.map(item => item.url));
    const blocks = [];
    const emitted = new Set();
    const handled = new WeakSet();

    const push = block => {
      if (!block) return;
      let key = block.type;
      if (block.type === "heading" || block.type === "paragraph" || block.type === "quote" || block.type === "callout") key += `:${normalize(block.text || block.title).toLowerCase()}`;
      else if (block.type === "list") key += `:${(block.items || []).join("|").toLowerCase()}`;
      else if (["image", "video", "audio"].includes(block.type)) key += `:${block.src}`;
      else if (block.type === "table") key += `:${JSON.stringify(block.headers || [])}:${JSON.stringify(block.rows || [])}`;
      else if (block.type === "faq") key += `:${(block.items || []).map(item => item.question).join("|").toLowerCase()}`;
      if (emitted.has(key)) return;
      emitted.add(key);
      blocks.push(block);
    };

    const cleanList = (items, style = "bullet") => {
      const cleaned = items.map(value => normalize(value)
        .replace(/^[•●▪▫◦‣⁃*]+\s*/u, "")
        .replace(/^[✓✔☑✅✗✘❌×]\s*/u, "")
        .replace(/^\d{1,3}[.)]\s*/, "")
        .trim()).filter(value => value.length >= 2);
      if (!cleaned.length) return null;
      return { type: "list", style, items: [...new Set(cleaned)] };
    };

    const imageBlock = image => {
      if (!visible(image)) return null;
      const src = absolute(image.currentSrc || image.getAttribute("src") || "");
      const rect = image.getBoundingClientRect();
      const width = image.naturalWidth || Math.round(rect.width);
      const height = image.naturalHeight || Math.round(rect.height);
      const label = normalize(`${image.alt || ""} ${image.title || ""} ${src}`);
      if (!src || width < 280 || height < 150 || /logo|favicon|avatar|profile|icon|emoji|badge/i.test(label)) return null;
      const figure = image.closest("figure");
      const caption = normalize(figure?.querySelector("figcaption")?.textContent || image.alt || "");
      const ratio = height / Math.max(width, 1);
      return { type: "image", src, alt: normalize(image.alt), caption, display: ratio >= 1.25 ? "portrait" : "wide", width, height };
    };

    const videoBlock = media => {
      if (!visible(media)) return null;
      let src = "";
      let provider = "";
      let poster = "";
      if (media.tagName === "VIDEO") {
        src = absolute(media.currentSrc || media.getAttribute("src") || media.querySelector("source")?.getAttribute("src") || "");
        poster = absolute(media.getAttribute("poster") || "");
        provider = "html5";
      } else {
        src = absolute(media.getAttribute("src") || media.getAttribute("data-src") || "");
        if (/youtube\.com|youtu\.be/i.test(src)) provider = "youtube";
        else if (/vimeo\.com/i.test(src)) provider = "vimeo";
        else return null;
      }
      if (!src) return null;
      const container = media.closest("figure,section,div");
      const nearby = [...(container?.querySelectorAll("figcaption,p,h3,h4") || [])]
        .map(node => textOnly(node)).filter(value => value && value.length <= 180 && !actionPattern.test(value));
      return { type: "video", src, poster, caption: nearby[0] || normalize(media.getAttribute("title") || ""), provider };
    };

    const walk = node => {
      if (!node || handled.has(node) || node.nodeType !== Node.ELEMENT_NODE || !visible(node)) return;
      const tag = node.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "NAV", "HEADER", "FOOTER", "ASIDE", "FORM", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "SVG", "CANVAS", "DIALOG"].includes(tag)) return;

      if (/^H[1-4]$/.test(tag)) {
        handled.add(node);
        const value = textOnly(node);
        if (!value || isDecorativeText(value)) return;
        if (tag === "H1" && value.toLowerCase() === firstHeading.toLowerCase()) return;
        if (genericLabels.has(value.toLowerCase())) return;
        push({ type: "heading", level: tag === "H3" || tag === "H4" ? 3 : 2, text: value.replace(/^\d{1,3}(?:\.\d+)*[.)]?\s*/, "") });
        return;
      }

      if (tag === "P") {
        handled.add(node);
        const directLinks = [...node.querySelectorAll("a[href]")];
        if (directLinks.length && directLinks.every(link => ctaUrls.has(absolute(link.getAttribute("href") || "")))) return;
        const value = textOnly(node);
        if (!value || isDecorativeText(value) || genericLabels.has(value.toLowerCase())) return;
        if (/^\d{1,3}$/.test(value)) return;
        push({ type: "paragraph", text: value });
        return;
      }

      if (tag === "UL" || tag === "OL") {
        handled.add(node);
        const values = [...node.children].filter(child => child.tagName === "LI").map(textOnly).filter(Boolean);
        const joined = values.join(" ");
        let style = tag === "OL" ? "number" : "bullet";
        if (/✓|✔|☑|✅/u.test(joined)) style = "check";
        if (/✗|✘|❌|×/u.test(joined)) style = "cross";
        push(cleanList(values, style));
        return;
      }

      if (tag === "FIGURE") {
        handled.add(node);
        const media = node.querySelector("video,iframe");
        if (media) push(videoBlock(media));
        else {
          const image = node.querySelector("img");
          if (image) push(imageBlock(image));
        }
        return;
      }

      if (tag === "IMG") {
        handled.add(node);
        push(imageBlock(node));
        return;
      }

      if (tag === "VIDEO" || tag === "IFRAME") {
        handled.add(node);
        push(videoBlock(node));
        return;
      }

      if (tag === "AUDIO") {
        handled.add(node);
        const src = absolute(node.currentSrc || node.getAttribute("src") || node.querySelector("source")?.getAttribute("src") || "");
        if (src) push({ type: "audio", src, caption: normalize(node.getAttribute("title") || "") });
        return;
      }

      if (tag === "TABLE") {
        handled.add(node);
        const rows = [...node.querySelectorAll("tr")].map(row => [...row.children].map(cell => textOnly(cell)));
        const first = rows[0] || [];
        const hasHead = node.querySelector("thead") || [...node.querySelectorAll("tr:first-child th")].length;
        push({ type: "table", caption: normalize(node.querySelector("caption")?.textContent || ""), headers: hasHead ? first : [], rows: hasHead ? rows.slice(1) : rows });
        return;
      }

      if (tag === "DETAILS") {
        handled.add(node);
        const question = textOnly(node.querySelector("summary"));
        const clone = node.cloneNode(true);
        clone.querySelector("summary")?.remove();
        const answer = textOnly(clone);
        if (question && answer) push({ type: "faq", title: "Frequently Asked Questions", items: [{ question, answer }] });
        return;
      }

      if (tag === "BLOCKQUOTE") {
        handled.add(node);
        const clone = node.cloneNode(true);
        const cite = clone.querySelector("cite");
        const attribution = textOnly(cite);
        cite?.remove();
        const value = textOnly(clone);
        if (value) push({ type: "quote", text: value, attribution });
        return;
      }

      if (tag === "HR") {
        handled.add(node);
        push({ type: "divider" });
        return;
      }

      if (tag === "A") {
        handled.add(node);
        return;
      }

      const semanticChildren = [...node.children].filter(child => ["H1", "H2", "H3", "H4", "P", "UL", "OL", "FIGURE", "IMG", "VIDEO", "IFRAME", "AUDIO", "TABLE", "DETAILS", "BLOCKQUOTE", "HR"].includes(child.tagName));
      if (semanticChildren.length) {
        [...node.children].forEach(walk);
        return;
      }

      const children = [...node.children].filter(visible);
      if (children.length) {
        children.forEach(walk);
        const direct = normalize([...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join(" "));
        if (direct.length >= 30 && !isDecorativeText(direct) && !genericLabels.has(direct.toLowerCase())) push({ type: "paragraph", text: direct });
        return;
      }

      const value = textOnly(node);
      if (value.length >= 28 && !isDecorativeText(value) && !genericLabels.has(value.toLowerCase())) {
        const looksHeading = value.length <= 70 && value.split(/\s+/).length <= 10 && !/[.!?]$/.test(value);
        push(looksHeading ? { type: "heading", level: 3, text: value.replace(/^\d{1,3}[.)]?\s*/, "") } : { type: "paragraph", text: value });
      }
    };

    [...root.children].forEach(walk);

    const imageInventory = [...root.querySelectorAll("img")].map(imageBlock).filter(Boolean);
    const text = textOnly(root);
    const words = text.split(/\s+/).filter(Boolean).length;
    const title = firstHeading;
    return {
      frameUrl: location.href,
      documentTitle: document.title,
      title,
      description,
      text,
      words,
      blocks,
      ctaCandidates,
      images: imageInventory,
      score: words
    };
  });
}

async function extractPage(browser, targetUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "en-US",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.route("**/*", async route => {
    if (["font"].includes(route.request().resourceType())) return route.abort();
    return route.continue();
  });

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35_000 });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await autoScroll(page);
    await page.waitForTimeout(1200);

    const expectedWords = expectedWordsFromUrl(targetUrl);
    const inspected = [];
    for (const frame of page.frames().slice(0, 24)) {
      try {
        const result = await inspectFrame(frame);
        const relevance = Math.max(titleRelevance(result.title, expectedWords), titleRelevance(result.documentTitle, expectedWords));
        const shellPenalty = /search this site|embedded files|skip to main content|google sites|report abuse/i.test(result.text) && result.words < 180 ? 1400 : 0;
        inspected.push({ ...result, relevance, score: result.words + relevance * 1000 + result.blocks.length * 8 - shellPenalty });
      } catch (error) {
        inspected.push({ frameUrl: frame.url(), words: 0, blocks: [], relevance: 0, score: -9999, error: error instanceof Error ? error.message : String(error) });
      }
    }

    inspected.sort((a, b) => b.score - a.score);
    let candidate = inspected.find(item => item.words >= 80 && item.blocks.length >= 5 && item.relevance >= 0.2);
    candidate ||= inspected.find(item => item.words >= 160 && item.blocks.length >= 5);
    candidate ||= inspected.find(item => item.words >= 80 && item.blocks.length >= 5);
    if (!candidate) throw new Error("Chromium rendered the page, but no frame contained enough structured article content.");

    let title = candidate.title || candidate.documentTitle || "";
    if (titleRelevance(title, expectedWords) < 0.2) title = titleCaseFromUrl(targetUrl);

    const bestCta = candidate.ctaCandidates.find(item => item.score >= 7) || null;
    const model = Schema.normalizeModel({
      blocks: candidate.blocks,
      cta: bestCta ? {
        enabled: true,
        eyebrow: "Current Offer",
        title: "Check the current product offer",
        description: "Review the live price, included features and refund terms before purchasing.",
        buttonLabel: bestCta.label,
        url: bestCta.url,
        note: "Pricing and terms may change.",
        placement: "after-content"
      } : { enabled: false }
    });

    const audit = Schema.audit(model);
    const thumbnail = candidate.images
      .filter(image => image.width >= 700 && image.height >= 300)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.src || candidate.images[0]?.src || "";

    return {
      status: "success",
      url: targetUrl,
      title,
      excerpt: excerptFromText(candidate.description || Schema.toPlainText(model)),
      thumbnail,
      contentModel: model,
      ctaCandidates: candidate.ctaCandidates.slice(0, 8),
      wordCount: audit.stats.words,
      sourceFrameUrl: candidate.frameUrl,
      layoutVersion: Schema.VERSION,
      importQuality: {
        score: Math.max(0, 100 - audit.issues.length * 20),
        warnings: audit.issues,
        stats: { ...audit.stats, candidateFrames: inspected.length }
      },
      diagnostics: inspected.slice(0, 10).map(item => ({
        frameUrl: item.frameUrl,
        title: item.title || item.documentTitle || "",
        words: item.words || 0,
        blocks: item.blocks?.length || 0,
        relevance: Number((item.relevance || 0).toFixed(3)),
        score: Number((item.score || 0).toFixed(1)),
        error: item.error || ""
      }))
    };
  } finally {
    await context.close();
  }
}

async function writeResult(requestId, result) {
  await fs.writeFile(path.join(RESULTS_DIR, `${requestId}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function cleanupOldResults(days = 14) {
  const cutoff = Date.now() - days * 86400000;
  let names = [];
  try { names = await fs.readdir(RESULTS_DIR); } catch { return; }
  for (const name of names.filter(item => item.endsWith(".json"))) {
    const file = path.join(RESULTS_DIR, name);
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      const timestamp = Date.parse(parsed.extractedAt || parsed.finishedAt || "");
      if (Number.isFinite(timestamp) && timestamp < cutoff) await fs.unlink(file);
    } catch {}
  }
}

async function main() {
  await ensureDirectories();
  const requestFiles = await listRequests();
  if (!requestFiles.length) { console.log("No pending Auto-fill requests."); return; }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const fileName of requestFiles) {
      const filePath = path.join(REQUESTS_DIR, fileName);
      let request = null;
      try {
        request = JSON.parse(await fs.readFile(filePath, "utf8"));
        const urls = Array.isArray(request.urls) ? request.urls : [request.url];
        const validUrls = urls.filter(url => /^https:\/\/sites\.google\.com\/view\//i.test(String(url || "")));
        if (!request.requestId || !validUrls.length) throw new Error("Invalid request file.");

        const items = [];
        for (const targetUrl of validUrls) {
          try {
            console.log(`Extracting structured content: ${targetUrl}`);
            const result = await extractPage(browser, targetUrl);
            result.requestId = request.requestId;
            result.extractedAt = new Date().toISOString();
            items.push(result);
            console.log(`Completed: ${result.wordCount} words, ${result.contentModel.blocks.length} blocks`);
          } catch (error) {
            items.push({ status: "error", url: targetUrl, error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() });
          }
        }

        await writeResult(request.requestId, validUrls.length === 1 ? items[0] : { status: "success", requestId: request.requestId, items, finishedAt: new Date().toISOString() });
      } catch (error) {
        const requestId = request?.requestId || path.basename(fileName, ".json");
        await writeResult(requestId, { status: "error", requestId, error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() });
      } finally {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
  await cleanupOldResults();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
