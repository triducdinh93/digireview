(function (global) {
  "use strict";

  const VERSION = "safe-flow-v1";

  const LEGACY_GRID_CLASSES = new Set([
    "media-gallery", "numbered-card-grid", "content-card-grid",
    "comparison-grid", "pricing-grid", "value-list"
  ]);

  const LEGACY_CARD_CLASSES = new Set([
    "media-card", "numbered-card", "content-card", "comparison-card",
    "pricing-card", "promo-card", "imported-highlight-box",
    "imported-pricing-box", "imported-step-card", "imported-feature-card"
  ]);

  const LEGACY_CLASSES = new Set([
    ...LEGACY_GRID_CLASSES,
    ...LEGACY_CARD_CLASSES,
    "media-caption", "media-caption-title", "pricing-card-head",
    "pricing-badge", "pricing-old", "pricing-current", "pricing-note",
    "pricing-title", "card-heading-row", "card-number", "card-title",
    "value-row", "value-label", "value-amount", "catalog-list",
    "directory-tree", "imported-cta", "imported-cta-wrap", "section-kicker",
    "inline-note", "is-positive", "is-negative", "is-featured",
    "imported-steps-grid", "imported-feature-grid", "imported-card-head",
    "imported-card-title", "imported-card-text", "step-badge", "feature-icon",
    "imported-highlight-icon", "imported-highlight-body", "pricing-save",
    "pricing-coupon", "imported-pricing-cta"
  ]);

  const GENERIC_LABELS = new Set([
    "pricing", "faq", "my verdict", "verdict", "risk free", "risk-free",
    "the shift", "cost comparison", "value breakdown", "what you download",
    "full library", "overview", "summary", "bonuses", "bonus", "features",
    "evaluation", "audience fit", "what you get", "ideal for",
    "product overview", "honest assessment", "watch before you buy"
  ]);

  const ACTION_PATTERN = /\b(?:get|buy|download|access|start|launch|try|claim|order|join|view|check|see|shop|unlock|grab|visit|learn more|register|sign up)\b/i;
  const NOTE_PATTERN = /^(?:✓|✔|✗|×|🔒|🛡|♾|💰|only\b|save\b|best for\b|included\b|one-time\b|launch offer\b|after launch\b|regular price\b|best value\b)/i;

  const cleanText = value => String(value?.textContent ?? value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const directChildren = node => [...(node?.children || [])];
  const unwrap = node => node.replaceWith(...node.childNodes);

  const normalizeHref = value => {
    try {
      const url = new URL(String(value || ""), global.location?.href || "https://example.invalid/");
      url.hash = "";
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(key => url.searchParams.delete(key));
      return url.href.replace(/\/$/, "");
    } catch {
      return String(value || "").trim();
    }
  };

  const isExternalHref = href => /^https?:\/\//i.test(String(href || ""));

  const isShortLabel = value => {
    const text = cleanText(value);
    if (!text || text.length > 72 || text.split(/\s+/).length > 10) return false;
    return !/[.!?]$/.test(text);
  };

  const normalizedLabel = value => cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  function stripLegacyPresentation(root) {
    root.querySelectorAll("*").forEach(node => {
      const classNames = [...node.classList];
      if (classNames.some(name => LEGACY_GRID_CLASSES.has(name))) {
        node.setAttribute("data-dr-legacy-grid", "true");
      }
      if (classNames.some(name => LEGACY_CARD_CLASSES.has(name))) {
        node.setAttribute("data-dr-legacy-card", "true");
      }
      classNames.forEach(name => {
        if (LEGACY_CLASSES.has(name) || /^(?:dr-|pricing-|comparison-|numbered-|content-card|media-gallery|promo-card|value-|card-)/.test(name)) {
          node.classList.remove(name);
        }
      });
      [...node.attributes].forEach(attribute => {
        if (attribute.name.startsWith("data-dr-") && !["data-dr-legacy-grid", "data-dr-legacy-card"].includes(attribute.name)) {
          node.removeAttribute(attribute.name);
        }
      });
    });
  }

  function linearizeLegacyLayouts(root) {
    [...root.querySelectorAll("[data-dr-legacy-grid]")].reverse().forEach(grid => {
      grid.removeAttribute("data-dr-legacy-grid");
      grid.classList.add("safe-flow-group");
    });

    root.querySelectorAll("[data-dr-legacy-card]").forEach(card => {
      card.removeAttribute("data-dr-legacy-card");
      card.classList.add("safe-flow-block");
    });
  }

  function normalizeMedia(root) {
    [...root.querySelectorAll("video,iframe,object,embed")].forEach(media => {
      media.classList.remove("content-embedded-media");
      media.classList.add("content-video");

      let wrap = media.closest(".content-video-wrap");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "content-video-wrap";
        media.replaceWith(wrap);
        wrap.appendChild(media);
      }

      let figure = wrap.closest("figure");
      if (!figure) {
        const parent = wrap.parentElement;
        const siblings = parent ? directChildren(parent) : [];
        const mayBeUnit = parent &&
          parent.querySelectorAll("video,iframe,object,embed").length === 1 &&
          siblings.length >= 1 && siblings.length <= 4 &&
          !parent.querySelector("h2,h3,table,ul,ol,img");

        figure = document.createElement("figure");
        figure.className = "safe-media-block";

        if (mayBeUnit) {
          parent.replaceWith(figure);
          figure.append(...siblings);
          wrap = figure.querySelector(".content-video-wrap") || wrap;
        } else {
          wrap.replaceWith(figure);
          figure.appendChild(wrap);
        }
      }

      figure.classList.add("safe-media-block");

      if (!figure.querySelector(":scope > figcaption")) {
        const captionNodes = directChildren(figure).filter(child => {
          if (child === wrap || child.tagName === "FIGCAPTION") return false;
          if (child.querySelector("video,iframe,object,embed,img,table,ul,ol,h2,h3")) return false;
          const text = cleanText(child);
          return text.length >= 3 && text.length <= 240;
        });
        if (captionNodes.length) {
          const caption = document.createElement("figcaption");
          caption.className = "safe-media-caption";
          captionNodes.forEach(node => caption.appendChild(node));
          figure.appendChild(caption);
        }
      }
    });
  }

  function normalizeTablesAndCode(root) {
    root.querySelectorAll("table").forEach(table => {
      if (table.parentElement?.classList.contains("table-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    root.querySelectorAll("pre").forEach(pre => {
      if (pre.parentElement?.classList.contains("code-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "code-scroll";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
    });
  }

  function normalizeSectionLabels(root) {
    const candidates = [...root.querySelectorAll("p,div,span")];

    candidates.forEach(node => {
      if (!node.isConnected || node.classList.contains("safe-media-caption")) return;
      if (node.querySelector("a,img,video,iframe,object,embed,table,ul,ol,h2,h3,h4,details,pre")) return;
      const text = cleanText(node);
      if (!isShortLabel(text)) return;

      const normalized = normalizedLabel(text);
      const next = node.nextElementSibling;
      const nextIsHeading = Boolean(next && /^H[2-4]$/.test(next.tagName));

      if (GENERIC_LABELS.has(normalized)) {
        node.remove();
        return;
      }

      if (nextIsHeading) {
        node.className = "section-kicker";
        return;
      }

      if (NOTE_PATTERN.test(text)) {
        node.className = "inline-note";
        return;
      }

      const words = text.split(/\s+/).length;
      if (words <= 3 && !/\d|\$/.test(text)) {
        node.remove();
      }
    });
  }

  function normalizeCtas(root, options = {}) {
    const links = [...root.querySelectorAll("a[href]")];
    links.forEach(link => {
      link.classList.remove("imported-cta");
      const href = link.getAttribute("href") || "";
      const label = cleanText(link);
      if (!isExternalHref(href) || link.querySelector("img") || !label) return;
      const affiliateMatch = options.affiliateUrl && normalizeHref(href) === normalizeHref(options.affiliateUrl);
      if (affiliateMatch || ACTION_PATTERN.test(label) || /\$\s*\d/.test(label)) {
        link.setAttribute("data-dr-cta-candidate", "true");
      }
    });

    const candidates = [...root.querySelectorAll("a[data-dr-cta-candidate]")];
    const unique = [];
    const seen = new Set();

    candidates.forEach(link => {
      const key = normalizeHref(link.getAttribute("href"));
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(link);
    });

    const keep = new Set();
    if (unique.length === 1) keep.add(unique[0]);
    if (unique.length >= 2) {
      keep.add(unique[0]);
      keep.add(unique[unique.length - 1]);
    }

    candidates.forEach(link => {
      link.removeAttribute("data-dr-cta-candidate");
      if (keep.has(link)) {
        link.classList.add("imported-cta");
        const parent = link.parentElement;
        if (parent && parent.children.length === 1 && cleanText(parent) === cleanText(link)) {
          parent.classList.add("imported-cta-wrap");
        }
        return;
      }

      const parent = link.parentElement;
      if (parent && parent.children.length === 1 && cleanText(parent) === cleanText(link)) {
        parent.remove();
      } else {
        link.remove();
      }
    });
  }

  function flattenFragileWrappers(root) {
    for (let pass = 0; pass < 5; pass += 1) {
      [...root.querySelectorAll("div,section")].reverse().forEach(node => {
        if (!node.isConnected) return;
        if (node.classList.contains("safe-flow-group") || node.classList.contains("safe-flow-block") ||
            node.classList.contains("content-video-wrap") || node.classList.contains("table-scroll") ||
            node.classList.contains("code-scroll") || node.classList.contains("imported-cta-wrap")) return;
        if (node.querySelector(":scope > h2, :scope > h3, :scope > h4, :scope > table, :scope > video, :scope > iframe, :scope > details, :scope > figure")) return;

        const directText = [...node.childNodes]
          .filter(child => child.nodeType === Node.TEXT_NODE)
          .map(child => child.textContent)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (!directText && node.children.length === 1) unwrap(node);
      });
    }
  }

  function removeEmptyNodes(root) {
    [...root.querySelectorAll("p,div,section,figure,blockquote,span")].reverse().forEach(node => {
      if (!node.isConnected) return;
      if (cleanText(node)) return;
      if (node.querySelector("img,video,iframe,object,embed,table,ul,ol,details,pre,hr")) return;
      node.remove();
    });
  }

  function wrapRoot(root) {
    let wrapper = root.querySelector(":scope > .dr-safe-flow-root");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "dr-safe-flow-root";
      while (root.firstChild) wrapper.appendChild(root.firstChild);
      root.appendChild(wrapper);
    }
    wrapper.setAttribute("data-dr-version", VERSION);
    return wrapper;
  }

  function normalize(root, options = {}) {
    if (!root) return { version: VERSION, changed: false, issues: ["Missing content root."] };

    stripLegacyPresentation(root);
    linearizeLegacyLayouts(root);
    normalizeMedia(root);
    normalizeTablesAndCode(root);
    normalizeSectionLabels(root);
    normalizeCtas(root, options);
    flattenFragileWrappers(root);
    removeEmptyNodes(root);
    const safeRoot = wrapRoot(root);
    const report = audit(safeRoot);

    return {
      version: VERSION,
      changed: true,
      root: safeRoot,
      issues: report.issues,
      metrics: report.metrics
    };
  }

  function audit(root) {
    const issues = [];
    if (!root) return { issues: ["Missing content root."], metrics: {} };

    const legacy = [...root.querySelectorAll("*")].filter(node =>
      [...node.classList].some(name => LEGACY_GRID_CLASSES.has(name) || LEGACY_CARD_CLASSES.has(name))
    );
    if (legacy.length) issues.push(`Legacy inferred layout classes remain: ${legacy.length}`);

    const ctas = [...root.querySelectorAll("a.imported-cta")];
    if (ctas.length > 2) issues.push(`Too many CTAs: ${ctas.length}`);
    if (ctas.some(link => !isExternalHref(link.getAttribute("href")))) issues.push("CTA without a valid external href.");

    const unwrappedMedia = [...root.querySelectorAll("video,iframe,object,embed")]
      .filter(media => !media.closest(".content-video-wrap"));
    if (unwrappedMedia.length) issues.push(`Unwrapped media: ${unwrappedMedia.length}`);

    const genericOrphans = [...root.querySelectorAll("p,div,span")]
      .filter(node => !node.querySelector("a,img,video,iframe,table,ul,ol,h2,h3,h4,details,pre"))
      .filter(node => GENERIC_LABELS.has(normalizedLabel(node)));
    if (genericOrphans.length) issues.push(`Generic orphan labels remain: ${genericOrphans.length}`);

    return {
      issues,
      metrics: {
        ctas: ctas.length,
        media: root.querySelectorAll("video,iframe,object,embed").length,
        tables: root.querySelectorAll("table").length,
        safeGroups: root.querySelectorAll(".safe-flow-group").length,
        safeBlocks: root.querySelectorAll(".safe-flow-block").length
      }
    };
  }

  global.DigiReviewContentNormalizer = { VERSION, normalize, audit };
})(globalThis);
