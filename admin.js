(() => {
  "use strict";

  const Schema = window.DigiReviewContentSchema;
  if (!Schema) throw new Error("content-schema.js is required.");

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = Schema.escapeHtml;
  const status = $("#status");
  const form = $("#editor-form");
  const list = $("#post-list");
  const preview = $("#preview");
  const blocksEditor = $("#blocks-editor");
  const fileInput = $("#file-input");
  const GROUPS = {
    "Tips & Guides": ["How To", "Affiliate Marketing", "Digital Marketing", "SEO"],
    "Product Reviews": ["AI Tools", "Tools & Software", "WordPress", "Video Marketing", "SEO & Traffic", "PLR"],
    "Bonuses": ["Bonus Guides", "Templates & Resources", "Affiliate Bonuses"]
  };
  const STORAGE_KEY = "digireview-publisher-v23";
  const GH_KEY = "digireview-github-config";

  let data = structuredClone(window.BLOG_DATA || { site: {}, pages: {}, posts: [] });
  data.site ||= {};
  data.pages ||= {};
  data.posts = Array.isArray(data.posts) ? data.posts : [];
  let selectedId = data.posts[0]?.id || null;
  let currentBlocks = [];
  let pendingImportMeta = null;
  let autofillBusy = false;

  const slugify = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const plain = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const nowIso = () => new Date().toISOString();
  const selected = () => data.posts.find(post => Number(post.id) === Number(selectedId));
  const uniqueSlug = value => {
    const base = value || "post";
    let result = base;
    let count = 2;
    while (data.posts.some(post => post.slug === result && Number(post.id) !== Number(selectedId))) result = `${base}-${count++}`;
    return result;
  };

  const loadLocal = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.posts?.length) data = saved;
    } catch {}
    data.site ||= {};
    data.pages ||= {};
    data.posts = Array.isArray(data.posts) ? data.posts : [];
    if (!data.posts.some(post => Number(post.id) === Number(selectedId))) selectedId = data.posts[0]?.id || null;
  };

  const persistLocal = show => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (show) status.textContent = "Saved locally.";
  };

  const gh = () => ({
    owner: $("#gh-owner").value.trim(),
    repo: $("#gh-repo").value.trim(),
    branch: $("#gh-branch").value.trim() || "main",
    token: $("#gh-token").value.trim()
  });

  const loadGh = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(GH_KEY) || "{}");
      if (saved.owner) $("#gh-owner").value = saved.owner;
      if (saved.repo) $("#gh-repo").value = saved.repo;
      if (saved.branch) $("#gh-branch").value = saved.branch;
      if (saved.token) $("#gh-token").value = saved.token;
    } catch {}
  };

  const saveGh = () => {
    localStorage.setItem(GH_KEY, JSON.stringify(gh()));
    status.textContent = "GitHub settings saved in this browser.";
  };

  const headers = json => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${gh().token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(json ? { "Content-Type": "application/json" } : {})
  });

  const b64 = value => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    return btoa(binary);
  };
  const decode = value => new TextDecoder().decode(Uint8Array.from(atob(String(value || "").replace(/\s+/g, "")), character => character.charCodeAt(0)));
  const serialize = () => `/* Exported by DigiReview Publisher V23 */ window.BLOG_DATA = ${JSON.stringify(data, null, 2)};\n`;

  async function publish() {
    const config = gh();
    if (!(config.owner && config.repo && config.branch && config.token)) throw new Error("Complete GitHub publishing settings first.");
    const endpoint = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/posts.js`;
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(config.branch)}&t=${Date.now()}`, { headers: headers(), cache: "no-store" });
    let sha = "";
    if (existing.ok) sha = (await existing.json()).sha || "";
    else if (existing.status !== 404) throw new Error(`Could not read posts.js: HTTP ${existing.status}`);
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify({ message: `Publish DigiReview content ${new Date().toISOString()}`, content: b64(serialize()), branch: config.branch, ...(sha ? { sha } : {}) })
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Publish failed: HTTP ${response.status}`);
    status.textContent = "Published successfully. New visitors will receive the updated posts.js.";
  }

  const inferMain = value => {
    const text = String(value || "").toLowerCase();
    if (/bonus|oto|upsell|coupon/.test(text)) return "Bonuses";
    if (/review|software|tool|wordpress|video|plr|product/.test(text)) return "Product Reviews";
    return "Tips & Guides";
  };

  const inferSubs = (value, main) => {
    const text = String(value || "").toLowerCase();
    return (GROUPS[main] || []).filter(label => {
      const key = label.toLowerCase();
      if (key === "ai tools") return /\bai\b|chatgpt|automation/.test(text);
      if (key === "tools & software") return /software|tool|platform|app|gateway/.test(text);
      if (key === "wordpress") return /wordpress|woocommerce|plugin|theme/.test(text);
      if (key === "video marketing") return /video|youtube|reels|tiktok/.test(text);
      if (key === "seo & traffic") return /seo|traffic|backlink|keyword/.test(text);
      if (key === "plr") return /\bplr\b|private label rights/.test(text);
      if (key === "how to") return /how to|guide|tutorial|step/.test(text);
      if (key === "affiliate marketing") return /affiliate|commission|warriorplus/.test(text);
      if (key === "digital marketing") return /marketing|advertising|email|lead/.test(text);
      if (key === "seo") return /seo|search engine|keyword/.test(text);
      return text.includes(key);
    });
  };

  function renderPrimaryOptions() {
    const markup = Object.keys(GROUPS).map(group => `<option value="${esc(group)}">${esc(group)}</option>`).join("");
    $("#primary-category").innerHTML = markup;
    $("#bulk-primary").insertAdjacentHTML("beforeend", markup);
  }

  function renderSubs(selectedValues = []) {
    const main = $("#primary-category").value;
    $("#subcategory-grid").innerHTML = (GROUPS[main] || []).map(item => `<label class="check"><input type="checkbox" value="${esc(item)}"${selectedValues.includes(item) ? " checked" : ""}> ${esc(item)}</label>`).join("");
  }

  function renderList() {
    const ordered = data.posts.slice().sort((a, b) => Date.parse(b.updatedAt || b.publishedAt || b.date || 0) - Date.parse(a.updatedAt || a.publishedAt || a.date || 0));
    list.innerHTML = ordered.map(post => `<article class="post-item${Number(post.id) === Number(selectedId) ? " active" : ""}" data-id="${post.id}"><strong>${esc(post.title || "Untitled post")}</strong><span>${esc(post.date || "")} · ${esc(post.primaryCategory || post.categories?.[0] || "")}${post.featured ? " · Featured" : ""}${post.topRecommended ? " · Top recommendation" : ""}${post.contentModel ? " · Structured" : " · Legacy"}</span></article>`).join("");
  }

  function legacyHtmlToBlocks(html) {
    const holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    const blocks = [];
    holder.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,button").forEach(node => node.remove());
    const walk = node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      const value = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (/^H[1-4]$/.test(tag)) { if (value) blocks.push({ type: "heading", level: tag === "H3" || tag === "H4" ? 3 : 2, text: value }); return; }
      if (tag === "P") { if (value) blocks.push({ type: "paragraph", text: value }); return; }
      if (tag === "UL" || tag === "OL") { const items = [...node.querySelectorAll(":scope > li")].map(item => item.textContent.trim()).filter(Boolean); if (items.length) blocks.push({ type: "list", style: tag === "OL" ? "number" : "bullet", items }); return; }
      if (tag === "IMG") { const src = node.currentSrc || node.src; if (src) blocks.push({ type: "image", src, alt: node.alt || "", caption: node.closest("figure")?.querySelector("figcaption")?.textContent || "", display: "wide" }); return; }
      if (tag === "VIDEO" || tag === "IFRAME") { const src = node.currentSrc || node.src || node.querySelector("source")?.src; if (src) blocks.push({ type: "video", src, caption: node.closest("figure")?.querySelector("figcaption")?.textContent || node.title || "" }); return; }
      if (tag === "TABLE") { const rows = [...node.querySelectorAll("tr")].map(row => [...row.children].map(cell => cell.textContent.trim())); const hasHead = Boolean(node.querySelector("thead,th")); if (rows.length) blocks.push({ type: "table", headers: hasHead ? rows[0] : [], rows: hasHead ? rows.slice(1) : rows }); return; }
      if (tag === "DETAILS") { const question = node.querySelector("summary")?.textContent.trim(); const clone = node.cloneNode(true); clone.querySelector("summary")?.remove(); const answer = clone.textContent.trim(); if (question && answer) blocks.push({ type: "faq", items: [{ question, answer }] }); return; }
      [...node.children].forEach(walk);
    };
    [...holder.children].forEach(walk);
    return Schema.normalizeBlocks(blocks);
  }

  const blockTypes = ["heading", "paragraph", "list", "image", "video", "audio", "table", "quote", "callout", "faq", "divider"];
  const defaultBlock = type => ({
    heading: { type, level: 2, text: "Section heading" },
    paragraph: { type, text: "Write the paragraph here." },
    list: { type, style: "bullet", title: "", items: ["First item", "Second item"] },
    image: { type, src: "", alt: "", caption: "", display: "wide" },
    video: { type, src: "", poster: "", caption: "" },
    audio: { type, src: "", caption: "" },
    table: { type, caption: "", headers: ["Column 1", "Column 2"], rows: [["Value 1", "Value 2"]] },
    quote: { type, text: "", attribution: "" },
    callout: { type, style: "info", title: "", text: "" },
    faq: { type, title: "Frequently Asked Questions", items: [{ question: "Question", answer: "Answer" }] },
    divider: { type }
  }[type]);

  function toolbar() {
    $("#blocks-toolbar").innerHTML = blockTypes.map(type => `<button type="button" class="small" data-add-block="${type}">+ ${type}</button>`).join("");
  }

  function blockFields(block, index) {
    const field = (label, name, value = "", wide = false, textarea = false) => `<label class="${wide ? "wide" : ""}">${label}${textarea ? `<textarea rows="${name === "text" ? 4 : 3}" data-index="${index}" data-field="${name}">${esc(value)}</textarea>` : `<input data-index="${index}" data-field="${name}" value="${esc(value)}">`}</label>`;
    if (block.type === "heading") return `<label>Level<select data-index="${index}" data-field="level"><option value="2"${block.level === 2 ? " selected" : ""}>H2</option><option value="3"${block.level === 3 ? " selected" : ""}>H3</option></select></label>${field("Text", "text", block.text, true)}`;
    if (block.type === "paragraph") return field("Paragraph", "text", block.text, true, true);
    if (block.type === "list") return `<label>Style<select data-index="${index}" data-field="style">${["bullet", "number", "check", "cross"].map(style => `<option value="${style}"${block.style === style ? " selected" : ""}>${style}</option>`).join("")}</select></label>${field("Optional title", "title", block.title || "")}${field("One item per line", "itemsText", (block.items || []).join("\n"), true, true)}`;
    if (block.type === "image") return `${field("Image URL", "src", block.src, true)}${field("Alt text", "alt", block.alt)}${field("Caption", "caption", block.caption)}<label>Display<select data-index="${index}" data-field="display">${["wide", "standard", "portrait"].map(value => `<option value="${value}"${block.display === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>`;
    if (block.type === "video") return `${field("Video or embed URL", "src", block.src, true)}${field("Poster URL", "poster", block.poster || "")}${field("Caption", "caption", block.caption, true)}`;
    if (block.type === "audio") return `${field("Audio URL", "src", block.src, true)}${field("Caption", "caption", block.caption, true)}`;
    if (block.type === "table") return `${field("Caption", "caption", block.caption, true)}${field("Headers separated by |", "headersText", (block.headers || []).join(" | "), true)}${field("Rows: one row per line, cells separated by |", "rowsText", (block.rows || []).map(row => row.join(" | ")).join("\n"), true, true)}`;
    if (block.type === "quote") return `${field("Quote", "text", block.text, true, true)}${field("Attribution", "attribution", block.attribution, true)}`;
    if (block.type === "callout") return `<label>Style<select data-index="${index}" data-field="style">${["info", "success", "warning", "neutral"].map(value => `<option value="${value}"${block.style === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>${field("Title", "title", block.title)}${field("Text", "text", block.text, true, true)}`;
    if (block.type === "faq") return `${field("Section title", "title", block.title, true)}${field("One FAQ per line: Question || Answer", "faqText", (block.items || []).map(item => `${item.question} || ${item.answer}`).join("\n"), true, true)}`;
    return `<div class="wide muted">Horizontal divider</div>`;
  }

  function renderBlocksEditor() {
    if (!currentBlocks.length) {
      blocksEditor.innerHTML = `<div class="empty-blocks">No content blocks yet. Add blocks above or use Google Sites Auto-fill.</div>`;
      renderPreview();
      return;
    }
    blocksEditor.innerHTML = currentBlocks.map((block, index) => `<article class="block-card" data-block-index="${index}"><div class="block-head"><strong>${esc(block.type)}</strong><div class="block-actions"><button type="button" class="secondary small" data-block-action="up" data-index="${index}">↑</button><button type="button" class="secondary small" data-block-action="down" data-index="${index}">↓</button><button type="button" class="danger small" data-block-action="delete" data-index="${index}">Delete</button></div></div><div class="block-body">${blockFields(block, index)}</div></article>`).join("");
    renderPreview();
  }

  function collectBlockChanges(target) {
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (!Number.isInteger(index) || !field || !currentBlocks[index]) return;
    const value = target.value;
    if (field === "level") currentBlocks[index].level = Number(value);
    else if (field === "itemsText") currentBlocks[index].items = value.split(/\n/).map(item => item.trim()).filter(Boolean);
    else if (field === "headersText") currentBlocks[index].headers = value.split("|").map(item => item.trim()).filter(Boolean);
    else if (field === "rowsText") currentBlocks[index].rows = value.split(/\n/).map(row => row.split("|").map(cell => cell.trim())).filter(row => row.some(Boolean));
    else if (field === "faqText") currentBlocks[index].items = value.split(/\n/).map(line => { const [question, ...answer] = line.split("||"); return { question: question?.trim() || "", answer: answer.join("||").trim() }; }).filter(item => item.question && item.answer);
    else currentBlocks[index][field] = value;
    renderPreview();
  }

  function renderQuality(meta) {
    const box = $("#import-quality");
    if (!meta) { box.hidden = true; return; }
    const warnings = meta.warnings || [];
    box.hidden = false;
    box.className = `full quality${warnings.length ? "" : " good"}`;
    box.innerHTML = `<strong>${warnings.length ? "Review recommended" : "Structured import passed"}</strong><div>${esc(meta.layoutVersion || Schema.VERSION)} · ${Number(meta.score ?? 100)}/100</div>${warnings.length ? `<ul>${warnings.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}`;
  }

  function formCta() {
    return Schema.normalizeCta({
      enabled: form.elements.ctaEnabled.value === "true",
      placement: form.elements.ctaPlacement.value,
      eyebrow: form.elements.ctaEyebrow.value,
      title: form.elements.ctaTitle.value,
      description: form.elements.ctaDescription.value,
      buttonLabel: form.elements.ctaButtonLabel.value,
      url: form.elements.ctaUrl.value,
      note: form.elements.ctaNote.value
    });
  }

  function renderPreview() {
    const title = form.elements.title.value || "Article title";
    const excerpt = form.elements.excerpt.value || "Article excerpt";
    const image = form.elements.image.value || "thumbnail-placeholder.svg";
    const model = Schema.normalizeModel({ blocks: currentBlocks, cta: formCta() });
    preview.innerHTML = `<div class="preview-top"><span class="badge">${esc(form.elements.primaryCategory.value || "Article")}</span><h3>${esc(title)}</h3><p>${esc(excerpt)}</p></div><img src="${esc(image)}" onerror="this.src='thumbnail-placeholder.svg'"><div class="preview-content">${Schema.renderBlocks(model)}${Schema.renderCta(model.cta)}</div>`;
  }

  function fill(post) {
    if (!post) return;
    form.elements.id.value = post.id || "";
    form.elements.publishedAt.value = post.publishedAt || "";
    form.elements.featuredAt.value = post.featuredAt || "";
    form.elements.topRecommendedAt.value = post.topRecommendedAt || "";
    form.elements.sourceType.value = post.sourceType || (post.externalUrl ? "google-sites" : "standard");
    form.elements.date.value = post.date || new Date().toISOString().slice(0, 10);
    form.elements.externalUrl.value = post.externalUrl || "";
    form.elements.title.value = post.title || "";
    form.elements.slug.value = post.slug || "";
    form.elements.featured.value = String(Boolean(post.featured));
    form.elements.topRecommended.value = String(Boolean(post.topRecommended));
    form.elements.excerpt.value = post.excerpt || "";
    form.elements.image.value = post.image || "";
    form.elements.externalTarget.value = post.externalTarget || "top";
    form.elements.primaryCategory.value = post.primaryCategory && GROUPS[post.primaryCategory] ? post.primaryCategory : Object.keys(GROUPS)[0];
    renderSubs(post.categories || []);
    const cta = Schema.normalizeCta(post.cta || (post.affiliateUrl ? { enabled: true, url: post.affiliateUrl, buttonLabel: post.affiliateLabel } : { enabled: false }));
    form.elements.ctaEnabled.value = String(cta.enabled);
    form.elements.ctaPlacement.value = cta.placement;
    form.elements.ctaEyebrow.value = cta.eyebrow;
    form.elements.ctaTitle.value = cta.title;
    form.elements.ctaDescription.value = cta.description;
    form.elements.ctaButtonLabel.value = cta.buttonLabel;
    form.elements.ctaUrl.value = cta.url;
    form.elements.ctaNote.value = cta.note;
    currentBlocks = post.contentModel?.blocks?.length ? structuredClone(post.contentModel.blocks) : legacyHtmlToBlocks(post.content || "");
    pendingImportMeta = post.importMeta || null;
    renderQuality(pendingImportMeta);
    toggleSourceFields();
    renderBlocksEditor();
  }

  function postFromForm() {
    const previous = selected();
    const now = nowIso();
    const featured = form.elements.featured.value === "true";
    const topRecommended = form.elements.topRecommended.value === "true";
    const primaryCategory = form.elements.primaryCategory.value;
    const categories = [primaryCategory, ...$$("#subcategory-grid input:checked").map(input => input.value)];
    const model = Schema.normalizeModel({ blocks: currentBlocks, cta: formCta() });
    const id = Number(form.elements.id.value) || Date.now();
    return {
      ...(previous || {}),
      id,
      sourceType: form.elements.sourceType.value,
      slug: uniqueSlug(form.elements.slug.value.trim() || slugify(form.elements.title.value)),
      title: form.elements.title.value.trim(),
      excerpt: form.elements.excerpt.value.trim(),
      date: form.elements.date.value,
      updated: now.slice(0, 10),
      updatedAt: now,
      publishedAt: form.elements.publishedAt.value || now,
      featuredAt: featured ? (previous?.featuredAt || now) : "",
      topRecommendedAt: topRecommended ? (previous?.topRecommendedAt || now) : "",
      author: data.site.author?.name || previous?.author || "Nesi",
      primaryCategory,
      categories,
      tags: previous?.tags || [],
      image: form.elements.image.value.trim(),
      externalUrl: form.elements.externalUrl.value.trim(),
      externalTarget: form.elements.externalTarget.value,
      featured,
      topRecommended,
      rating: previous?.rating || 0,
      review: previous?.review || { vendor: "", price: "", type: "", bestFor: "" },
      affiliateUrl: model.cta.url,
      affiliateLabel: model.cta.buttonLabel,
      cta: model.cta,
      disclosure: previous?.disclosure || "",
      pros: previous?.pros || [],
      cons: previous?.cons || [],
      importMeta: pendingImportMeta,
      contentModel: model,
      content: Schema.renderBlocks(model)
    };
  }

  async function savePost(doPublish) {
    const post = postFromForm();
    const audit = Schema.audit(post.contentModel);
    if (!post.title || !post.slug || !post.date || !post.excerpt) { status.textContent = "Title, slug, date and excerpt are required."; return; }
    if (audit.stats.words < 20 || audit.stats.blocks < 2) { status.textContent = "Add at least two meaningful content blocks."; return; }
    if (post.sourceType === "google-sites" && !post.externalUrl) { status.textContent = "Google Sites URL is required for imported posts."; return; }
    const index = data.posts.findIndex(item => Number(item.id) === Number(post.id));
    if (index >= 0) data.posts[index] = post; else data.posts.push(post);
    selectedId = post.id;
    persistLocal(true);
    renderList();
    fill(post);
    if (doPublish) {
      try { await publish(); }
      catch (error) { status.textContent = `Saved locally, but publish failed: ${error.message}`; }
    }
  }

  function postFromResult(item, override = "auto") {
    const title = String(item.title || "").trim();
    const model = Schema.normalizeModel(item.contentModel || {});
    const plainText = Schema.toPlainText(model);
    const main = override === "auto" ? inferMain(`${title} ${item.excerpt || ""} ${plainText}`) : override;
    const subs = inferSubs(`${title} ${item.excerpt || ""} ${plainText}`, main);
    const now = nowIso();
    const quality = item.importQuality || { score: 100, warnings: [], stats: {} };
    return {
      id: Date.now() + Math.floor(Math.random() * 100000),
      sourceType: "google-sites",
      slug: uniqueSlug(slugify(title)),
      title,
      excerpt: item.excerpt || plainText.slice(0, 260),
      date: now.slice(0, 10), updated: now.slice(0, 10), updatedAt: now, publishedAt: now,
      featuredAt: "", topRecommendedAt: "", author: data.site.author?.name || "Nesi",
      primaryCategory: main, categories: [main, ...subs], tags: [], image: item.thumbnail || "",
      externalUrl: item.url || "", externalTarget: "top", featured: false, topRecommended: false,
      rating: 0, review: { vendor: "", price: "", type: "", bestFor: "" },
      affiliateUrl: model.cta.url, affiliateLabel: model.cta.buttonLabel, cta: model.cta,
      disclosure: "", pros: [], cons: [],
      importMeta: { layoutVersion: item.layoutVersion || Schema.VERSION, sourceFrameUrl: item.sourceFrameUrl || "", score: Number(quality.score ?? 100), warnings: quality.warnings || [], stats: quality.stats || {} },
      contentModel: model,
      content: Schema.renderBlocks(model)
    };
  }

  function upsertImportedPost(fresh) {
    const index = data.posts.findIndex(post => post.externalUrl && post.externalUrl === fresh.externalUrl);
    if (index < 0) { data.posts.push(fresh); return { post: fresh, replaced: false }; }
    const old = data.posts[index];
    const merged = {
      ...fresh,
      id: old.id,
      slug: old.slug || fresh.slug,
      featured: Boolean(old.featured), featuredAt: old.featuredAt || "",
      topRecommended: Boolean(old.topRecommended), topRecommendedAt: old.topRecommendedAt || "",
      primaryCategory: old.primaryCategory || fresh.primaryCategory,
      categories: Array.isArray(old.categories) && old.categories.length ? old.categories : fresh.categories,
      tags: Array.isArray(old.tags) ? old.tags : fresh.tags,
      author: old.author || fresh.author,
      publishedAt: old.publishedAt || fresh.publishedAt,
      cta: fresh.cta,
      affiliateUrl: fresh.cta.url,
      affiliateLabel: fresh.cta.buttonLabel
    };
    data.posts[index] = merged;
    return { post: merged, replaced: true };
  }

  async function createRequest(urls, mode) {
    const config = gh();
    if (!(config.owner && config.repo && config.token)) throw new Error("Complete GitHub settings first.");
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const requestPath = `autofill/requests/${requestId}.json`;
    const body = { requestId, mode, requestedAt: nowIso(), ...(urls.length === 1 ? { url: urls[0] } : { urls }) };
    const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${requestPath}`, {
      method: "PUT", headers: headers(true), body: JSON.stringify({ message: `Request structured Auto-fill: ${requestId}`, content: b64(JSON.stringify(body, null, 2)), branch: config.branch })
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Request failed: HTTP ${response.status}`);
    const pending = { id: requestId, urls, mode, owner: config.owner, repo: config.repo, branch: config.branch, createdAt: Date.now() };
    localStorage.setItem("digireview-autofill-pending", JSON.stringify(pending));
    return pending;
  }

  async function resultFor(pending) {
    const response = await fetch(`https://api.github.com/repos/${pending.owner}/${pending.repo}/contents/autofill/results/${pending.id}.json?ref=${encodeURIComponent(pending.branch)}&t=${Date.now()}`, { headers: headers(), cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Result read failed: HTTP ${response.status}`);
    return JSON.parse(decode((await response.json()).content));
  }

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function waitResult(pending) {
    const started = Date.now();
    while (Date.now() - started < 8 * 60 * 1000) {
      status.textContent = `GitHub Actions is extracting structured content… ${Math.floor((Date.now() - started) / 1000)}s`;
      const result = await resultFor(pending);
      if (result) { localStorage.removeItem("digireview-autofill-pending"); return result; }
      await sleep(6000);
    }
    throw new Error("No result after 8 minutes. Inspect the repository Actions tab.");
  }

  async function singleAuto() {
    if (autofillBusy) return;
    const sourceUrl = form.elements.externalUrl.value.trim();
    if (!/^https:\/\/sites\.google\.com\/view\//i.test(sourceUrl)) { status.textContent = "Paste a public Google Sites URL."; return; }
    autofillBusy = true;
    $("#auto-import").disabled = true;
    try {
      const result = await waitResult(await createRequest([sourceUrl], "single"));
      if (result.status !== "success") throw new Error(result.error || "Extraction failed.");
      const post = postFromResult(result);
      form.elements.title.value = post.title;
      form.elements.slug.value = post.slug;
      form.elements.excerpt.value = post.excerpt;
      form.elements.date.value = post.date;
      form.elements.image.value = post.image;
      form.elements.sourceType.value = "google-sites";
      form.elements.externalUrl.value = sourceUrl;
      form.elements.primaryCategory.value = post.primaryCategory;
      renderSubs(post.categories);
      const cta = post.cta;
      form.elements.ctaEnabled.value = String(cta.enabled);
      form.elements.ctaPlacement.value = cta.placement;
      form.elements.ctaEyebrow.value = cta.eyebrow;
      form.elements.ctaTitle.value = cta.title;
      form.elements.ctaDescription.value = cta.description;
      form.elements.ctaButtonLabel.value = cta.buttonLabel;
      form.elements.ctaUrl.value = cta.url;
      form.elements.ctaNote.value = cta.note;
      currentBlocks = structuredClone(post.contentModel.blocks);
      pendingImportMeta = post.importMeta;
      renderQuality(pendingImportMeta);
      renderBlocksEditor();
      status.textContent = `Auto-fill complete: ${result.wordCount || 0} words, ${currentBlocks.length} standard blocks. Source styling was discarded.`;
    } catch (error) {
      status.textContent = `Auto-fill failed: ${error.message}`;
    } finally {
      autofillBusy = false;
      $("#auto-import").disabled = false;
    }
  }

  async function bulkAuto() {
    const urls = [...new Set($("#bulk-urls").value.split(/\r?\n/).map(value => value.trim()).filter(value => /^https:\/\/sites\.google\.com\/view\//i.test(value)))];
    const existing = new Set(data.posts.map(post => post.externalUrl).filter(Boolean));
    const targets = $("#bulk-skip-existing").checked ? urls.filter(url => !existing.has(url)) : urls;
    if (!targets.length) { status.textContent = "No valid target URLs found."; return; }
    if (targets.length > 50) { status.textContent = "Maximum 50 URLs per batch."; return; }
    $("#bulk-progress").hidden = false;
    $("#start-bulk").disabled = true;
    $("#bulk-results").innerHTML = "";
    try {
      const result = await waitResult(await createRequest(targets, "batch"));
      const items = result.items || (result.status ? [result] : []);
      const override = $("#bulk-primary").value;
      let success = 0;
      for (const item of items) {
        if (item.status === "success") {
          const upserted = upsertImportedPost(postFromResult(item, override));
          success += 1;
          const warnings = upserted.post.importMeta?.warnings || [];
          $("#bulk-results").insertAdjacentHTML("beforeend", `<div class="bulk-item ${warnings.length ? "warn" : "ok"}"><strong>${esc(upserted.post.title)}</strong><div class="muted">${upserted.replaced ? "Updated" : "Imported"} · ${item.wordCount || 0} words · ${upserted.post.contentModel.blocks.length} blocks</div>${warnings.length ? `<div>${warnings.map(esc).join(" · ")}</div>` : ""}</div>`);
        } else {
          $("#bulk-results").insertAdjacentHTML("beforeend", `<div class="bulk-item error"><strong>${esc(item.url || "Unknown URL")}</strong><div>${esc(item.error || "Failed")}</div></div>`);
        }
      }
      persistLocal(false);
      renderList();
      status.textContent = `Bulk complete: ${success}/${items.length} structured imports.`;
      if (success && $("#bulk-publish").value === "true") await publish();
    } catch (error) {
      status.textContent = `Bulk Auto-fill failed: ${error.message}`;
    } finally {
      $("#bulk-progress").hidden = true;
      $("#start-bulk").disabled = false;
    }
  }

  function toggleSourceFields() {
    $$(".google-field").forEach(element => element.hidden = form.elements.sourceType.value !== "google-sites");
  }

  function loadSettings() {
    $("#site-name").value = data.site.name || "DigiReview";
    $("#site-tagline").value = data.site.tagline || "Reviews & Buying Guides";
    $("#site-description").value = data.site.description || "";
    $("#author-name").value = data.site.author?.name || "Nesi";
    $("#author-avatar").value = data.site.author?.avatar || "nesi-avatar.jpg";
    $("#author-bio").value = data.site.author?.bio || "";
    $("#about-title").value = data.pages.about?.title || "About Us";
    $("#about-content").value = data.pages.about?.content || "";
    $("#privacy-title").value = data.pages.privacy?.title || "Privacy Policy";
    $("#privacy-content").value = data.pages.privacy?.content || "";
    $("#contact-title").value = data.pages.contact?.title || "Contact Us";
    $("#contact-content").value = data.pages.contact?.content || "";
    $("#contact-email").value = data.site.contactEmail || "";
    $("#contact-endpoint").value = data.site.contactEndpoint || "";
  }

  async function saveSettings() {
    data.site = {
      ...data.site,
      name: $("#site-name").value.trim(), tagline: $("#site-tagline").value.trim(), description: $("#site-description").value.trim(),
      contactEmail: $("#contact-email").value.trim(), contactEndpoint: $("#contact-endpoint").value.trim(), categoryGroups: GROUPS,
      author: { name: $("#author-name").value.trim() || "Nesi", avatar: $("#author-avatar").value.trim() || "nesi-avatar.jpg", bio: $("#author-bio").value.trim() }
    };
    data.pages.about = { title: $("#about-title").value.trim() || "About Us", content: $("#about-content").value };
    data.pages.privacy = { title: $("#privacy-title").value.trim() || "Privacy Policy", content: $("#privacy-content").value };
    data.pages.contact = { title: $("#contact-title").value.trim() || "Contact Us", content: $("#contact-content").value };
    persistLocal(false);
    try { await publish(); } catch (error) { status.textContent = `Settings saved locally, publish failed: ${error.message}`; }
  }

  function newPost() {
    const now = nowIso();
    const post = {
      id: Date.now(), sourceType: "standard", slug: "", title: "", excerpt: "", date: now.slice(0, 10), publishedAt: now,
      featuredAt: "", topRecommendedAt: "", primaryCategory: "Tips & Guides", categories: ["Tips & Guides"], image: "", externalUrl: "",
      featured: false, topRecommended: false, cta: Schema.normalizeCta({ enabled: false }), contentModel: { version: Schema.VERSION, blocks: [] }, content: ""
    };
    data.posts.push(post);
    selectedId = post.id;
    renderList();
    fill(post);
    document.querySelector('[data-view="editor"]').click();
  }

  toolbar();
  loadLocal();
  loadGh();
  renderPrimaryOptions();
  renderList();
  if (selected()) fill(selected());
  loadSettings();
  status.textContent = `Ready. Structured schema: ${Schema.VERSION}. Contact destination: ${data.site.contactEndpoint || data.site.contactEmail || "not configured"}.`;

  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    $$(".view").forEach(view => view.hidden = true);
    $$(".tab").forEach(tab => tab.classList.remove("active"));
    $("#view-" + button.dataset.view).hidden = false;
    button.classList.add("active");
  }));

  list.addEventListener("click", event => {
    const row = event.target.closest("[data-id]");
    if (!row) return;
    selectedId = Number(row.dataset.id);
    renderList();
    fill(selected());
    document.querySelector('[data-view="editor"]').click();
  });

  $("#blocks-toolbar").addEventListener("click", event => {
    const type = event.target.dataset.addBlock;
    if (!type) return;
    currentBlocks.push(defaultBlock(type));
    renderBlocksEditor();
  });

  blocksEditor.addEventListener("input", event => collectBlockChanges(event.target));
  blocksEditor.addEventListener("change", event => collectBlockChanges(event.target));
  blocksEditor.addEventListener("click", event => {
    const button = event.target.closest("[data-block-action]");
    if (!button) return;
    const index = Number(button.dataset.index);
    if (button.dataset.blockAction === "delete") currentBlocks.splice(index, 1);
    if (button.dataset.blockAction === "up" && index > 0) [currentBlocks[index - 1], currentBlocks[index]] = [currentBlocks[index], currentBlocks[index - 1]];
    if (button.dataset.blockAction === "down" && index < currentBlocks.length - 1) [currentBlocks[index + 1], currentBlocks[index]] = [currentBlocks[index], currentBlocks[index + 1]];
    renderBlocksEditor();
  });

  form.addEventListener("input", event => { if (!event.target.closest("#blocks-editor")) renderPreview(); });
  form.addEventListener("submit", event => { event.preventDefault(); savePost(true); });
  $("#save-local-only").addEventListener("click", () => savePost(false));
  $("#save-local-top").addEventListener("click", () => savePost(false));
  $("#delete-post-top").addEventListener("click", () => $("#delete-post").click());
  $("#delete-post").addEventListener("click", async () => {
    if (!selectedId || !confirm("Delete this post?")) return;
    data.posts = data.posts.filter(post => Number(post.id) !== Number(selectedId));
    selectedId = data.posts[0]?.id || null;
    persistLocal(false); renderList(); if (selected()) fill(selected());
    try { await publish(); } catch (error) { status.textContent = error.message; }
  });
  $("#source-type").addEventListener("change", toggleSourceFields);
  $("#primary-category").addEventListener("change", () => { renderSubs([]); renderPreview(); });
  $("#auto-import").addEventListener("click", singleAuto);
  $("#start-bulk").addEventListener("click", bulkAuto);
  $("#load-existing-urls").addEventListener("click", () => {
    const urls = [...new Set(data.posts.map(post => String(post.externalUrl || "").trim()).filter(value => /^https:\/\/sites\.google\.com\/view\//i.test(value)))];
    $("#bulk-urls").value = urls.join("\n");
    $("#bulk-skip-existing").checked = false;
    status.textContent = `Loaded ${urls.length} existing Google Sites URLs. Start bulk import to replace legacy HTML with standard structured blocks.`;
  });
  $("#new-post").addEventListener("click", newPost);
  $("#save-gh-config").addEventListener("click", saveGh);
  $("#test-publish").addEventListener("click", async () => {
    try {
      saveGh();
      const config = gh();
      const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, { headers: headers(), cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      status.textContent = "GitHub connection is working.";
    } catch (error) { status.textContent = `GitHub test failed: ${error.message}`; }
  });
  $("#save-site-settings").addEventListener("click", saveSettings);
  $("#export-file").addEventListener("click", () => {
    const blob = new Blob([serialize()], { type: "application/javascript" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob); anchor.download = "posts.js"; anchor.click(); URL.revokeObjectURL(anchor.href);
  });
  $("#import-file").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    const source = await file.text();
    try {
      if (file.name.endsWith(".json")) data = JSON.parse(source);
      else {
        const match = source.match(/window\.BLOG_DATA\s*=\s*([\s\S]*);\s*$/);
        if (!match) throw new Error("BLOG_DATA not found.");
        data = Function(`return (${match[1]})`)();
      }
      selectedId = data.posts[0]?.id || null;
      persistLocal(false); renderList(); if (selected()) fill(selected()); loadSettings();
      status.textContent = "Imported successfully.";
    } catch (error) { status.textContent = `Import failed: ${error.message}`; }
  });
})();
