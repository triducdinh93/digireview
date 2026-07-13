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

async function validateCanonicalLayout(browser, html) {
  const css = await fs.readFile(path.resolve("style.css"), "utf8").catch(() => "");
  const normalizerSource = await fs.readFile(path.resolve("content-normalizer.js"), "utf8");
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ];
  const warnings = [];
  const measurements = {};

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.route("**/*", route => route.abort()).catch(() => {});
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main style="max-width:1180px;margin:auto"><div class="article-layout"><article class="article-main"><div id="article-content" class="article-content">${html}</div></article></div></main></body></html>`,
      { waitUntil: "domcontentloaded" }
    );
    await page.addScriptTag({ content: normalizerSource });
    await page.evaluate(() => {
      const content = document.getElementById("article-content");
      globalThis.DigiReviewContentNormalizer.normalize(content, { force: true });
    });

    const result = await page.evaluate(() => {
      const content = document.getElementById("article-content");
      const contentRect = content.getBoundingClientRect();
      const visible = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const allowed = element => Boolean(element.closest(".table-scroll,.code-scroll"));
      const overflow = [...content.querySelectorAll("*")]
        .filter(visible)
        .filter(element => !allowed(element))
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.right > contentRect.right + 3 || rect.left < contentRect.left - 3 || rect.width > contentRect.width + 3;
        })
        .slice(0, 12)
        .map(element => ({ tag: element.tagName, className: String(element.className || ""), width: Math.round(element.getBoundingClientRect().width) }));

      const genericLabels = new Set([
        "pricing", "faq", "my verdict", "verdict", "risk free", "risk-free", "the shift",
        "cost comparison", "value breakdown", "what you download", "full library", "overview",
        "summary", "bonuses", "bonus", "features", "evaluation", "audience fit", "what you get",
        "ideal for", "product overview", "honest assessment", "watch before you buy"
      ]);

      const orphanGenericLabels = [...content.querySelectorAll("p,div,span")]
        .filter(element => element.children.length === 0 && genericLabels.has(String(element.textContent || "").trim().toLowerCase()))
        .map(element => String(element.textContent || "").trim());

      const legacyLayout = [...content.querySelectorAll("*")].filter(element =>
        [...element.classList].some(name => /^(?:pricing-grid|pricing-card|comparison-grid|comparison-card|numbered-card-grid|content-card-grid|promo-card|media-gallery)$/.test(name))
      );

      const ctas = [...content.querySelectorAll("a.imported-cta")];
      const audit = globalThis.DigiReviewContentNormalizer.audit(content);

      return {
        overflow,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
        orphanGenericLabels,
        legacyLayoutCount: legacyLayout.length,
        rawVideoCount: [...content.querySelectorAll("video,iframe,object,embed")].filter(media => !media.closest(".content-video-wrap")).length,
        ctaCount: ctas.length,
        ctaWithoutHref: ctas.filter(link => !/^https?:\/\//i.test(link.getAttribute("href") || "")).length,
        auditIssues: audit.issues
      };
    });

    measurements[viewport.name] = result;
    if (result.pageOverflow || result.overflow.length) warnings.push(`${viewport.name}: content exceeded the article or viewport width.`);
    if (result.orphanGenericLabels.length) warnings.push(`${viewport.name}: generic section labels remained as orphan text.`);
    if (result.legacyLayoutCount) warnings.push(`${viewport.name}: legacy inferred layout classes remained after safe normalization.`);
    if (result.rawVideoCount) warnings.push(`${viewport.name}: video embed(s) are outside the responsive media wrapper.`);
    if (result.ctaCount > 2 || result.ctaWithoutHref) warnings.push(`${viewport.name}: CTA frequency or hyperlink validation failed.`);
    if (result.auditIssues.length) warnings.push(...result.auditIssues.map(issue => `${viewport.name}: ${issue}`));
    await context.close();
  }

  return { warnings: [...new Set(warnings)], measurements };
}

async function inspectFrame(frame) {
  return frame.evaluate(() => {
    const absolute = value => {
      try { return new URL(value, location.href).href; }
      catch { return ""; }
    };
    const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
    const directText = node => normalize([...node.childNodes]
      .filter(child => child.nodeType === Node.TEXT_NODE)
      .map(child => child.textContent)
      .join(" "));
    const unwrap = node => node.replaceWith(...node.childNodes);

    const directChildren = node => [...(node?.children || [])];
    const directHeading = node => directChildren(node).find(child => /^H[2-4]$/.test(child.tagName));
    const priceNumber = value => {
      const match = String(value || "").replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
      return match ? Number(match[1]) : null;
    };
    const actionPattern = /\b(?:get|buy|download|access|start|launch|try|claim|order|join|view|check|see|shop|unlock|grab|visit|learn more)\b/i;
    const isShortLabel = value => {
      const text = normalize(value);
      if (!text || text.length > 64 || text.split(/\s+/).length > 10) return false;
      return true;
    };

    const candidates = [
      ...document.querySelectorAll("article, main, [role='main'], .article, .post, .entry-content")
    ];
    if (document.body) candidates.push(document.body);

    let root = document.body;
    let longest = 0;
    for (const candidate of candidates) {
      const words = normalize(candidate.innerText || candidate.textContent || "")
        .split(/\s+/).filter(Boolean).length;
      if (words > longest) { longest = words; root = candidate; }
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
        images: [],
        warnings: ["No readable root element was found."],
        stats: {}
      };
    }

    const headings = [...root.querySelectorAll("h1, h2, h3")]
      .map(node => normalize(node.textContent)).filter(Boolean).slice(0, 60);
    const paragraphs = [...root.querySelectorAll("p")]
      .map(node => normalize(node.textContent)).filter(value => value.length >= 35).slice(0, 40);
    const documentTitle = normalize(document.title);
    const title = normalize(root.querySelector("h1")?.textContent) || headings[0] || documentTitle;
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
        const label = normalize(`${image.alt || ""} ${image.title || ""} ${url}`);
        let score = width * height;
        if (rect.top >= -100 && rect.top < 1600) score += 1_500_000;
        if (width >= 900 && height >= 350) score += 1_200_000;
        if (width / Math.max(height, 1) >= 1.25) score += 250_000;
        if (/product|fortune|toolkit|template|spotlight|whatsapp|superpower|side.?hustle|plr|hero|banner/i.test(label)) score += 800_000;
        if (/logo|icon|avatar|profile|favicon|google/i.test(label)) score -= 2_500_000;
        return { url, width, height, alt: image.alt || "", top: rect.top, index, score };
      })
      .filter(image => image.url && image.width >= 300 && image.height >= 160)
      .sort((a, b) => b.score - a.score);

    const thumbnail = images[0]?.url || "";
    const clone = root.cloneNode(true);

    clone.querySelectorAll(
      "script,style,noscript,nav,header,footer,form,input,textarea,select,button,dialog,template,svg,canvas,[aria-hidden='true']"
    ).forEach(node => node.remove());

    clone.querySelectorAll("iframe").forEach(iframe => {
      const src = absolute(iframe.getAttribute("src") || "");
      if (!/^https:\/\/(?:www\.)?(?:youtube\.com\/embed|youtube-nocookie\.com\/embed|player\.vimeo\.com\/video)\//i.test(src)) {
        iframe.remove();
        return;
      }
      iframe.setAttribute("src", src);
      iframe.setAttribute("loading", "lazy");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    });

    const allowedAttributes = {
      A: new Set(["href", "title"]),
      IMG: new Set(["src", "alt", "title"]),
      VIDEO: new Set(["poster", "controls", "preload", "playsinline"]),
      SOURCE: new Set(["src", "type"]),
      IFRAME: new Set(["src", "title", "loading", "allowfullscreen", "referrerpolicy"]),
      TD: new Set(["colspan", "rowspan"]),
      TH: new Set(["colspan", "rowspan", "scope"]),
      DETAILS: new Set(["open"]),
      OL: new Set(["start"])
    };

    clone.querySelectorAll("*").forEach(node => {
      const allowed = allowedAttributes[node.tagName] || new Set();
      [...node.attributes].forEach(attribute => {
        if (!allowed.has(attribute.name.toLowerCase())) node.removeAttribute(attribute.name);
      });
    });

    clone.querySelectorAll("font,center").forEach(unwrap);
    clone.querySelectorAll("b").forEach(node => { node.outerHTML = `<strong>${node.innerHTML}</strong>`; });
    clone.querySelectorAll("i").forEach(node => { node.outerHTML = `<em>${node.innerHTML}</em>`; });
    clone.querySelectorAll("h5,h6").forEach(node => { node.outerHTML = `<h4>${node.innerHTML}</h4>`; });
    clone.querySelectorAll("h1").forEach(heading => {
      if (normalize(heading.textContent).toLowerCase() === title.toLowerCase()) heading.remove();
      else heading.outerHTML = `<h2>${heading.innerHTML}</h2>`;
    });

    clone.querySelectorAll("a[href]").forEach(link => {
      const href = absolute(link.getAttribute("href"));
      if (!href || /^javascript:/i.test(href)) { unwrap(link); return; }
      link.setAttribute("href", href);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener sponsored nofollow");
    });

    clone.querySelectorAll("img").forEach(image => {
      const src = absolute(image.getAttribute("src") || "");
      if (!src) { image.remove(); return; }
      image.setAttribute("src", src);
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      image.removeAttribute("width");
      image.removeAttribute("height");
    });

    clone.querySelectorAll("video").forEach(video => {
      const poster = absolute(video.getAttribute("poster") || "");
      if (poster) video.setAttribute("poster", poster); else video.removeAttribute("poster");
      video.setAttribute("controls", "");
      video.setAttribute("preload", "metadata");
      video.setAttribute("playsinline", "");
      video.removeAttribute("autoplay");
      video.removeAttribute("loop");
      video.removeAttribute("muted");
      video.removeAttribute("width");
      video.removeAttribute("height");
      video.querySelectorAll("source[src]").forEach(source => {
        const src = absolute(source.getAttribute("src"));
        if (src) source.setAttribute("src", src); else source.remove();
      });
    });

    clone.querySelectorAll("section,div").forEach(node => {
      const text = normalize(node.textContent);
      const firstLabel = normalize(node.querySelector(":scope > h2, :scope > h3, :scope > h4, :scope > p, :scope > div")?.textContent);
      const localLinks = [...node.querySelectorAll("a[href^='#']")].length;
      if ((/^navigation$/i.test(firstLabel) || /^navigation\b/i.test(text)) && (localLinks >= 3 || node.querySelectorAll("a").length >= 4)) node.remove();
    });

    clone.querySelectorAll("h2,h3,h4,p,div,section").forEach(node => {
      const text = normalize(node.textContent);
      if (/^(table of contents|contents)$/i.test(text)) { node.remove(); return; }
      if (/^disclosure\s*:/i.test(text) || /^review snapshot$/i.test(text)) { node.remove(); return; }
    });

    if (thumbnail) {
      const firstMatchingHero = [...clone.querySelectorAll("img")]
        .find(image => absolute(image.getAttribute("src")) === thumbnail);
      const removable = firstMatchingHero?.closest("figure,picture");
      if (removable) removable.remove(); else firstMatchingHero?.remove();
    }

    clone.querySelectorAll("section").forEach(section => {
      section.classList.add("imported-section");
      const children = [...section.children];
      const headingIndex = children.findIndex(child => /^H[2-4]$/.test(child.tagName));
      if (headingIndex > 0) {
        const lead = children[0];
        const leadText = normalize(lead.textContent);
        if (leadText && leadText.length <= 45 && !lead.querySelector("img,video,table,ul,ol")) lead.classList.add("section-kicker");
      }
    });

    clone.querySelectorAll("details").forEach(details => {
      details.classList.add("imported-faq");
      const summary = details.querySelector(":scope > summary");
      if (!summary) {
        const generated = document.createElement("summary");
        generated.textContent = "More details";
        details.prepend(generated);
      }
    });

    clone.querySelectorAll("figure").forEach(figure => figure.classList.add("imported-figure"));

    clone.querySelectorAll("a[href]").forEach(link => {
      if (link.querySelector("img")) link.classList.add("content-media-link");
    });

    clone.querySelectorAll("img").forEach(image => {
      image.classList.add("content-media");
      if (!image.closest("figure") && !image.closest("a")) {
        const figure = document.createElement("figure");
        figure.className = "imported-figure";
        image.replaceWith(figure);
        figure.appendChild(image);
      }
    });

    clone.querySelectorAll("video,iframe,object,embed").forEach(media => {
      media.classList.add("content-video");
      if (!media.parentElement?.classList.contains("content-video-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "content-video-wrap";
        media.replaceWith(wrap);
        wrap.appendChild(media);
      }
    });

    clone.querySelectorAll("table").forEach(table => {
      if (table.parentElement?.classList.contains("table-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    clone.querySelectorAll("pre").forEach(pre => {
      if (pre.parentElement?.classList.contains("code-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "code-scroll";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
    });

    for (let pass = 0; pass < 4; pass += 1) {
      clone.querySelectorAll("div,section").forEach(node => {
        if (node.className || node.querySelector(":scope > h2, :scope > h3, :scope > h4") || directText(node)) return;
        if (node.children.length === 1 && !node.querySelector(":scope > table, :scope > video, :scope > iframe, :scope > details")) unwrap(node);
      });
    }

    clone.querySelectorAll("p,div,section,figure,blockquote").forEach(node => {
      if (!normalize(node.textContent) && !node.querySelector("img,video,iframe,table,ul,ol,details,pre")) node.remove();
    });

    const known = new Set([
      "P","H2","H3","H4","UL","OL","LI","A","IMG","FIGURE","FIGCAPTION","BLOCKQUOTE",
      "TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","DETAILS","SUMMARY","VIDEO","SOURCE",
      "IFRAME","PRE","CODE","STRONG","EM","HR","BR","DIV","SECTION"
    ]);
    const unsupported = [...new Set([...clone.querySelectorAll("*")].map(node => node.tagName).filter(tag => !known.has(tag)))];
    clone.querySelectorAll("*").forEach(node => {
      if (!known.has(node.tagName)) unwrap(node);
    });

    const maxDepth = node => node.children.length
      ? 1 + Math.max(...[...node.children].map(maxDepth))
      : 1;
    const orphanShortBlocks = [...clone.querySelectorAll("p,div")].filter(node => {
      const value = normalize(node.textContent);
      return value && value.length <= 70 && !node.className && !node.querySelector("a,img,video,iframe,table,ul,ol,h2,h3,h4,details,pre");
    }).length;
    const stats = {
      words: normalize(clone.textContent).split(/\s+/).filter(Boolean).length,
      headings: clone.querySelectorAll("h2,h3,h4").length,
      images: clone.querySelectorAll("img").length,
      videos: clone.querySelectorAll("video,iframe").length,
      tables: clone.querySelectorAll("table").length,
      faqs: clone.querySelectorAll("details").length,
      ctas: clone.querySelectorAll("a.imported-cta").length,
      mediaCards: clone.querySelectorAll(".media-card").length,
      cardGroups: clone.querySelectorAll(".numbered-card-grid,.content-card-grid,.comparison-grid").length,
      pricingGrids: clone.querySelectorAll(".pricing-grid").length,
      catalogs: clone.querySelectorAll(".catalog-list").length,
      directoryTrees: clone.querySelectorAll(".directory-tree").length,
      orphanShortBlocks,
      maxDepth: maxDepth(clone),
      unsupported
    };
    const warnings = [];
    if (stats.headings < 2) warnings.push("Very few semantic headings were detected.");
    if (stats.maxDepth > 14) warnings.push("The imported DOM is unusually deeply nested.");
    if (stats.videos > 6) warnings.push("The article contains many embedded videos; review mobile performance.");
    if (stats.images > 30) warnings.push("The article contains many images; review page weight and spacing.");
    if (stats.ctas > 8) warnings.push("Many repeated action links were detected; the front-end will deduplicate them.");
    if (stats.orphanShortBlocks > 5) warnings.push("Several short unlabeled blocks remain and should be reviewed before automatic publishing.");
    if (unsupported.length) warnings.push(`Unsupported elements were flattened: ${unsupported.join(", ")}.`);

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
      thumbnail,
      warnings,
      stats,
      layoutVersion: "semantic-source-v1"
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

    const layoutAudit = await validateCanonicalLayout(browser, candidate.html || "").catch(error => ({
      warnings: [`Layout validation could not run: ${error instanceof Error ? error.message : String(error)}`],
      measurements: {}
    }));
    const warnings = [...new Set([
      ...(Array.isArray(candidate.warnings) ? candidate.warnings : []),
      ...(layoutAudit.warnings || [])
    ])];
    const qualityScore = Math.max(0, 100
      - warnings.length * 8
      - (candidate.stats?.maxDepth > 14 ? 10 : 0)
      - (candidate.words < 250 ? 12 : 0));

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
      layoutVersion: candidate.layoutVersion || "semantic-source-v1",
      importQuality: {
        score: qualityScore,
        warnings,
        stats: {
          ...(candidate.stats || {}),
          layoutAudit: layoutAudit.measurements || {}
        }
      },
      extractedAt: new Date().toISOString(),
      diagnostics: inspected.slice(0, 12).map(item => ({
        frameUrl: item.frameUrl,
        title: item.title || item.documentTitle || "",
        words: item.words,
        relevance: Number((item.relevance || 0).toFixed(3)),
        score: Number((item.score || 0).toFixed(1)),
        warnings: item.warnings || [],
        stats: item.stats || {},
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

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { results[index] = await worker(values[index], index); }
      catch (error) {
        results[index] = {
          status: "error",
          url: values[index],
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString()
        };
      }
    }
  });
  await Promise.all(runners);
  return results;
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
        const urls = Array.isArray(request.urls) ? request.urls : [request.url];
        const validUrls = [...new Set(urls.map(value => String(value || "").trim()))]
          .filter(url => /^https:\/\/sites\.google\.com\/view\//i.test(url));
        if (!request.requestId || !validUrls.length) throw new Error("Invalid request file.");
        if (validUrls.length > 50) throw new Error("A batch can contain at most 50 URLs.");

        console.log(`Processing ${validUrls.length} Google Sites page(s)`);
        const items = await mapLimit(validUrls, 2, async url => {
          console.log(`Extracting ${url}`);
          const result = await extractPage(browser, url);
          console.log(`Completed ${url}: ${result.wordCount} words`);
          return result;
        });

        const succeeded = items.filter(item => item.status === "success").length;
        const result = validUrls.length === 1
          ? { ...items[0], requestId: request.requestId }
          : {
              status: succeeded ? "success" : "error",
              requestId: request.requestId,
              mode: "batch",
              total: items.length,
              succeeded,
              failed: items.length - succeeded,
              items,
              extractedAt: new Date().toISOString()
            };
        await writeResult(request.requestId, result);
      } catch (error) {
        const requestId = request?.requestId || path.basename(fileName, ".json");
        await writeResult(requestId, {
          status: "error",
          requestId,
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
