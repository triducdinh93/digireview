(function (global) {
  "use strict";

  const VERSION = "structural-v4";
  const COMPONENT_CLASSES = [
    "media-gallery", "media-card", "media-caption", "media-caption-title",
    "numbered-card-grid", "numbered-card", "content-card-grid", "content-card",
    "comparison-grid", "comparison-card", "pricing-grid", "pricing-card",
    "pricing-card-head", "pricing-badge", "pricing-old", "pricing-current",
    "pricing-note", "pricing-title", "card-heading-row", "card-number", "card-title",
    "value-list", "value-row", "value-label", "value-amount", "catalog-list",
    "directory-tree", "promo-card", "imported-cta", "imported-cta-wrap",
    "inline-note", "section-kicker", "is-positive", "is-negative", "is-featured"
  ];

  const GENERIC_KICKERS = new Set([
    "pricing", "faq", "my verdict", "verdict", "risk free", "risk-free",
    "the shift", "cost comparison", "value breakdown", "what you download",
    "full library", "overview", "summary", "bonuses", "bonus", "features",
    "evaluation", "audience fit", "what you get", "ideal for"
  ]);

  const ACTION_PATTERN = /\b(?:get|buy|download|access|start|launch|try|claim|order|join|view|check|see|shop|unlock|grab|visit|learn more|register|sign up)\b/i;
  const POSITIVE_PATTERN = /\b(?:pros?|benefits?|liked|perfect|ideal|best|included|with this|for you|recommended)\b/i;
  const NEGATIVE_PATTERN = /\b(?:cons?|limitations?|could be better|not ideal|not for|without|avoid|drawbacks?|downsides?)\b/i;
  const PRICE_PATTERN = /\$\s*\d+(?:[,.]\d+)?/;

  const cleanText = nodeOrValue => String(nodeOrValue?.textContent ?? nodeOrValue ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const directChildren = node => [...(node?.children || [])];
  const directHeading = node => directChildren(node).find(child => /^H[2-4]$/.test(child.tagName));
  const directList = node => directChildren(node).find(child => /^(UL|OL)$/.test(child.tagName));
  const directPriceNodes = node => directChildren(node).filter(child => {
    const text = cleanText(child);
    return text.length <= 28 && PRICE_PATTERN.test(text) && !child.querySelector("ul,ol,a,img,video,iframe,table");
  });

  const hasPrice = value => {
    return PRICE_PATTERN.test(String(value || ""));
  };

  const priceValue = value => {
    const match = String(value || "").replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };

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

  const componentOf = node => node?.getAttribute?.("data-dr-component") || "";
  const isClaimed = node => Boolean(node?.closest?.("[data-dr-component]"));

  const clearComponentClasses = root => {
    root.querySelectorAll("*").forEach(node => {
      COMPONENT_CLASSES.forEach(name => node.classList.remove(name));
      node.removeAttribute("data-dr-component");
    });
  };

  const claim = (node, type, classes = []) => {
    node.setAttribute("data-dr-component", type);
    classes.forEach(name => node.classList.add(name));
    return node;
  };

  const isShortLabel = value => {
    const text = cleanText(value);
    if (!text || text.length > 72 || text.split(/\s+/).length > 10) return false;
    return !/[.!?]$/.test(text);
  };

  const redundantWithHeading = (label, heading) => {
    const a = cleanText(label).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    const b = new Set(cleanText(heading).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
    if (!a.length) return true;
    return a.filter(word => b.has(word)).length / a.length >= 0.65;
  };

  const unwrap = node => node.replaceWith(...node.childNodes);

  function normalizeDirectoryTrees(root) {
    [...root.querySelectorAll("div")].forEach(node => {
      if (isClaimed(node) || node.closest("pre,.directory-tree") || node.querySelector("h2,h3,h4,table,ul,ol,img,video,iframe,a")) return;
      const raw = String(node.innerText || node.textContent || "").replace(/\r/g, "");
      const markers = (raw.match(/[├└│]|\.(?:mp4|mp3|png|jpe?g|txt|zip)\b/gi) || []).length;
      const lines = raw.split("\n").map(line => line.replace(/[ \t]+/g, " ").trimEnd()).filter(line => line.trim());
      if (markers < 4 || lines.length < 4) return;
      const pre = document.createElement("pre");
      pre.className = "directory-tree";
      pre.setAttribute("data-dr-component", "directory-tree");
      const code = document.createElement("code");
      code.textContent = lines.join("\n");
      pre.appendChild(code);
      node.replaceWith(pre);
    });
  }

  function normalizeCatalogs(root) {
    [...root.querySelectorAll("div")].forEach(container => {
      if (isClaimed(container)) return;
      const children = directChildren(container);
      if (children.length < 8 || children.length > 120) return;
      const parsed = children.map(child => {
        const first = child.firstElementChild;
        const number = cleanText(first);
        if (!first || first.tagName !== "SPAN" || !/^\d{1,3}$/.test(number)) return null;
        const copy = child.cloneNode(true);
        copy.firstElementChild?.remove();
        const label = cleanText(copy);
        return label ? { number: Number(number), label } : null;
      });
      if (parsed.some(item => !item)) return;
      const list = document.createElement("ol");
      claim(list, "catalog", ["catalog-list"]);
      if (parsed[0].number !== 1) list.start = parsed[0].number;
      parsed.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item.label;
        list.appendChild(li);
      });
      container.replaceWith(list);
    });
  }

  function mediaUnitFor(media) {
    let node = media.parentElement;
    while (node && node.parentElement) {
      const mediaCount = node.querySelectorAll("video,iframe,object,embed").length;
      const children = directChildren(node);
      if (mediaCount === 1 && children.length >= 2 && children.length <= 5 && !node.querySelector("h2,h3,table,ul,ol")) return node;
      if (node.matches("section,.imported-section") || mediaCount > 1) break;
      node = node.parentElement;
    }
    return media.parentElement;
  }

  function normalizeMedia(root) {
    const mediaElements = [...root.querySelectorAll("video,iframe,object,embed")];
    const handled = new Set();

    mediaElements.forEach(media => {
      if (handled.has(media)) return;
      let wrap = media.closest(".content-video-wrap");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "content-video-wrap";
        media.replaceWith(wrap);
        wrap.appendChild(media);
      }
      const unit = mediaUnitFor(wrap) || wrap;
      const originalParent = unit.parentElement;
      if (!originalParent) return;

      const card = document.createElement("figure");
      claim(card, "media", ["media-card"]);
      unit.replaceWith(card);
      card.appendChild(wrap);

      const candidates = directChildren(unit).filter(child => child !== wrap && cleanText(child) && !child.querySelector("video,iframe,object,embed,h2,h3,table,ul,ol,img"));
      if (unit !== wrap && candidates.length) {
        const caption = document.createElement("figcaption");
        caption.className = "media-caption";
        candidates.forEach(child => caption.appendChild(child));
        const strong = caption.querySelector("strong");
        if (strong) strong.classList.add("media-caption-title");
        card.appendChild(caption);
      }
      handled.add(media);
    });

    [...root.querySelectorAll("div,section")].forEach(container => {
      if (isClaimed(container)) return;
      const children = directChildren(container);
      if (children.length < 2 || children.length > 8) return;
      if (!children.every(child => componentOf(child) === "media")) return;
      claim(container, "media-gallery", ["media-gallery"]);
    });
  }

  function looksLikePricingCard(card) {
    if (!/^(DIV|SECTION|ARTICLE)$/.test(card.tagName)) return false;
    if (!directList(card)) return false;
    const prices = directPriceNodes(card);
    return prices.length >= 1;
  }

  function buildPricingCard(source) {
    const direct = directChildren(source);
    const titleNode = directHeading(source);
    const list = directList(source);
    const cta = direct.find(child => child.tagName === "A" && child.getAttribute("href"));
    const priceNodes = directPriceNodes(source);
    const priceItems = priceNodes.map(node => ({ node, text: cleanText(node), value: priceValue(cleanText(node)) })).filter(item => item.value !== null);
    const unique = [...new Map(priceItems.map(item => [item.text, item])).values()];
    const current = unique.length ? unique.reduce((best, item) => item.value < best.value ? item : best, unique[0]) : null;
    const old = unique.length > 1 ? unique.reduce((best, item) => item.value > best.value ? item : best, unique[0]) : null;

    const shortBlocks = direct.filter(child => {
      if (child === titleNode || child === list || child === cta || priceNodes.includes(child)) return false;
      if (!/^(DIV|P|SPAN)$/.test(child.tagName) || child.querySelector("ul,ol,a,img,video,iframe,table")) return false;
      return isShortLabel(child);
    });
    const texts = shortBlocks.map(node => cleanText(node));
    const badgeText = texts.find(text => /best value|recommended|popular|launch|regular price|after launch/i.test(text));
    const noteText = texts.find(text => text !== badgeText && !hasPrice(text));

    const card = document.createElement("article");
    claim(card, "pricing-card", ["pricing-card"]);
    const combined = cleanText(source);
    if (/best value|launch special|recommended|popular/i.test(combined) || (old && current && old.value > current.value)) card.classList.add("is-featured");

    const head = document.createElement("div");
    head.className = "pricing-card-head";
    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "pricing-badge";
      badge.textContent = badgeText;
      head.appendChild(badge);
    }
    if (old && current && old.value > current.value) {
      const oldPrice = document.createElement("span");
      oldPrice.className = "pricing-old";
      oldPrice.textContent = old.text;
      head.appendChild(oldPrice);
    }
    if (current) {
      const currentPrice = document.createElement("strong");
      currentPrice.className = "pricing-current";
      currentPrice.textContent = current.text;
      head.appendChild(currentPrice);
    }
    if (noteText) {
      const note = document.createElement("span");
      note.className = "pricing-note";
      note.textContent = noteText;
      head.appendChild(note);
    }
    card.appendChild(head);

    if (titleNode) {
      titleNode.className = "pricing-title";
      card.appendChild(titleNode);
    }
    if (list) card.appendChild(list);
    if (cta) {
      cta.className = "imported-cta";
      card.appendChild(cta);
    }
    direct.filter(child => ![titleNode, list, cta, ...priceNodes, ...shortBlocks].includes(child)).forEach(child => card.appendChild(child));
    return card;
  }

  function normalizePricing(root) {
    const candidates = [...root.querySelectorAll("div,section")].reverse();
    candidates.forEach(container => {
      if (isClaimed(container)) return;
      const children = directChildren(container);
      if (children.length < 2 || children.length > 4) return;
      if (!children.every(looksLikePricingCard)) return;
      const grid = document.createElement("div");
      claim(grid, "pricing-grid", ["pricing-grid"]);
      children.forEach(child => grid.appendChild(buildPricingCard(child)));
      container.replaceWith(grid);
    });
  }

  function normalizeComparisons(root) {
    [...root.querySelectorAll("div,section")].reverse().forEach(container => {
      if (isClaimed(container)) return;
      const children = directChildren(container);
      if (children.length !== 2) return;
      if (!children.every(child => /^(DIV|SECTION|ARTICLE)$/.test(child.tagName) && directHeading(child) && directList(child) && !looksLikePricingCard(child))) return;
      claim(container, "comparison-grid", ["comparison-grid"]);
      children.forEach(card => {
        claim(card, "comparison-card", ["comparison-card"]);
        const heading = directHeading(card);
        heading?.classList.add("card-title");
        const text = cleanText(card);
        const title = cleanText(heading);
        const positive = POSITIVE_PATTERN.test(title) || /✓|✔/.test(text);
        const negative = NEGATIVE_PATTERN.test(title) || /✗|×/.test(text);
        if (positive && !negative) card.classList.add("is-positive");
        if (negative && !positive) card.classList.add("is-negative");
      });
    });
  }

  function numberBadge(card, heading) {
    return directChildren(card).find(child => child !== heading && /^0?\d{1,2}$/.test(cleanText(child)) && isShortLabel(child));
  }

  function normalizeNumberedCards(root) {
    [...root.querySelectorAll("div,section")].reverse().forEach(container => {
      if (isClaimed(container)) return;
      const children = directChildren(container);
      if (children.length < 2 || children.length > 6) return;
      const info = children.map(card => {
        const heading = directHeading(card);
        const badge = heading ? numberBadge(card, heading) : null;
        const body = card.querySelector(":scope > p, :scope > ul, :scope > ol");
        return { card, heading, badge, body };
      });
      if (!info.every(item => item.heading && item.badge && item.body)) return;
      claim(container, "numbered-grid", ["numbered-card-grid"]);
      info.forEach(item => {
        claim(item.card, "numbered-card", ["numbered-card"]);
        const row = document.createElement("div");
        row.className = "card-heading-row";
        item.badge.className = "card-number";
        item.heading.className = "card-title";
        item.card.insertBefore(row, item.badge);
        row.appendChild(item.badge);
        row.appendChild(item.heading);
      });
    });
  }

  function normalizeContentCards(root) {
    [...root.querySelectorAll("div,section")].reverse().forEach(container => {
      if (isClaimed(container)) return;
      const children = directChildren(container);
      if (children.length < 2 || children.length > 8) return;
      const info = children.map(card => ({
        card,
        heading: directHeading(card),
        body: card.querySelector(":scope > p, :scope > ul, :scope > ol"),
        icon: directChildren(card).find(child => child.tagName === "SPAN" && cleanText(child).length <= 4)
      }));
      if (!info.every(item => item.heading && item.body && /^(DIV|SECTION|ARTICLE)$/.test(item.card.tagName))) return;
      claim(container, "content-grid", ["content-card-grid"]);
      info.forEach(item => {
        claim(item.card, "content-card", ["content-card"]);
        item.heading.className = "card-title";
        if (item.icon) {
          const row = document.createElement("div");
          row.className = "card-heading-row";
          item.icon.className = "card-icon";
          item.card.insertBefore(row, item.icon);
          row.appendChild(item.icon);
          row.appendChild(item.heading);
        }
      });
    });
  }

  function normalizeValueLists(root) {
    [...root.querySelectorAll("div")].reverse().forEach(container => {
      if (isClaimed(container)) return;
      const rows = directChildren(container);
      if (rows.length < 3 || rows.length > 12) return;
      const valid = rows.every(row => {
        if (row.querySelector("h2,h3,h4,ul,ol,table,img,video,iframe,a")) return false;
        const spans = directChildren(row).filter(child => child.tagName === "SPAN");
        return spans.length >= 2 && cleanText(spans[0]) && cleanText(spans[spans.length - 1]);
      });
      if (!valid) return;
      if (rows.filter(row => hasPrice(cleanText(row))).length < Math.ceil(rows.length / 2)) return;
      claim(container, "value-list", ["value-list"]);
      rows.forEach(row => {
        row.className = "value-row";
        const spans = directChildren(row).filter(child => child.tagName === "SPAN");
        spans[0].className = "value-label";
        spans[spans.length - 1].className = "value-amount";
      });
    });
  }

  function normalizeKickers(root) {
    [...root.querySelectorAll("section,.imported-section")].forEach(section => {
      const heading = directChildren(section).find(child => /^H2$/.test(child.tagName)) || section.querySelector(":scope > div > h2");
      if (!heading) return;
      const container = heading.parentElement;
      const before = directChildren(container).slice(0, directChildren(container).indexOf(heading));
      before.forEach(node => {
        const text = cleanText(node);
        if (!isShortLabel(text) || node.querySelector("a,img,video,iframe,table,ul,ol")) return;
        const normalized = text.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim();
        if (GENERIC_KICKERS.has(normalized) || redundantWithHeading(text, heading)) node.remove();
        else node.className = "section-kicker";
      });
    });
  }

  function normalizeOrphans(root) {
    [...root.querySelectorAll(".imported-section")].forEach(section => {
      directChildren(section).forEach(node => {
        if (!node.matches("p,div,span") || node.className || node.querySelector("a,img,video,iframe,table,ul,ol,h2,h3,h4,details,pre")) return;
        const text = cleanText(node);
        if (!text || text.length > 100) return;
        const normalized = text.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim();
        if (GENERIC_KICKERS.has(normalized)) { node.remove(); return; }
        if (/^(?:✓|✔|✗|×|🔒|🛡|♾)|\b(?:included|save|only|best for|total value|one-time|no upsell|guarantee|launch offer)\b/i.test(text)) node.className = "inline-note";
      });
    });
  }

  function normalizeCtas(root, options = {}) {
    root.querySelectorAll("a[href]").forEach(link => {
      link.classList.remove("imported-cta");
      if (link.querySelector("img")) return;
      const label = cleanText(link);
      const href = link.getAttribute("href") || "";
      const affiliateMatch = options.affiliateUrl && normalizeHref(href) === normalizeHref(options.affiliateUrl);
      if (ACTION_PATTERN.test(label) || hasPrice(label) || affiliateMatch) link.classList.add("imported-cta");
    });

    const links = [...root.querySelectorAll("a.imported-cta")];
    const groups = new Map();
    links.forEach(link => {
      const key = normalizeHref(link.getAttribute("href"));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(link);
    });

    const keep = new Set();
    groups.forEach(items => {
      keep.add(items[0]);
      const price = items.find(link => link.closest(".pricing-card"));
      if (price) keep.add(price);
      if (items.length > 1) keep.add(items[items.length - 1]);
    });

    const ordered = links.filter(link => keep.has(link));
    if (ordered.length > 3) {
      const final = new Set([ordered[0], ordered.find(link => link.closest(".pricing-card")), ordered[ordered.length - 1]].filter(Boolean));
      keep.clear();
      final.forEach(link => keep.add(link));
    }

    links.forEach(link => {
      if (!keep.has(link)) {
        const parent = link.parentElement;
        if (parent && parent.children.length === 1 && cleanText(parent) === cleanText(link)) parent.remove();
        else link.remove();
        return;
      }
      const parent = link.parentElement;
      if (parent && parent.children.length === 1 && cleanText(parent) === cleanText(link)) parent.classList.add("imported-cta-wrap");
    });

    [...root.querySelectorAll("section,.imported-section")].forEach(section => {
      if (!section.querySelector("a.imported-cta") || section.querySelector("table,video,iframe,img") || !section.querySelector("h2,h3")) return;
      if (cleanText(section).split(/\s+/).length <= 100) section.classList.add("promo-card");
    });
  }

  function wrapCanonicalRoot(root) {
    if (root.querySelector(":scope > .dr-canonical-root")) return root.querySelector(":scope > .dr-canonical-root");
    const wrapper = document.createElement("div");
    wrapper.className = "dr-canonical-root";
    wrapper.setAttribute("data-dr-version", VERSION);
    while (root.firstChild) wrapper.appendChild(root.firstChild);
    root.appendChild(wrapper);
    return wrapper;
  }

  function normalize(root, options = {}) {
    if (!root) return { version: VERSION, changed: false };
    const existing = root.querySelector(":scope > .dr-canonical-root[data-dr-version='" + VERSION + "']");
    if (existing && options.force !== true) return { version: VERSION, changed: false, root: existing };

    clearComponentClasses(root);
    normalizeDirectoryTrees(root);
    normalizeCatalogs(root);
    normalizeMedia(root);
    normalizePricing(root);
    normalizeComparisons(root);
    normalizeNumberedCards(root);
    normalizeContentCards(root);
    normalizeValueLists(root);
    normalizeKickers(root);
    normalizeOrphans(root);
    normalizeCtas(root, options);
    const canonicalRoot = wrapCanonicalRoot(root);
    return { version: VERSION, changed: true, root: canonicalRoot };
  }

  function audit(root) {
    const issues = [];
    if (!root) return { issues: ["Missing content root."], metrics: {} };
    const componentNodes = [...root.querySelectorAll("[data-dr-component]")];
    componentNodes.forEach(node => {
      const type = componentOf(node);
      const conflicting = ["pricing-grid", "comparison-grid", "numbered-card-grid", "content-card-grid", "media-gallery"]
        .filter(name => node.classList.contains(name));
      if (conflicting.length > 1) issues.push(`Mixed component classes on ${type}: ${conflicting.join(", ")}`);
    });
    const ctas = [...root.querySelectorAll("a.imported-cta")];
    if (ctas.length > 3) issues.push(`Too many CTAs: ${ctas.length}`);
    if (ctas.some(link => !link.getAttribute("href"))) issues.push("CTA without href.");
    const rawVideos = [...root.querySelectorAll("video,iframe,object,embed")].filter(media => !media.closest(".content-video-wrap"));
    if (rawVideos.length) issues.push(`Unwrapped media: ${rawVideos.length}`);
    const pricingConflicts = [...root.querySelectorAll(".pricing-grid.comparison-grid,.pricing-card.comparison-card")];
    if (pricingConflicts.length) issues.push(`Pricing/comparison conflict: ${pricingConflicts.length}`);
    return {
      issues,
      metrics: {
        ctas: ctas.length,
        mediaCards: root.querySelectorAll(".media-card").length,
        pricingGrids: root.querySelectorAll(".pricing-grid").length,
        comparisonGrids: root.querySelectorAll(".comparison-grid").length,
        contentGrids: root.querySelectorAll(".content-card-grid").length,
        numberedGrids: root.querySelectorAll(".numbered-card-grid").length
      }
    };
  }

  global.DigiReviewContentNormalizer = { VERSION, normalize, audit };
})(globalThis);
