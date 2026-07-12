(() => {
  "use strict";

  const data = window.BLOG_DATA || { site: {}, pages: {}, posts: [] };
  const site = data.site || {};
  const posts = Array.isArray(data.posts) ? data.posts.slice() : [];
  const pages = data.pages || {};
  const app = document.getElementById("app");
  const searchDialog = document.getElementById("search-dialog");
  const toast = document.getElementById("toast");
  let currentPage = 1;

  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));

  const formatDate = (dateString) => {
    try {
      return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${dateString}T00:00:00`));
    } catch (_) {
      return dateString || "";
    }
  };

  const readTime = (post) => {
    const text = String(post.content || "").replace(/<[^>]*>/g, " ").trim();
    const words = text ? text.split(/\s+/).length : 0;
    return Math.max(1, Math.ceil(words / 220));
  };

  const slugify = (text) => String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const postTimestamp = (post) => {
    const value = post.publishedAt || post.updatedAt || post.updated || `${post.date || "1970-01-01"}T00:00:00`;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const featuredTimestamp = (post) => {
    const value = post.featuredAt || post.publishedAt || post.updatedAt || post.updated || `${post.date || "1970-01-01"}T00:00:00`;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const sortedPosts = () => posts.slice().sort((a, b) => postTimestamp(b) - postTimestamp(a) || Number(b.id || 0) - Number(a.id || 0));
  const getPost = (slug) => posts.find(post => post.slug === slug);

  // Every article opens inside DigiReview. A Google Sites URL is retained as
  // the original content source and as analytics metadata.
  const hasInternalArticle = (post) => Boolean(String(post.content || "").trim());

  const postHref = (post) => `#post=${encodeURIComponent(post.slug)}`;

  const postTargetAttrs = (post) => post.externalUrl
    ? ` data-google-site-article="true" data-source-url="${escapeHtml(post.externalUrl)}" data-post-slug="${escapeHtml(post.slug)}" data-article-title="${escapeHtml(post.title)}"`
    : "";

  const postReadLabel = (post) => hasInternalArticle(post)
    ? `${readTime(post)} min read`
    : (post.externalUrl ? "Google Sites article" : `${readTime(post)} min read`);

  const trackEvent = (eventName, parameters = {}) => {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", eventName, parameters);
  };

  let firstRouteCompleted = false;
  const trackVirtualPageView = () => {
    if (!firstRouteCompleted) {
      firstRouteCompleted = true;
      return;
    }
    trackEvent("page_view", {
      page_title: document.title,
      page_location: location.href,
      page_path: `${location.pathname}${location.hash}`
    });
  };

  const noticeStripMarkup = () => {
    const items = sortedPosts().slice(0, 8);
    if (!items.length) return "";
    const links = items.map(post => `<a href="${postHref(post)}"${postTargetAttrs(post)}>${escapeHtml(post.title)}</a>`).join('<span class="notice-sep">•</span>');
    return `
      <section class="notice-strip" aria-label="Latest updates">
        <div class="container notice-strip-inner">
          <strong>Latest updates</strong>
          <div class="notice-marquee">
            <div class="notice-track">${links}<span class="notice-sep">•</span>${links}</div>
          </div>
        </div>
      </section>`;
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  const setPageTitle = (title, description = site.description || "") => {
    document.title = title ? `${title} | ${site.name || "DigiReview"}` : (site.name || "DigiReview");
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogTitle) ogTitle.setAttribute("content", title || site.name || "DigiReview");
    if (ogDescription) ogDescription.setAttribute("content", description);
  };

  const updateJsonLd = (post = null) => {
    document.getElementById("dynamic-jsonld")?.remove();
    const script = document.createElement("script");
    script.id = "dynamic-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(post ? {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt,
      image: [post.image],
      datePublished: post.date,
      dateModified: post.updated || post.date,
      author: { "@type": "Person", name: post.author || site.author?.name || "Editorial Team" },
      publisher: { "@type": "Organization", name: site.name || "DigiReview" },
      mainEntityOfPage: location.href
    } : {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: site.name || "DigiReview",
      description: site.description || "",
      url: location.href.split("#")[0]
    });
    document.head.appendChild(script);
  };

  const postCard = (post) => `
    <article class="post-card">
      <a href="${postHref(post)}"${postTargetAttrs(post)}><img class="card-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'"></a>
      <div class="card-body">
        <span class="category-pill">${escapeHtml(post.categories?.[0] || "Article")}</span>
        <h3><a href="${postHref(post)}"${postTargetAttrs(post)}>${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <div class="post-meta"><span>${formatDate(post.date)}</span><span>${postReadLabel(post)}</span></div>
        <a class="read-more" href="${postHref(post)}"${postTargetAttrs(post)}>${post.externalUrl ? "Open page" : "Read more"} →</a>
      </div>
    </article>`;

  const recentPostsMarkup = () => sortedPosts().slice(0, 5).map(post => `
    <a class="recent-item" href="${postHref(post)}"${postTargetAttrs(post)}>
      <img src="${escapeHtml(post.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'">
      <span><strong>${escapeHtml(post.title)}</strong><span>${formatDate(post.date)}</span></span>
    </a>`).join("");

  const categoryCounts = () => {
    const map = new Map();
    posts.forEach(post => (post.categories || []).forEach(category => map.set(category, (map.get(category) || 0) + 1)));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };

  const categoriesMarkup = () => categoryCounts().map(([category, count]) => `
    <a href="#category=${encodeURIComponent(category)}"><span>${escapeHtml(category)}</span><strong>${count}</strong></a>`).join("");

  const sidebarMarkup = () => `
    <aside class="sidebar" aria-label="Sidebar">
      <section class="sidebar-widget">
        <h2>Search</h2>
        <form class="sidebar-search" data-search-form>
          <label class="sr-only" for="sidebar-search-${Math.random().toString(36).slice(2)}">Search</label>
          <input name="q" type="search" placeholder="Search articles" required>
          <button type="submit">Go</button>
        </form>
      </section>
      <section class="sidebar-widget"><h2>Recent Posts</h2><div class="recent-list">${recentPostsMarkup()}</div></section>
      <section class="sidebar-widget"><h2>Categories</h2><div class="category-list">${categoriesMarkup()}</div></section>
      <section class="sidebar-widget">
        <h2>New reviews by email</h2>
        <p>Receive new reviews and practical guides.</p>
        <form class="newsletter-form" data-newsletter-form>
          <input name="email" type="email" placeholder="Email address" required>
          <button type="submit">Subscribe</button>
        </form>
      </section>
    </aside>`;

  const featuredMarkup = () => {
    const featured = posts
      .filter(post => post.featured)
      .sort((a, b) => featuredTimestamp(b) - featuredTimestamp(a) || postTimestamp(b) - postTimestamp(a))
      .slice(0, 3);
    const fallback = sortedPosts().slice(0, 3);
    const selected = featured.length >= 3 ? featured : fallback;
    if (!selected.length) return "";
    const [main, ...side] = selected;
    return `
      <div class="featured-grid">
        <article class="featured-card main">
          <a href="${postHref(main)}"${postTargetAttrs(main)}><img class="card-image" src="${escapeHtml(main.image)}" alt="${escapeHtml(main.title)}" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'"></a>
          <div class="card-body">
            <span class="category-pill">${escapeHtml(main.categories?.[0] || "Featured")}</span>
            <h2><a href="${postHref(main)}"${postTargetAttrs(main)}>${escapeHtml(main.title)}</a></h2>
            <p>${escapeHtml(main.excerpt)}</p>
            <div class="post-meta"><span>${formatDate(main.date)}</span><span>${postReadLabel(main)}</span></div>
          </div>
        </article>
        <div class="featured-side">
          ${side.map(post => `
            <article class="featured-card compact">
              <a href="${postHref(post)}"${postTargetAttrs(post)}><img class="card-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'"></a>
              <div class="card-body">
                <span class="category-pill">${escapeHtml(post.categories?.[0] || "Featured")}</span>
                <h3><a href="${postHref(post)}"${postTargetAttrs(post)}>${escapeHtml(post.title)}</a></h3>
                <p>${escapeHtml(post.excerpt)}</p>
                <div class="post-meta"><span>${formatDate(post.date)}</span></div>
              </div>
            </article>`).join("")}
        </div>
      </div>`;
  };

  const paginationMarkup = (total, page, perPage) => {
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) return "";
    let html = `<nav class="pagination" aria-label="Posts pagination">`;
    if (page > 1) html += `<button data-page="${page - 1}">← Previous</button>`;
    for (let i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
        html += `<button data-page="${i}" class="${i === page ? "active" : ""}" ${i === page ? 'aria-current="page"' : ""}>${i}</button>`;
      } else if (Math.abs(i - page) === 3) {
        html += `<button disabled>…</button>`;
      }
    }
    if (page < totalPages) html += `<button data-page="${page + 1}">Next →</button>`;
    return `${html}</nav>`;
  };

  const renderHome = () => {
    currentPage = 1;
    setPageTitle("", site.description);
    updateJsonLd();
    const latest = sortedPosts();
    const categories = categoryCounts().slice(0, 7).map(([name]) => name);
    app.innerHTML = `
      ${noticeStripMarkup()}
      <section class="section section-first">
        <div class="container">
          <div class="section-heading"><div><h2>Featured reviews</h2><p>Recent products, guides and buyer checks.</p></div><a class="section-link" href="#archive">View all posts →</a></div>
          ${featuredMarkup()}
        </div>
      </section>
      <section class="section">
        <div class="container content-with-sidebar">
          <div>
            <div class="section-heading"><div><h2>Latest articles</h2><p>Browse reviews and practical marketing guides.</p></div></div>
            <div class="filter-bar">${categories.map((category, index) => `<a class="filter-chip ${index === 0 ? "active" : ""}" href="#category=${encodeURIComponent(category)}">${escapeHtml(category)}</a>`).join("")}</div>
            <div class="posts-grid">${latest.slice(0, 6).map(postCard).join("")}</div>
            <div class="pagination"><a class="header-cta" href="#archive">Browse all articles</a></div>
          </div>
          ${sidebarMarkup()}
        </div>
      </section>`;
    bindDynamicEvents();
    scrollTop();
  };

  const renderArchive = ({ title = "All Articles", description = "Browse every review and practical guide.", filter = () => true, query = "" } = {}) => {
    const perPage = Number(site.postsPerPage) || 6;
    const filtered = sortedPosts().filter(filter);
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * perPage;
    const visible = filtered.slice(start, start + perPage);
    setPageTitle(title, description);
    updateJsonLd();
    app.innerHTML = `
      <header class="archive-header"><div class="container"><span class="eyebrow">DigiReview Journal</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div></header>
      <section class="section">
        <div class="container content-with-sidebar">
          <div>
            ${query ? `<p class="post-meta">${filtered.length} result${filtered.length === 1 ? "" : "s"} for “${escapeHtml(query)}”</p>` : ""}
            ${visible.length ? `<div class="posts-grid">${visible.map(postCard).join("")}</div>${paginationMarkup(filtered.length, currentPage, perPage)}` : `<div class="empty-state"><h2>No articles found</h2><p>Try another keyword or category.</p></div>`}
          </div>
          ${sidebarMarkup()}
        </div>
      </section>`;
    bindDynamicEvents(() => renderArchive({ title, description, filter, query }));
    scrollTop();
  };

  const renderCategory = (category) => {
    currentPage = 1;
    renderArchive({
      title: category,
      description: `Reviews and guides filed under ${category}.`,
      filter: post => (post.categories || []).some(item => item.toLowerCase() === category.toLowerCase())
    });
  };

  const renderSearch = (query) => {
    currentPage = 1;
    const q = query.trim().toLowerCase();
    renderArchive({
      title: "Search Results",
      description: "Search across titles, summaries, categories, tags and article content.",
      query,
      filter: post => [post.title, post.excerpt, ...(post.categories || []), ...(post.tags || []), String(post.content || "").replace(/<[^>]*>/g, " ")].join(" ").toLowerCase().includes(q)
    });
  };

  const renderReviewBox = (post) => {
    const review = post.review || {};
    const hasDetails = Number(post.rating || 0) > 0 ||
      [review.vendor, review.price, review.type, review.bestFor].some(value => String(value || "").trim());
    if (!hasDetails) return "";
    return `<section class="review-box" aria-label="Review summary">
      <div class="review-box-head"><h2>Review Snapshot</h2><div class="score">${Number(post.rating || 0).toFixed(1)}/10</div></div>
      <div class="review-facts">
        <div class="review-fact"><span>Vendor</span><strong>${escapeHtml(review.vendor || "Not specified")}</strong></div>
        <div class="review-fact"><span>Price</span><strong>${escapeHtml(review.price || "Check current offer")}</strong></div>
        <div class="review-fact"><span>Product type</span><strong>${escapeHtml(review.type || "Digital product")}</strong></div>
        <div class="review-fact"><span>Best for</span><strong>${escapeHtml(review.bestFor || "Verify product fit")}</strong></div>
      </div>
    </section>`;
  };

  const renderOriginalSource = (post) => post.externalUrl && hasInternalArticle(post) ? `
    <div class="original-source">
      <span>This article was imported from a published Google Sites page.</span>
      <a href="${escapeHtml(post.externalUrl)}" target="_blank" rel="noopener" data-google-site-source="true" data-post-slug="${escapeHtml(post.slug)}" data-article-title="${escapeHtml(post.title)}">View original page ↗</a>
    </div>` : "";

  const renderCta = (post) => post.affiliateUrl ? `<section class="cta-box">
    <h2>Check the current product offer</h2>
    <p>Review the live price, included features, refund conditions and optional upgrades before completing your purchase.</p>
    <a class="cta-button" href="${escapeHtml(post.affiliateUrl)}" target="_blank" rel="sponsored nofollow noopener">${escapeHtml(post.affiliateLabel || "Check Current Offer")}</a>
    <small class="cta-note">Pricing and product terms may change.</small>
  </section>` : "";

  const renderProsCons = (post) => {
    const pros = post.pros || [];
    const cons = post.cons || [];
    if (!pros.length && !cons.length) return "";
    return `<section class="pros-cons">
      <div class="pros"><h3>Pros</h3><ul>${pros.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="cons"><h3>Cons</h3><ul>${cons.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    </section>`;
  };

  const relatedPosts = (post) => posts
    .filter(candidate => candidate.slug !== post.slug)
    .map(candidate => ({
      post: candidate,
      score: (candidate.categories || []).filter(category => (post.categories || []).includes(category)).length * 2 +
             (candidate.tags || []).filter(tag => (post.tags || []).includes(tag)).length
    }))
    .sort((a, b) => b.score - a.score || new Date(b.post.date) - new Date(a.post.date))
    .slice(0, 3)
    .map(item => item.post);

  const viewKey = slug => `digireview-view-${slug}`;
  const incrementView = (slug) => {
    const key = viewKey(slug);
    const current = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(current));
    return current;
  };

  const commentsMarkup = (post) => {
    if (site.comments?.provider !== "giscus" || !site.comments.repo || !site.comments.repoId) {
      return `<div class="comments-placeholder"><strong>Comments are ready to connect.</strong><p>Open <code>posts.js</code> and add your Giscus repository values to enable a real comment system.</p></div>`;
    }
    return `<div id="giscus-container" data-post-slug="${escapeHtml(post.slug)}"></div>`;
  };

  const inlineImportedMarkdown = (value) => {
    let text = escapeHtml(String(value || ""));
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      '<a href="$2" target="_blank" rel="noopener sponsored nofollow">$1</a>');
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return text;
  };

  const normalizeImportedImage = (value) => String(value || "")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/%3D/gi, "=")
    .replace(/%26/gi, "&")
    .replace(/[),.;]+$/, "")
    .trim();

  const importedMarkdownToHtml = (markdown, articleTitle, heroImage) => {
    let source = String(markdown || "");
    source = source.replace(/^[\s\S]*?Markdown Content:\s*/i, "");
    source = source.split(/\n(?:#{1,3}\s*)?(?:Images|Buttons\s*&\s*Links|Links Summary):?\s*\n/i)[0];

    const noise = /^(search this site|embedded files|skip to main content|skip to navigation|google sites|report abuse|page details|page updated)$/i;
    const lines = source.split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let listType = "";
    let listItems = [];
    let skippedHero = false;

    const flushParagraph = () => {
      const value = paragraph.join(" ").trim();
      if (value) html.push(`<p>${inlineImportedMarkdown(value)}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!listType || !listItems.length) return;
      html.push(`<${listType}>${listItems.map(item => `<li>${inlineImportedMarkdown(item)}</li>`).join("")}</${listType}>`);
      listType = "";
      listItems = [];
    };

    const flushAll = () => {
      flushParagraph();
      flushList();
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        flushAll();
        continue;
      }

      const plain = String(line)
        .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/[`*_>#|~-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!plain || noise.test(plain)) continue;

      const imageMatch = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)$/i);
      if (imageMatch) {
        flushAll();
        const imageUrl = normalizeImportedImage(imageMatch[2]);
        if (!skippedHero && heroImage && normalizeImportedImage(heroImage) === imageUrl) {
          skippedHero = true;
          continue;
        }
        html.push(`<figure><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageMatch[1] || articleTitle || "")}" loading="lazy" onerror="this.closest('figure')?.remove()"></figure>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushAll();
        const level = Math.min(3, Math.max(2, heading[1].length));
        const headingText = heading[2].replace(/[`*_>#|~-]/g, " ").replace(/\s+/g, " ").trim();
        if (heading[1].length === 1 &&
            headingText.toLowerCase() === String(articleTitle || "").trim().toLowerCase()) {
          continue;
        }
        html.push(`<h${level}>${inlineImportedMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      const bullet = line.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        if (listType && listType !== "ul") flushList();
        listType = "ul";
        listItems.push(bullet[1]);
        continue;
      }

      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        flushParagraph();
        if (listType && listType !== "ol") flushList();
        listType = "ol";
        listItems.push(numbered[1]);
        continue;
      }

      const quote = line.match(/^>\s*(.+)$/);
      if (quote) {
        flushAll();
        html.push(`<blockquote>${inlineImportedMarkdown(quote[1])}</blockquote>`);
        continue;
      }

      if (/^[-*_]{3,}$/.test(line)) {
        flushAll();
        html.push("<hr>");
        continue;
      }

      if (listType) flushList();
      paragraph.push(line);
    }

    flushAll();
    return html.join("\n");
  };

  const loadGoogleSitesArticle = async (post) => {
    if (!post.externalUrl || hasInternalArticle(post)) return post.content || "";

    const cacheKey = `digireview-live-google-site-${post.slug}-${post.externalUrl}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      post.content = cached;
      return cached;
    }

    const response = await fetch(`https://r.jina.ai/${post.externalUrl}`, {
      cache: "no-store",
      headers: {
        "Accept": "text/plain",
        "X-No-Cache": "true",
        "X-Cache-Tolerance": "0",
        "X-With-Images-Summary": "true"
      }
    });

    if (!response.ok) throw new Error(`Google Sites reader returned HTTP ${response.status}`);
    const markdown = await response.text();
    const html = importedMarkdownToHtml(markdown, post.title, post.image);
    if (!html.trim()) throw new Error("No readable article content was returned.");

    post.content = html;
    sessionStorage.setItem(cacheKey, html);
    return html;
  };

  const renderArticleLoading = (post) => {
    setPageTitle(post.title, post.excerpt);
    app.innerHTML = `
      <section class="article-loading">
        <div class="container">
          <div class="loading-card">
            <span class="category-pill">${escapeHtml(post.categories?.[0] || "Article")}</span>
            <h1>${escapeHtml(post.title)}</h1>
            <p>Loading the published Google Sites article inside DigiReview…</p>
            <div class="loading-bar"><span></span></div>
          </div>
        </div>
      </section>`;
    scrollTop();
  };

  const renderPost = async (post) => {
    if (!post) return renderNotFound();

    if (post.externalUrl && !hasInternalArticle(post)) {
      renderArticleLoading(post);
      try {
        await loadGoogleSitesArticle(post);
      } catch (error) {
        post.content = `
          <div class="import-error">
            <h2>The article could not be loaded automatically</h2>
            <p>${escapeHtml(error.message)}</p>
            <p><a href="${escapeHtml(post.externalUrl)}" target="_blank" rel="noopener" data-google-site-source="true" data-post-slug="${escapeHtml(post.slug)}" data-article-title="${escapeHtml(post.title)}">Open the original Google Sites page ↗</a></p>
          </div>`;
      }
    }

    setPageTitle(post.title, post.excerpt);
    updateJsonLd(post);
    const views = incrementView(post.slug);
    const related = relatedPosts(post);
    app.innerHTML = `
      <article class="article-shell">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="#home">Home</a><span>›</span><a href="#category=${encodeURIComponent(post.categories?.[0] || "Articles")}">${escapeHtml(post.categories?.[0] || "Articles")}</a><span>›</span><span>${escapeHtml(post.title)}</span></nav>
          <div class="article-layout">
            <div>
              <header class="article-header">
                <span class="category-pill">${escapeHtml(post.categories?.[0] || "Review")}</span>
                <h1>${escapeHtml(post.title)}</h1>
                <p class="article-deck">${escapeHtml(post.excerpt)}</p>
                <div class="post-meta"><span>By ${escapeHtml(post.author || site.author?.name || "Editorial Team")}</span><span>${formatDate(post.date)}</span><span>${postReadLabel(post)}</span><span>${views} local views</span></div>
              </header>
              <img class="article-hero" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'">
              <div class="disclosure"><strong>Disclosure:</strong> ${escapeHtml(post.disclosure || "This article may contain affiliate links.")}</div>
              ${renderOriginalSource(post)}
              <div id="toc-container"></div>
              ${renderReviewBox(post)}
              ${renderCta(post)}
              <div class="article-content" id="article-content">${post.content || ""}</div>
              ${renderProsCons(post)}
              ${renderCta(post)}
              <div class="tag-row">${(post.tags || []).map(tag => `<a href="#search=${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join("")}</div>
              <section class="rating-box"><strong>Was this article helpful?</strong><div class="rating-stars" data-rating-slug="${escapeHtml(post.slug)}">${[1,2,3,4,5].map(star => `<button type="button" data-rating="${star}" aria-label="Rate ${star} out of 5">★</button>`).join("")}</div><small id="rating-message">Your rating is stored in this browser.</small></section>
              <section class="author-box"><img class="author-avatar" src="${escapeHtml(site.author?.avatar || post.image)}" alt="${escapeHtml(site.author?.name || post.author || "Author")}"><div><h2>About ${escapeHtml(site.author?.name || post.author || "the author")}</h2><p>${escapeHtml(site.author?.bio || "Editorial author profile.")}</p></div></section>
              <section class="comments-box"><h2>Comments</h2>${commentsMarkup(post)}</section>
              ${related.length ? `<section class="section"><div class="section-heading"><div><h2>Related posts</h2></div></div><div class="related-grid">${related.map(item => `<a class="related-card" href="${postHref(item)}"${postTargetAttrs(item)}><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'"><div><span class="category-pill">${escapeHtml(item.categories?.[0] || "Article")}</span><strong>${escapeHtml(item.title)}</strong></div></a>`).join("")}</div></section>` : ""}
            </div>
            <aside class="article-sidebar">
              <section class="sidebar-widget"><h2>Share this article</h2><div class="share-row"><button type="button" data-share="copy">Copy link</button><a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}">Facebook</a><a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(post.title)}">X</a><a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}">LinkedIn</a></div></section>
              <section class="sidebar-widget"><h2>In this article</h2><div id="sticky-toc"></div></section>
              <section class="sidebar-widget"><h2>Recent Posts</h2><div class="recent-list">${recentPostsMarkup()}</div></section>
            </aside>
          </div>
        </div>
      </article>`;
    buildToc();
    bindDynamicEvents();
    bindRating(post.slug);
    loadGiscus();
    scrollTop();

    if (post.externalUrl) {
      trackEvent("google_site_article_view", {
        article_slug: post.slug,
        article_title: post.title,
        source_url: post.externalUrl,
        display_mode: "internal_article"
      });
    }
  };

  const buildToc = () => {
    const content = document.getElementById("article-content");
    if (!content) return;
    const headings = [...content.querySelectorAll("h2, h3")];
    headings.forEach((heading, index) => {
      heading.id = heading.id || `${slugify(heading.textContent)}-${index + 1}`;
    });
    const items = headings.map(heading => `<li class="${heading.tagName === "H3" ? "sub" : ""}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.textContent)}</a></li>`).join("");
    const markup = headings.length ? `<nav class="toc" aria-label="Table of contents"><div class="toc-head"><h2>Table of Contents</h2><button type="button" data-toc-toggle>Hide</button></div><ol>${items}</ol></nav>` : "";
    const container = document.getElementById("toc-container");
    if (container) container.innerHTML = markup;
    const sticky = document.getElementById("sticky-toc");
    if (sticky) sticky.innerHTML = headings.length ? `<div class="category-list">${headings.filter(h => h.tagName === "H2").map(h => `<a href="#${escapeHtml(h.id)}"><span>${escapeHtml(h.textContent)}</span></a>`).join("")}</div>` : "<p>No sections found.</p>";
  };

  const loadGiscus = () => {
    const container = document.getElementById("giscus-container");
    if (!container || site.comments?.provider !== "giscus") return;
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", site.comments.repo);
    script.setAttribute("data-repo-id", site.comments.repoId);
    script.setAttribute("data-category", site.comments.category || "General");
    script.setAttribute("data-category-id", site.comments.categoryId || "");
    script.setAttribute("data-mapping", "specific");
    script.setAttribute("data-term", container.dataset.postSlug);
    script.setAttribute("data-strict", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute("data-theme", document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    script.setAttribute("data-lang", "en");
    script.crossOrigin = "anonymous";
    script.async = true;
    container.appendChild(script);
  };

  const bindRating = (slug) => {
    const wrap = document.querySelector(`[data-rating-slug="${CSS.escape(slug)}"]`);
    if (!wrap) return;
    const key = `digireview-rating-${slug}`;
    const paint = value => wrap.querySelectorAll("button").forEach(button => button.classList.toggle("active", Number(button.dataset.rating) <= value));
    paint(Number(localStorage.getItem(key) || 0));
    wrap.addEventListener("click", event => {
      const button = event.target.closest("button[data-rating]");
      if (!button) return;
      const value = Number(button.dataset.rating);
      localStorage.setItem(key, String(value));
      paint(value);
      showToast(`Thanks for rating this article ${value}/5.`);
    });
  };

  const renderPage = (slug) => {
    const page = pages[slug];
    if (!page) return renderNotFound();
    setPageTitle(page.title, String(page.content || "").replace(/<[^>]*>/g, " ").slice(0, 155));
    updateJsonLd();
    const contactForm = slug === "contact" ? `
      <form class="contact-form" id="contact-form">
        <label>Name<input name="name" required></label>
        <label>Email<input name="email" type="email" required></label>
        <label>Subject<input name="subject" required></label>
        <label>Message<textarea name="message" rows="7" required></textarea></label>
        <button type="submit">Send message</button>
      </form>` : "";
    app.innerHTML = `<section class="page-shell"><div class="container page-content"><span class="eyebrow">DigiReview Journal</span><h1>${escapeHtml(page.title)}</h1><div class="article-content">${page.content || ""}</div>${contactForm}</div></section>`;
    bindDynamicEvents();
    scrollTop();
  };

  const renderNotFound = () => {
    setPageTitle("Page Not Found", "The requested page could not be found.");
    app.innerHTML = `<section class="page-shell"><div class="container page-content"><span class="eyebrow">404</span><h1>Page not found</h1><p>The requested article or page does not exist.</p><p><a class="header-cta" href="#home">Return home</a></p></div></section>`;
    scrollTop();
  };

  const bindDynamicEvents = (rerender) => {
    document.querySelectorAll("[data-search-form]").forEach(form => form.addEventListener("submit", event => {
      event.preventDefault();
      const q = new FormData(form).get("q")?.toString().trim();
      if (q) location.hash = `search=${encodeURIComponent(q)}`;
    }));
    document.querySelectorAll("[data-newsletter-form]").forEach(form => form.addEventListener("submit", handleNewsletter));
    document.querySelectorAll(".pagination [data-page]").forEach(button => button.addEventListener("click", () => {
      currentPage = Number(button.dataset.page);
      rerender?.();
    }));
    document.querySelectorAll("[data-share='copy']").forEach(button => button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.href); showToast("Link copied."); }
      catch (_) { showToast("Copy failed. Copy the address from your browser."); }
    }));
    document.querySelectorAll("[data-toc-toggle]").forEach(button => button.addEventListener("click", () => {
      const list = button.closest(".toc")?.querySelector("ol");
      if (!list) return;
      list.hidden = !list.hidden;
      button.textContent = list.hidden ? "Show" : "Hide";
    }));
    document.querySelectorAll(".toc a, #sticky-toc a").forEach(link => link.addEventListener("click", event => {
      const targetId = link.getAttribute("href")?.replace(/^#/, "");
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    document.getElementById("contact-form")?.addEventListener("submit", handleContact);
  };

  const handleNewsletter = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email")?.toString().trim();
    if (!email) return;
    if (!site.newsletterEndpoint) {
      showToast("Add your Formspree or newsletter endpoint in posts.js.");
      return;
    }
    try {
      const response = await fetch(site.newsletterEndpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Subscription failed");
      form.reset();
      showToast("Subscription received.");
    } catch (_) { showToast("Could not submit. Check the configured endpoint."); }
  };

  const handleContact = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!site.contactEndpoint) {
      showToast("Add your contact form endpoint in posts.js.");
      return;
    }
    try {
      const response = await fetch(site.contactEndpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Contact request failed");
      form.reset();
      showToast("Message sent.");
    } catch (_) { showToast("Could not send. Check the configured endpoint."); }
  };

  const route = async () => {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    let result;

    if (!hash || hash === "home") {
      result = renderHome();
    } else if (hash === "archive") {
      currentPage = 1;
      result = renderArchive();
    } else {
      const [key, ...rest] = hash.split("=");
      const value = rest.join("=");

      if (key === "post") {
        result = await renderPost(getPost(value));
      } else if (key === "category") {
        result = renderCategory(value);
      } else if (key === "search") {
        result = renderSearch(value);
      } else if (key === "page") {
        result = renderPage(value);
      } else if (document.getElementById(hash)) {
        result = document.getElementById(hash).scrollIntoView({ behavior: "smooth" });
      } else {
        result = renderNotFound();
      }
    }

    trackVirtualPageView();
    return result;
  };

  const liveSearch = (query) => {
    const target = document.getElementById("live-search-results");
    const q = query.trim().toLowerCase();
    if (!q) { target.innerHTML = ""; return; }
    const results = sortedPosts().filter(post => [post.title, post.excerpt, ...(post.categories || []), ...(post.tags || [])].join(" ").toLowerCase().includes(q)).slice(0, 6);
    target.innerHTML = results.length ? results.map(post => `<a class="live-result" href="${postHref(post)}"${postTargetAttrs(post)}><img src="${escapeHtml(post.image)}" alt=""><span><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.categories?.[0] || "Article")}</span></span></a>`).join("") : `<p>No matching articles.</p>`;
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "auto" });

  const initChrome = () => {
    document.getElementById("brand-name").textContent = site.name || "DigiReview";
    document.getElementById("brand-tagline").textContent = site.tagline || "Reviews & Buying Guides";
    document.getElementById("footer-about").textContent = site.description || "Practical reviews and buying guides.";
    document.getElementById("current-year").textContent = new Date().getFullYear();

    const savedTheme = localStorage.getItem("digireview-theme");
    const theme = savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("digireview-theme", next);
      const iframe = document.querySelector("iframe.giscus-frame");
      iframe?.contentWindow?.postMessage({ giscus: { setConfig: { theme: next } } }, "https://giscus.app");
    });

    document.getElementById("menu-toggle").addEventListener("click", event => {
      const nav = document.getElementById("primary-nav");
      const isOpen = nav.classList.toggle("open");
      event.currentTarget.setAttribute("aria-expanded", String(isOpen));
    });

    const closeDropdowns = (except = null) => {
      document.querySelectorAll(".nav-dropdown.open").forEach(dropdown => {
        if (dropdown === except) return;
        dropdown.classList.remove("open");
        dropdown.querySelector(":scope > button")?.setAttribute("aria-expanded", "false");
      });
    };

    document.querySelectorAll(".nav-dropdown > button").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const dropdown = button.closest(".nav-dropdown");
      const willOpen = !dropdown.classList.contains("open");
      closeDropdowns(dropdown);
      dropdown.classList.toggle("open", willOpen);
      button.setAttribute("aria-expanded", String(willOpen));
    }));

    document.addEventListener("click", event => {
      const googleArticleLink = event.target.closest("a[data-google-site-article]");
      if (googleArticleLink) {
        trackEvent("google_site_article_click", {
          article_slug: googleArticleLink.dataset.postSlug || "",
          article_title: googleArticleLink.dataset.articleTitle || "",
          source_url: googleArticleLink.dataset.sourceUrl || "",
          destination: googleArticleLink.getAttribute("href") || ""
        });
      }

      const googleSourceLink = event.target.closest("a[data-google-site-source]");
      if (googleSourceLink) {
        trackEvent("google_site_source_click", {
          article_slug: googleSourceLink.dataset.postSlug || "",
          article_title: googleSourceLink.dataset.articleTitle || "",
          source_url: googleSourceLink.getAttribute("href") || ""
        });
      }

      const nav = document.getElementById("primary-nav");
      const menuToggle = document.getElementById("menu-toggle");
      const clickedInsideDropdown = event.target.closest(".nav-dropdown");

      if (!clickedInsideDropdown) closeDropdowns();

      if (event.target.closest("#primary-nav a")) {
        nav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        closeDropdowns();
        return;
      }

      if (window.innerWidth <= 760 &&
          !event.target.closest("#primary-nav") &&
          !event.target.closest("#menu-toggle")) {
        nav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        closeDropdowns();
      }
    });

    document.getElementById("open-search").addEventListener("click", () => {
      searchDialog.showModal();
      setTimeout(() => document.getElementById("global-search-input").focus(), 20);
    });
    document.getElementById("global-search-input").addEventListener("input", event => liveSearch(event.target.value));
    document.getElementById("global-search-form").addEventListener("submit", event => {
      event.preventDefault();
      const q = document.getElementById("global-search-input").value.trim();
      if (!q) return;
      searchDialog.close();
      location.hash = `search=${encodeURIComponent(q)}`;
    });
    document.getElementById("live-search-results").addEventListener("click", () => searchDialog.close());

    document.querySelectorAll("[data-newsletter-form]").forEach(form => form.addEventListener("submit", handleNewsletter));

    const backToTop = document.getElementById("back-to-top");
    backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
      backToTop.classList.toggle("show", window.scrollY > 700);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      document.getElementById("reading-progress").style.width = `${docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0}%`;

      // On mobile, scrolling always collapses the menu and any open category.
      if (window.innerWidth <= 760) {
        const nav = document.getElementById("primary-nav");
        const menuToggle = document.getElementById("menu-toggle");
        if (nav.classList.contains("open") || document.querySelector(".nav-dropdown.open")) {
          nav.classList.remove("open");
          menuToggle.setAttribute("aria-expanded", "false");
          closeDropdowns();
        }
      }
    }, { passive: true });

  };

  const currentPostsSignature = () => JSON.stringify(
    (window.BLOG_DATA?.posts || []).map(post => [
      post.id, post.slug, post.updatedAt, post.publishedAt, post.featuredAt, post.featured
    ])
  );

  const checkForPostUpdates = async () => {
    const repository = window.BLOG_REPOSITORY;
    if (!repository?.owner || !repository?.repo) return;
    try {
      const url = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${repository.branch || "main"}/posts.js?v=${Date.now()}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const source = await response.text();
      const sandbox = {};
      Function("window", source)(sandbox);
      const nextSignature = JSON.stringify(
        (sandbox.BLOG_DATA?.posts || []).map(post => [
          post.id, post.slug, post.updatedAt, post.publishedAt, post.featuredAt, post.featured
        ])
      );
      if (nextSignature && nextSignature !== currentPostsSignature()) {
        location.reload();
      }
    } catch (error) {
      console.debug("Post refresh check skipped", error);
    }
  };

  const startApp = () => {
    initChrome();
    route().catch(error => console.error("Initial route failed", error));
    window.setInterval(checkForPostUpdates, 45000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForPostUpdates();
    });
    window.addEventListener("focus", checkForPostUpdates);
  };

  window.addEventListener("hashchange", () => route().catch(error => console.error("Route failed", error)));
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();
