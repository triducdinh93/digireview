import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

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
    const slug = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    return slug
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
  const actual = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const actualSet = new Set(actual);
  const matches = expectedWords.filter(word => actualSet.has(word)).length;
  return expectedWords.length ? matches / expectedWords.length : 0;
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

const excerptFromText = text => {
  const cleaned = cleanText(text);
  if (cleaned.length <= 260) return cleaned;
  const cut = cleaned.slice(0, 260);
  const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return cut.slice(0, boundary > 170 ? boundary + 1 : 230).trim() + "…";
};

async function ensureDirectories() {
  await fs.mkdir(REQUESTS_DIR, { recursive: true });
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

async function listRequests() {
  try {
    return (await fs.readdir(REQUESTS_DIR))
      .filter(name => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const distance = 700;
      const timer = setInterval(() => {
        const height = Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0
        );
        window.scrollBy(0, distance);
        total += distance;
        if (total >= height || total > 14000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  }).catch(() => {});
}

async function inspectFrame(frame) {
  return frame.evaluate(() => {
    const absolute = value => {
      try {
        return new URL(value, location.href).href;
      } catch {
        return "";
      }
    };

    const normalize = value => String(value || "").replace(/\s+/g, " ").trim();

    const candidates = [
      ...document.querySelectorAll("article, main, [role='main'], .article, .post, .entry-content")
    ];

    if (document.body) candidates.push(document.body);

    let root = document.body;
    let longest = 0;

    for (const candidate of candidates) {
      const words = normalize(candidate.innerText || candidate.textContent || "")
        .split(/\s+/)
        .filter(Boolean).length;
      if (words > longest) {
        longest = words;
        root = candidate;
      }
    }

    if (!root) {
      return {
        frameUrl: location.href,
        documentTitle: document.title,
        title: "",
        description: "",
        text: "",
        html: "",
        headings: [],
        paragraphs: [],
        images: []
      };
    }

    const headings = [...root.querySelectorAll("h1, h2, h3")]
      .map(node => normalize(node.textContent))
      .filter(Boolean)
      .slice(0, 40);

    const paragraphs = [...root.querySelectorAll("p")]
      .map(node => normalize(node.textContent))
      .filter(value => value.length >= 35)
      .slice(0, 30);

    const documentTitle = normalize(document.title);
    const title =
      normalize(root.querySelector("h1")?.textContent) ||
      headings[0] ||
      documentTitle;

    const description =
      normalize(document.querySelector('meta[name="description"]')?.content) ||
      normalize(document.querySelector('meta[property="og:description"]')?.content) ||
      paragraphs.slice(0, 2).join(" ");

    const images = [...root.querySelectorAll("img")]
      .map((image, index) => {
        const rect = image.getBoundingClientRect();
        const url = absolute(image.currentSrc || image.getAttribute("src") || "");
        const width = image.naturalWidth || Math.round(rect.width) || 0;
        const height = image.naturalHeight || Math.round(rect.height) || 0;
        const label = normalize(
          `${image.alt || ""} ${image.title || ""} ${url}`
        );

        let score = width * height;
        if (rect.top >= -100 && rect.top < 1600) score += 1_500_000;
        if (width >= 900 && height >= 350) score += 1_200_000;
        if (width / Math.max(height, 1) >= 1.25) score += 250_000;
        if (/product|fortune|toolkit|template|spotlight|whatsapp|superpower|side.?hustle|plr|hero|banner/i.test(label)) {
          score += 800_000;
        }
        if (/logo|icon|avatar|profile|favicon|google/i.test(label)) {
          score -= 2_500_000;
        }

        return { url, width, height, alt: image.alt || "", top: rect.top, index, score };
      })
      .filter(image => image.url && image.width >= 360 && image.height >= 180)
      .sort((a, b) => b.score - a.score);

    const thumbnail = images[0]?.url || "";

    const clone = root.cloneNode(true);

    clone.querySelectorAll(
      "script, style, noscript, iframe, nav, header, footer, form, input, textarea, select, button, dialog, svg, canvas, [aria-hidden='true']"
    ).forEach(node => node.remove());

    clone.querySelectorAll("*").forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (
          name.startsWith("on") ||
          name === "style" ||
          name === "srcset" ||
          name === "class" ||
          name === "id"
        ) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    clone.querySelectorAll("a[href]").forEach(link => {
      const href = absolute(link.getAttribute("href"));
      if (href) link.setAttribute("href", href);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener sponsored nofollow");
    });

    clone.querySelectorAll("img").forEach(image => {
      const src = absolute(image.currentSrc || image.getAttribute("src") || "");
      if (!src) {
        image.remove();
        return;
      }
      image.setAttribute("src", src);
      image.setAttribute("loading", "lazy");
      image.removeAttribute("width");
      image.removeAttribute("height");
    });

    const firstH1 = clone.querySelector("h1");
    if (firstH1 && normalize(firstH1.textContent).toLowerCase() === title.toLowerCase()) {
      firstH1.remove();
    }

    if (thumbnail) {
      const firstMatchingHero = [...clone.querySelectorAll("img")]
        .find(image => absolute(image.getAttribute("src")) === thumbnail);
      firstMatchingHero?.closest("figure, picture, div")?.remove?.() || firstMatchingHero?.remove();
    }

    clone.querySelectorAll("p, div, section").forEach(node => {
      if (!normalize(node.textContent) && !node.querySelector("img, table, ul, ol, blockquote")) {
        node.remove();
      }
    });

    return {
      frameUrl: location.href,
      documentTitle,
      title,
      description,
      text: normalize(root.innerText || root.textContent),
      html: clone.innerHTML,
      headings,
      paragraphs,
      images,
      thumbnail
    };
  });
}

async function extractPage(browser, targetUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "Chrome/149.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.route("**/*", async route => {
    const type = route.request().resourceType();
    if (type === "font" || type === "media") {
      await route.abort();
      return;
    }
    await route.continue();
  });

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 35_000
    });

    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(4_000);
    await autoScroll(page);
    await page.waitForTimeout(1_500);

    const expectedWords = expectedWordsFromUrl(targetUrl);
    let inspected = [];

    for (const frame of page.frames().slice(0, 20)) {
      try {
        const item = await inspectFrame(frame);
        const words = wordCount(item.text);
        const relevance = Math.max(
          titleRelevance(item.title, expectedWords),
          ...item.headings.map(heading => titleRelevance(heading, expectedWords)),
          0
        );

        const shellPenalty =
          /search this site|embedded files|skip to main content|google sites|report abuse/i.test(item.text) &&
          words < 160
            ? 1200
            : 0;

        inspected.push({
          ...item,
          words,
          relevance,
          score: words + relevance * 900 - shellPenalty
        });
      } catch (error) {
        inspected.push({
          frameUrl: frame.url(),
          words: 0,
          relevance: 0,
          score: -9999,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    inspected.sort((a, b) => b.score - a.score);
    let candidate = inspected.find(item => item.words >= 45 && item.relevance >= 0.25);
    candidate ||= inspected.find(item => item.words >= 120);
    candidate ||= inspected.find(item => item.words >= 45);

    if (!candidate) {
      throw new Error(
        "Chromium rendered the page, but no frame contained a complete readable article."
      );
    }

    const candidateFrame = page.frames().find(frame => frame.url() === candidate.frameUrl);
    if (candidateFrame) {
      await candidateFrame.evaluate(() => window.scrollTo(0, document.body?.scrollHeight || 0)).catch(() => {});
      await page.waitForTimeout(1_000);
      const updated = await inspectFrame(candidateFrame).catch(() => null);
      if (updated && wordCount(updated.text) >= candidate.words) {
        candidate = {
          ...candidate,
          ...updated,
          words: wordCount(updated.text)
        };
      }
    }

    let title = candidate.title || "";
    const relevantHeading = candidate.headings?.find(
      heading => titleRelevance(heading, expectedWords) >= 0.45
    );
    if (relevantHeading) title = relevantHeading;

    if (titleRelevance(title, expectedWords) < 0.25) {
      title = titleCaseFromUrl(targetUrl);
    }

    const excerpt =
      excerptFromText(candidate.description) ||
      excerptFromText(candidate.paragraphs?.slice(0, 2).join(" ")) ||
      excerptFromText(candidate.text);

    return {
      status: "success",
      url: targetUrl,
      title,
      excerpt,
      html: candidate.html,
      text: candidate.text,
      thumbnail: candidate.thumbnail || candidate.images?.[0]?.url || "",
      images: (candidate.images || []).map(image => image.url).filter(Boolean),
      wordCount: candidate.words,
      sourceFrameUrl: candidate.frameUrl,
      extractedAt: new Date().toISOString(),
      diagnostics: inspected.slice(0, 12).map(item => ({
        frameUrl: item.frameUrl,
        title: item.title || item.documentTitle || "",
        words: item.words,
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
  const output = path.join(RESULTS_DIR, `${requestId}.json`);
  await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n", "utf8");
}

async function cleanupOldResults(days = 14) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let names = [];
  try {
    names = await fs.readdir(RESULTS_DIR);
  } catch {
    return;
  }

  for (const name of names.filter(item => item.endsWith(".json"))) {
    const file = path.join(RESULTS_DIR, name);
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      const timestamp = Date.parse(parsed.extractedAt || parsed.finishedAt || "");
      if (Number.isFinite(timestamp) && timestamp < cutoff) {
        await fs.unlink(file);
      }
    } catch {
      // Keep malformed files for debugging.
    }
  }
}

async function main() {
  await ensureDirectories();
  const requestFiles = await listRequests();

  if (!requestFiles.length) {
    console.log("No pending Auto-fill requests.");
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    for (const fileName of requestFiles) {
      const filePath = path.join(REQUESTS_DIR, fileName);
      let request = null;

      try {
        request = JSON.parse(await fs.readFile(filePath, "utf8"));
        if (!request.requestId || !/^https:\/\/sites\.google\.com\/view\//i.test(request.url || "")) {
          throw new Error("Invalid request file.");
        }

        console.log(`Extracting ${request.url}`);
        const result = await extractPage(browser, request.url);
        result.requestId = request.requestId;
        await writeResult(request.requestId, result);
        console.log(`Completed ${request.requestId}: ${result.wordCount} words`);
      } catch (error) {
        const requestId =
          request?.requestId ||
          path.basename(fileName, ".json");

        await writeResult(requestId, {
          status: "error",
          requestId,
          url: request?.url || "",
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString()
        });

        console.error(`Failed ${requestId}:`, error);
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
