(() => {
  "use strict";

  const data = window.BLOG_DATA || { site: {}, pages: {}, posts: [] };
  const site = data.site || {};
  const posts = Array.isArray(data.posts) ? data.posts.slice() : [];
  const pages = data.pages || {};
  const app = document.getElementById("app");
  const searchDialog = document.getElementById("search-dialog");
  const toast = document.getElementById("toast");
  const services = window.DIGIREVIEW_SERVICES || {};
  const NESI_AUTHOR = {
    name: site.author?.name || "Nesi",
    avatar: site.author?.avatar || "nesi-avatar.jpg",
    bio: site.author?.bio || "I thoughtfully review digital products so you can understand what they offer, where their limits are, and whether they fit a real workflow. I aim to share clear, calm, and practical guidance, while encouraging every reader to verify current pricing and terms before making a decision."
  };
  const CATEGORY_GROUPS = site.categoryGroups || {
    "Tips & Guides": ["How To", "Affiliate Marketing", "Digital Marketing", "SEO"],
    "Product Reviews": ["AI Tools", "Tools & Software", "WordPress", "Video Marketing", "SEO & Traffic", "PLR"],
    "Bonuses": ["Bonus Guides", "Templates & Resources", "Affiliate Bonuses"]
  };
  const primaryCategoryFor = (post) => {
    if (post.primaryCategory && CATEGORY_GROUPS[post.primaryCategory]) return post.primaryCategory;
    const categories = post.categories || [];
    for (const [group, children] of Object.entries(CATEGORY_GROUPS)) {
      if (categories.includes(group) || categories.some(category => children.includes(category))) return group;
    }
    return categories[0] || "Articles";
  };
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

  // Every article opens inside DigiReview. A tiny or link-only content block is
  // not treated as a real article; in that case the Google Sites source is read.
  const articleText = (html) => String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&#39;|&quot;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hasInternalArticle = (post) => {
    const text = articleText(post.content);
    return text.length >= 280 && text.split(/\s+/).length >= 45;
  };

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
      author: { "@type": "Person", name: NESI_AUTHOR.name },
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
        <span class="category-pill">${escapeHtml(primaryCategoryFor(post))}</span>
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
    posts.forEach(post => {
      const values = new Set([primaryCategoryFor(post), ...(post.categories || [])]);
      values.forEach(category => map.set(category, (map.get(category) || 0) + 1));
    });
    return map;
  };

  const categoriesMarkup = () => {
    const counts = categoryCounts();
    return Object.entries(CATEGORY_GROUPS).map(([group, children]) => `
      <div class="category-group-list">
        <a class="category-parent" href="#category=${encodeURIComponent(group)}"><span>${escapeHtml(group)}</span><strong>${counts.get(group) || 0}</strong></a>
        <div class="category-children">
          ${children.filter(child => counts.get(child)).map(child => `<a href="#category=${encodeURIComponent(child)}"><span>${escapeHtml(child)}</span><strong>${counts.get(child) || 0}</strong></a>`).join("")}
        </div>
      </div>`).join("");
  };

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
            <span class="category-pill">${escapeHtml(primaryCategoryFor(main))}</span>
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
                <span class="category-pill">${escapeHtml(primaryCategoryFor(post))}</span>
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
    const categories = Object.keys(CATEGORY_GROUPS);
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

  const commentsMarkup = (post) => `
    <div class="comment-system" data-comment-post="${escapeHtml(post.slug)}">
      <div class="comment-system-status" id="comment-system-status">Loading comments…</div>
      <div class="comment-list" id="comment-list"></div>
      <form class="comment-form" id="comment-form" novalidate>
        <div class="comment-form-grid">
          <label>Your name
            <input name="name" type="text" maxlength="60" autocomplete="name" required>
          </label>
          <label>Your email
            <input name="email" type="email" maxlength="160" autocomplete="email" required>
          </label>
        </div>
        <label>Your comment
          <textarea name="comment" rows="5" maxlength="1500" required placeholder="Share a helpful and respectful comment."></textarea>
        </label>
        <label class="comment-honeypot" aria-hidden="true">Website
          <input name="website" type="text" tabindex="-1" autocomplete="off">
        </label>
        <input name="started_at" type="hidden" value="${Date.now()}">
        <div class="comment-form-actions">
          <button type="submit">Post comment</button>
          <span class="comment-privacy">Your email is used for moderation and is never displayed.</span>
        </div>
        <div class="comment-form-message" id="comment-form-message" role="status"></div>
      </form>
    </div>`;

  const renderCommentItems = (comments) => {
    const target = document.getElementById("comment-list");
    if (!target) return;
    target.innerHTML = comments.length
      ? comments.map(comment => `
          <article class="comment-item">
            <div class="comment-avatar">${escapeHtml(String(comment.name || "G").slice(0, 1).toUpperCase())}</div>
            <div>
              <div class="comment-head"><strong>${escapeHtml(comment.name || "Guest")}</strong><time>${formatDate(String(comment.created_at || "").slice(0, 10))}</time></div>
              <p>${escapeHtml(comment.content || "")}</p>
            </div>
          </article>`).join("")
      : `<div class="comment-empty">No comments yet. Be the first to share a helpful thought.</div>`;
  };


  const initComments = async (post) => {
    const config = services.comments || {};
    const status = document.getElementById("comment-system-status");
    const form = document.getElementById("comment-form");
    const message = document.getElementById("comment-form-message");
    if (!status || !form) return;

    if (!config.endpoint) {
      status.innerHTML = `Guest comments are prepared but not connected yet. Complete the Supabase setup in <code>README-NO-CAPTCHA-VI.md</code>.`;
      form.hidden = true;
      renderCommentItems([]);
      return;
    }

    const loadComments = async () => {
      status.textContent = "Loading comments…";
      try {
        const separator = config.endpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${config.endpoint}${separator}post_slug=${encodeURIComponent(post.slug)}`, {
          method: "GET",
          headers: { "Accept": "application/json" },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        renderCommentItems(Array.isArray(payload.comments) ? payload.comments : []);
        status.textContent = `${payload.comments?.length || 0} approved comment${payload.comments?.length === 1 ? "" : "s"}.`;
      } catch (error) {
        status.textContent = "Comments could not be loaded: " + error.message;
        renderCommentItems([]);
      }
    };


    form.addEventListener("submit", async event => {
      event.preventDefault();
      message.textContent = "";

      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const content = String(formData.get("comment") || "").trim();
      const website = String(formData.get("website") || "").trim();
      const startedAt = Number(formData.get("started_at") || Date.now());

      if (!name || !email || content.length < 10) {
        message.textContent = "Please enter your name, a valid email, and a comment of at least 10 characters.";
        return;
      }
      if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|vn)\b/i.test(content)) {
        message.textContent = "Links are not permitted in comments.";
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = "Posting…";

      try {
        const response = await fetch(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            post_slug: post.slug,
            name,
            email,
            content,
            website,
            started_at: startedAt
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

        form.reset();
        message.textContent = payload.message || "Your comment has been posted.";
        form.elements.started_at.value = String(Date.now());
        await loadComments();
        trackEvent("comment_submit", { article_slug: post.slug, moderation_status: payload.status || "approved" });
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Post comment";
      }
    });

    await loadComments();
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

  const fetchGoogleSitesMarkdown = async (url) => {
    const extractorEndpoint = String(services.extractorEndpoint || "").trim();

    if (extractorEndpoint) {
      try {
        const response = await fetch(extractorEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ url })
        });
        if (response.ok) {
          const payload = await response.json();
          if (String(payload.markdown || "").trim().length > 300) return payload.markdown;
        }
      } catch (error) {
        console.warn("Configured extractor failed; using public Reader fallback.", error);
      }
    }

    const hostPath = url.replace(/^https?:\/\//i, "");
    const candidates = [
      `https://r.jina.ai/${url}`,
      `https://r.jina.ai/http://${hostPath}`
    ];

    let best = "";
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, {
          method: "GET",
          headers: { "Accept": "text/plain" },
          cache: "no-store"
        });
        if (!response.ok) continue;
        const text = await response.text();
        if (text.length > best.length) best = text;
        if (articleText(text).split(/\\s+/).length > 180) break;
      } catch (error) {
        console.warn("Reader candidate failed:", candidate, error);
      }
    }

    if (articleText(best).split(/\\s+/).length < 45) {
      throw new Error("The public page could not be extracted. Configure the included Supabase extractor for reliable importing.");
    }
    return best;
  };

  const loadGoogleSitesArticle = async (post) => {
    if (!post.externalUrl || hasInternalArticle(post)) return post.content || "";

    const cacheKey = `digireview-live-google-site-${post.slug}-${post.externalUrl}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached && articleText(cached).split(/\\s+/).length >= 45) {
      post.content = cached;
      return cached;
    }

    const markdown = await fetchGoogleSitesMarkdown(post.externalUrl);
    const html = importedMarkdownToHtml(markdown, post.title, post.image);
    if (articleText(html).split(/\\s+/).length < 45) {
      throw new Error("The page was reached, but no complete article content was returned.");
    }

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
            <span class="category-pill">${escapeHtml(primaryCategoryFor(post))}</span>
            <h1>${escapeHtml(post.title)}</h1>
            <p>Loading the published Google Sites article inside DigiReview…</p>
            <div class="loading-bar"><span></span></div>
          </div>
        </div>
      </section>`;
    scrollTop();
  };

  const renderRichContent = (value, title = "", heroImage = "") => {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/<(?:p|h2|h3|ul|ol|table|div|section|main|figure|blockquote|img|a)\b/i.test(source)) return source;
    return importedMarkdownToHtml(source, title, heroImage);
  };

  const sanitizeArticleHtml = (post) => {
    const holder = document.createElement("div");
    holder.innerHTML = renderRichContent(post.content, post.title, post.image);

    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(comment => comment.remove());

    holder.querySelectorAll("script,style,noscript,form,input,textarea,select,button,iframe").forEach(node => node.remove());
    holder.querySelectorAll("main,article").forEach(node => node.classList.add("imported-root"));

    holder.querySelectorAll("h1").forEach(heading => {
      if (heading.textContent.trim().toLowerCase() === String(post.title || "").trim().toLowerCase()) heading.remove();
      else heading.outerHTML = `<h2>${heading.innerHTML}</h2>`;
    });

    holder.querySelectorAll("h2,h3,h4,p,div,section").forEach(element => {
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (!text && !element.querySelector("img,table,ul,ol,blockquote")) {
        element.remove();
        return;
      }
      if (/^(table of contents|contents)$/i.test(text)) {
        element.remove();
        return;
      }
      if (/^disclosure\s*:/i.test(text) || /^review snapshot$/i.test(text)) {
        element.remove();
        return;
      }
      if (/^quick summary\s*:/i.test(text)) element.classList.add("imported-callout");
      if (element.matches("div,section") && element.querySelector(":scope > h2, :scope > h3")) element.classList.add("imported-section");
    });

    holder.querySelectorAll("a[href]").forEach(link => {
      const href = link.getAttribute("href") || "";
      if (/^https?:/i.test(href)) {
        link.target = "_blank";
        link.rel = "noopener sponsored nofollow";
      }
      const parent = link.parentElement;
      const parentText = parent?.textContent.replace(/\s+/g, " ").trim() || "";
      if (parent && parent.children.length === 1 && parentText.length <= 120 && !link.querySelector("img")) {
        parent.classList.add("imported-cta-wrap");
        link.classList.add("imported-cta");
      }
    });

    holder.querySelectorAll("img").forEach(image => {
      image.loading = "lazy";
      image.decoding = "async";
      const label = `${image.alt || ""} ${image.src || ""}`;
      if (/favicon|avatar|profile|small.?icon/i.test(label)) image.classList.add("content-icon");
      else image.classList.add("content-media");
      const link = image.closest("a");
      if (link) link.classList.add("content-media-link");
      if (!image.closest("figure") && !link) {
        const figure = document.createElement("figure");
        image.replaceWith(figure);
        figure.appendChild(image);
      }
    });

    holder.querySelectorAll("table").forEach(table => {
      if (table.parentElement?.classList.contains("table-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    holder.querySelectorAll("p,div").forEach(element => {
      const links = [...element.querySelectorAll(":scope > a")];
      const onlyDirectLink = links.length === 1 && [...element.children].every(child => child.tagName === "A");
      if (!onlyDirectLink) return;
      const href = links[0].href || "";
      const label = links[0].textContent.replace(/\s+/g, " ").trim();
      if (href === post.externalUrl || label.toLowerCase() === String(post.title || "").toLowerCase()) element.remove();
    });

    return holder.innerHTML;
  };

  const prepareArticleMedia = () => {
    document.querySelectorAll("#article-content img").forEach(image => {
      const classify = () => {
        if (image.naturalWidth && image.naturalHeight && image.naturalWidth <= 220 && image.naturalHeight <= 220) {
          image.classList.remove("content-media");
          image.classList.add("content-icon");
        }
      };
      if (image.complete) classify();
      else image.addEventListener("load", classify, { once: true });
    });
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
    const cleanedArticleContent = sanitizeArticleHtml(post);
    app.innerHTML = `
      <article class="article-shell">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="#home">Home</a><span>›</span><a href="#category=${encodeURIComponent(primaryCategoryFor(post))}">${escapeHtml(primaryCategoryFor(post))}</a><span>›</span><span>${escapeHtml(post.title)}</span></nav>
          <div class="article-layout">
            <div>
              <header class="article-header">
                <span class="category-pill">${escapeHtml(primaryCategoryFor(post))}</span>
                <h1>${escapeHtml(post.title)}</h1>
                <p class="article-deck">${escapeHtml(post.excerpt)}</p>
                <div class="post-meta"><span>By ${escapeHtml(NESI_AUTHOR.name)}</span><span>${formatDate(post.date)}</span><span>${postReadLabel(post)}</span><span>${views} local views</span></div>
              </header>
              <img class="article-hero" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'">
              ${renderOriginalSource(post)}
              <div id="toc-container"></div>
              ${renderCta(post)}
              <div class="article-content" id="article-content">${cleanedArticleContent}</div>
              ${renderProsCons(post)}
              ${renderCta(post)}
              <div class="tag-row">${(post.tags || []).map(tag => `<a href="#search=${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join("")}</div>
              <section class="rating-box"><strong>Was this article helpful?</strong><div class="rating-stars" data-rating-slug="${escapeHtml(post.slug)}">${[1,2,3,4,5].map(star => `<button type="button" data-rating="${star}" aria-label="Rate ${star} out of 5">★</button>`).join("")}</div><small id="rating-message">Your rating is stored in this browser.</small></section>
              <section class="author-box"><img class="author-avatar" src="${escapeHtml(NESI_AUTHOR.avatar)}" alt="${escapeHtml(NESI_AUTHOR.name)}"><div><h2>About ${escapeHtml(NESI_AUTHOR.name)}</h2><p>${escapeHtml(NESI_AUTHOR.bio)}</p></div></section>
              <section class="comments-box"><h2>Comments</h2>${commentsMarkup(post)}</section>
              ${related.length ? `<section class="section"><div class="section-heading"><div><h2>Related posts</h2></div></div><div class="related-grid">${related.map(item => `<a class="related-card" href="${postHref(item)}"${postTargetAttrs(item)}><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'"><div><span class="category-pill">${escapeHtml(primaryCategoryFor(item))}</span><strong>${escapeHtml(item.title)}</strong></div></a>`).join("")}</div></section>` : ""}
            </div>
            <aside class="article-sidebar">
              <section class="sidebar-widget"><h2>Share this article</h2><div class="share-row"><button type="button" data-share="copy">Copy link</button><a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}">Facebook</a><a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(post.title)}">X</a><a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}">LinkedIn</a></div></section>
              <section class="sidebar-widget toc-sidebar-widget"><h2>In this article</h2><div id="sticky-toc"></div></section>
              <section class="sidebar-widget"><h2>Recent Posts</h2><div class="recent-list">${recentPostsMarkup()}</div></section>
            </aside>
          </div>
        </div>
      </article>`;
    prepareArticleMedia();
    buildToc();
    bindDynamicEvents();
    bindRating(post.slug);
    initComments(post);
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
    const headings = [...content.querySelectorAll("h2, h3")]
      .filter(heading => !/^(table of contents|contents)$/i.test(heading.textContent.trim()));
    headings.forEach((heading, index) => {
      heading.id = heading.id || `${slugify(heading.textContent)}-${index + 1}`;
    });

    const list = headings.map(heading => `<li class="${heading.tagName === "H3" ? "sub" : ""}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.textContent)}</a></li>`).join("");
    const inline = headings.length ? `<details class="toc toc-mobile"><summary>Table of Contents <span>${headings.length} sections</span></summary><ol>${list}</ol></details>` : "";
    const container = document.getElementById("toc-container");
    if (container) container.innerHTML = inline;

    const sticky = document.getElementById("sticky-toc");
    if (sticky) sticky.innerHTML = headings.length
      ? `<nav class="toc-sidebar" aria-label="Table of contents"><ol>${list}</ol></nav>`
      : "<p>No sections found.</p>";
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
    const pageHtml = renderRichContent(page.content, page.title, "");
    setPageTitle(page.title, articleText(pageHtml).slice(0, 155));
    updateJsonLd();
    const contactDestination = site.contactEndpoint
      ? "Messages are submitted through the configured form service."
      : site.contactEmail
        ? `Messages will open in your email app and be addressed to ${escapeHtml(site.contactEmail)}.`
        : "The contact destination has not been configured yet.";
    const contactForm = slug === "contact" ? `
      <form class="contact-form" id="contact-form">
        <label>Name<input name="name" required></label>
        <label>Email<input name="email" type="email" required></label>
        <label>Subject<input name="subject" required></label>
        <label>Message<textarea name="message" rows="7" required></textarea></label>
        <button type="submit">Send message</button>
        <p class="form-destination">${contactDestination}</p>
      </form>` : "";
    app.innerHTML = `<section class="page-shell"><div class="container page-content"><span class="eyebrow">DigiReview Journal</span><h1>${escapeHtml(page.title)}</h1><div class="article-content static-page-content">${pageHtml}</div>${contactForm}</div></section>`;
    prepareArticleMedia();
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
    const values = Object.fromEntries(new FormData(form).entries());

    if (site.contactEndpoint) {
      try {
        const response = await fetch(site.contactEndpoint, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error("Contact request failed");
        form.reset();
        showToast("Message sent.");
      } catch (_) {
        showToast("Could not send. Check the configured form endpoint.");
      }
      return;
    }

    if (site.contactEmail) {
      const subject = encodeURIComponent(String(values.subject || "DigiReview contact"));
      const body = encodeURIComponent(`Name: ${values.name || ""}\nEmail: ${values.email || ""}\n\n${values.message || ""}`);
      location.href = `mailto:${encodeURIComponent(site.contactEmail)}?subject=${subject}&body=${body}`;
      showToast("Opening your email app.");
      return;
    }

    showToast("Contact destination is not configured. Add it in admin → Site settings.");
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
    target.innerHTML = results.length ? results.map(post => `<a class="live-result" href="${postHref(post)}"${postTargetAttrs(post)}><img src="${escapeHtml(post.image)}" alt=""><span><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(primaryCategoryFor(post))}</span></span></a>`).join("") : `<p>No matching articles.</p>`;
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

  // Do not automatically reload pages that visitors are currently reading.
  // Fresh posts are fetched with cache-busting the next time a page is opened.
  const startApp = () => {
    initChrome();
    route().catch(error => console.error("Initial route failed", error));
  };

  window.addEventListener("hashchange", () => route().catch(error => console.error("Route failed", error)));
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();
