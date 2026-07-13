(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DigiReviewContentSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "dr-content-v1";
  const BLOCK_TYPES = new Set([
    "heading", "paragraph", "list", "image", "video", "audio",
    "table", "quote", "callout", "faq", "divider"
  ]);

  const text = value => String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const multiline = value => String(value == null ? "" : value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  const url = value => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw, typeof location !== "undefined" ? location.href : "https://example.com/");
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  };

  const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  const cleanListItem = value => text(value)
    .replace(/^[•●▪▫◦‣⁃*]+\s*/u, "")
    .replace(/^[✓✔☑✅✗✘❌×]\s*/u, "")
    .replace(/^\d{1,3}[.)]\s*/, "")
    .trim();

  const unique = values => [...new Set(values.filter(Boolean))];

  const normalizeBlock = input => {
    const block = input && typeof input === "object" ? input : {};
    const type = BLOCK_TYPES.has(block.type) ? block.type : "paragraph";

    if (type === "heading") {
      const value = text(block.text);
      if (!value) return null;
      return { type, level: Number(block.level) === 3 ? 3 : 2, text: value };
    }

    if (type === "paragraph") {
      const value = text(block.text);
      return value ? { type, text: value } : null;
    }

    if (type === "list") {
      const items = unique((Array.isArray(block.items) ? block.items : String(block.items || "").split("\n"))
        .map(cleanListItem)
        .filter(item => item.length >= 2));
      if (!items.length) return null;
      const style = ["bullet", "number", "check", "cross"].includes(block.style) ? block.style : "bullet";
      return { type, style, title: text(block.title), items };
    }

    if (type === "image") {
      const src = url(block.src);
      if (!src) return null;
      return {
        type,
        src,
        alt: text(block.alt),
        caption: text(block.caption),
        display: ["wide", "standard", "portrait"].includes(block.display) ? block.display : "wide"
      };
    }

    if (type === "video") {
      const src = url(block.src);
      if (!src) return null;
      return { type, src, poster: url(block.poster), caption: text(block.caption), provider: text(block.provider) };
    }

    if (type === "audio") {
      const src = url(block.src);
      if (!src) return null;
      return { type, src, caption: text(block.caption) };
    }

    if (type === "table") {
      const headers = (Array.isArray(block.headers) ? block.headers : []).map(text).filter(Boolean).slice(0, 12);
      const rows = (Array.isArray(block.rows) ? block.rows : [])
        .map(row => (Array.isArray(row) ? row : []).map(text).slice(0, Math.max(headers.length, 12)))
        .filter(row => row.some(Boolean))
        .slice(0, 100);
      if (!headers.length && !rows.length) return null;
      return { type, caption: text(block.caption), headers, rows };
    }

    if (type === "quote") {
      const value = text(block.text);
      return value ? { type, text: value, attribution: text(block.attribution) } : null;
    }

    if (type === "callout") {
      const value = text(block.text);
      const titleValue = text(block.title);
      if (!value && !titleValue) return null;
      const style = ["info", "success", "warning", "neutral"].includes(block.style) ? block.style : "info";
      return { type, style, title: titleValue, text: value };
    }

    if (type === "faq") {
      const items = (Array.isArray(block.items) ? block.items : [])
        .map(item => ({ question: text(item?.question), answer: text(item?.answer) }))
        .filter(item => item.question && item.answer)
        .slice(0, 50);
      return items.length ? { type, title: text(block.title) || "Frequently Asked Questions", items } : null;
    }

    return { type: "divider" };
  };

  const normalizeBlocks = input => {
    const source = Array.isArray(input) ? input : [];
    const output = [];
    const seenMedia = new Set();

    for (const item of source) {
      const block = normalizeBlock(item);
      if (!block) continue;

      if (["image", "video", "audio"].includes(block.type)) {
        if (seenMedia.has(block.src)) continue;
        seenMedia.add(block.src);
      }

      const previous = output[output.length - 1];
      if (block.type === "paragraph" && previous?.type === "paragraph") {
        if (previous.text === block.text) continue;
        if (previous.text.length < 110 && block.text.length < 260) {
          previous.text = `${previous.text} ${block.text}`.replace(/\s+/g, " ").trim();
          continue;
        }
      }
      if (block.type === "heading" && previous?.type === "heading" && previous.text.toLowerCase() === block.text.toLowerCase()) continue;
      if (block.type === "divider" && (!output.length || previous?.type === "divider")) continue;
      output.push(block);
    }

    while (output[0]?.type === "divider") output.shift();
    while (output[output.length - 1]?.type === "divider") output.pop();
    return output;
  };

  const normalizeCta = input => {
    const cta = input && typeof input === "object" ? input : {};
    const destination = url(cta.url);
    const enabled = Boolean(cta.enabled !== false && destination);
    return {
      enabled,
      eyebrow: text(cta.eyebrow) || "Current Offer",
      title: text(cta.title) || "Check the current product offer",
      description: text(cta.description) || "Review the live price, included features and refund terms before purchasing.",
      buttonLabel: text(cta.buttonLabel) || "View Current Offer",
      url: destination,
      note: text(cta.note) || "Pricing and terms may change.",
      placement: ["after-intro", "after-content"].includes(cta.placement) ? cta.placement : "after-content"
    };
  };

  const normalizeModel = input => {
    const model = input && typeof input === "object" ? input : {};
    return {
      version: VERSION,
      blocks: normalizeBlocks(model.blocks),
      cta: normalizeCta(model.cta)
    };
  };

  const isYouTube = value => /(?:youtube\.com\/embed\/|youtu\.be\/)/i.test(value);
  const isVimeo = value => /player\.vimeo\.com\/video\//i.test(value);

  const renderBlock = block => {
    if (block.type === "heading") return `<h${block.level} class="dr-heading dr-heading-${block.level}">${escapeHtml(block.text)}</h${block.level}>`;
    if (block.type === "paragraph") return `<p class="dr-paragraph">${escapeHtml(block.text)}</p>`;
    if (block.type === "list") {
      const tag = block.style === "number" ? "ol" : "ul";
      const titleHtml = block.title ? `<h3 class="dr-list-title">${escapeHtml(block.title)}</h3>` : "";
      return `<section class="dr-list-section dr-list-${block.style}">${titleHtml}<${tag}>${block.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}></section>`;
    }
    if (block.type === "image") {
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
      return `<figure class="dr-media dr-image dr-image-${block.display}"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || block.caption)}" loading="lazy" decoding="async">${caption}</figure>`;
    }
    if (block.type === "video") {
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
      const media = isYouTube(block.src) || isVimeo(block.src)
        ? `<iframe src="${escapeHtml(block.src)}" title="${escapeHtml(block.caption || "Embedded video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
        : `<video controls playsinline preload="metadata"${block.poster ? ` poster="${escapeHtml(block.poster)}"` : ""}><source src="${escapeHtml(block.src)}"></video>`;
      return `<figure class="dr-media dr-video"><div class="dr-video-frame">${media}</div>${caption}</figure>`;
    }
    if (block.type === "audio") {
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
      return `<figure class="dr-media dr-audio"><audio controls preload="metadata" src="${escapeHtml(block.src)}"></audio>${caption}</figure>`;
    }
    if (block.type === "table") {
      const head = block.headers.length ? `<thead><tr>${block.headers.map(cell => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>` : "";
      const body = `<tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      return `<figure class="dr-table-block">${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}<div class="dr-table-scroll"><table>${head}${body}</table></div></figure>`;
    }
    if (block.type === "quote") return `<blockquote class="dr-quote"><p>${escapeHtml(block.text)}</p>${block.attribution ? `<cite>${escapeHtml(block.attribution)}</cite>` : ""}</blockquote>`;
    if (block.type === "callout") return `<aside class="dr-callout dr-callout-${block.style}">${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ""}${block.text ? `<p>${escapeHtml(block.text)}</p>` : ""}</aside>`;
    if (block.type === "faq") return `<section class="dr-faq"><h2>${escapeHtml(block.title)}</h2>${block.items.map(item => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join("")}</section>`;
    return `<hr class="dr-divider">`;
  };

  const renderBlocks = input => {
    const blocks = normalizeBlocks(Array.isArray(input) ? input : input?.blocks);
    return `<div class="dr-canonical-content" data-dr-schema="${VERSION}">${blocks.map(renderBlock).join("")}</div>`;
  };

  const renderCta = input => {
    const cta = normalizeCta(input);
    if (!cta.enabled) return "";
    return `<section class="dr-standard-cta" data-dr-component="standard-cta"><span class="dr-cta-eyebrow">${escapeHtml(cta.eyebrow)}</span><h2>${escapeHtml(cta.title)}</h2><p>${escapeHtml(cta.description)}</p><a href="${escapeHtml(cta.url)}" target="_blank" rel="sponsored nofollow noopener">${escapeHtml(cta.buttonLabel)} <span aria-hidden="true">→</span></a><small>${escapeHtml(cta.note)}</small></section>`;
  };

  const toPlainText = input => {
    const model = normalizeModel(input);
    return model.blocks.map(block => {
      if (block.type === "heading" || block.type === "paragraph" || block.type === "quote" || block.type === "callout") return `${block.title || ""} ${block.text || ""}`;
      if (block.type === "list") return `${block.title || ""} ${block.items.join(" ")}`;
      if (block.type === "image" || block.type === "video" || block.type === "audio") return block.caption || block.alt || "";
      if (block.type === "table") return `${block.caption || ""} ${block.headers.join(" ")} ${block.rows.flat().join(" ")}`;
      if (block.type === "faq") return `${block.title} ${block.items.map(item => `${item.question} ${item.answer}`).join(" ")}`;
      return "";
    }).join(" ").replace(/\s+/g, " ").trim();
  };

  const audit = input => {
    const model = normalizeModel(input);
    const issues = [];
    if (model.blocks.length < 3) issues.push("The structured article contains fewer than three content blocks.");
    const words = toPlainText(model).split(/\s+/).filter(Boolean).length;
    if (words < 80) issues.push("The structured article contains fewer than 80 readable words.");
    const media = model.blocks.filter(block => ["image", "video", "audio"].includes(block.type));
    if (media.some(block => !block.src)) issues.push("A media block is missing its source URL.");
    if (model.cta.enabled && !model.cta.url) issues.push("The CTA is enabled without a valid URL.");
    return { valid: !issues.length, issues, stats: { blocks: model.blocks.length, words, media: media.length, cta: model.cta.enabled ? 1 : 0 } };
  };

  return {
    VERSION,
    BLOCK_TYPES: [...BLOCK_TYPES],
    text,
    multiline,
    url,
    escapeHtml,
    normalizeBlock,
    normalizeBlocks,
    normalizeCta,
    normalizeModel,
    renderBlocks,
    renderCta,
    toPlainText,
    audit
  };
});
