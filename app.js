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

  const sortedPosts = () => posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const getPost = (slug) => posts.find(post => post.slug === slug);

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
      <a href="#post=${encodeURIComponent(post.slug)}"><img class="card-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy"></a>
      <div class="card-body">
        <span class="category-pill">${escapeHtml(post.categories?.[0] || "Article")}</span>
        <h3><a href="#post=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <div class="post-meta"><span>${formatDate(post.date)}</span><span>${readTime(post)} min read</span></div>
        <a class="read-more" href="#post=${encodeURIComponent(post.slug)}">Read more →</a>
      </div>
    </article>`;

  const recentPostsMarkup = () => sortedPosts().slice(0, 5).map(post => `
    <a class="recent-item" href="#post=${encodeURIComponent(post.slug)}">
      <img src="${escapeHtml(post.image)}" alt="" loading="lazy">
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
    const featured = sortedPosts().filter(post => post.featured).slice(0, 3);
    const fallback = sortedPosts().slice(0, 3);
    const selected = featured.length >= 3 ? featured : fallback;
    if (!selected.length) return "";
    const [main, ...side] = selected;
    return `
      <div class="featured-grid">
        <article class="featured-card main">
          <a href="#post=${encodeURIComponent(main.slug)}"><img class="card-image" src="${escapeHtml(main.image)}" alt="${escapeHtml(main.title)}"></a>
          <div class="card-body">
            <span class="category-pill">${escapeHtml(main.categories?.[0] || "Featured")}</span>
            <h2><a href="#post=${encodeURIComponent(main.slug)}">${escapeHtml(main.title)}</a></h2>
            <p>${escapeHtml(main.excerpt)}</p>
            <div class="post-meta"><span>${formatDate(main.date)}</span><span>${readTime(main)} min read</span></div>
          </div>
        </article>
        <div class="featured-side">
          ${side.map(post => `
            <article class="featured-card compact">
              <a href="#post=${encodeURIComponent(post.slug)}"><img class="card-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}"></a>
              <div class="card-body">
                <span class="category-pill">${escapeHtml(post.categories?.[0] || "Featured")}</span>
                <h3><a href="#post=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h3>
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
      <section class="hero">
        <div class="container hero-copy">
          <span class="eyebrow">Independent digital product reviews</span>
          <h1>Understand the product before you click buy.</h1>
          <p>${escapeHtml(site.description || "Practical product reviews and buying guides.")}</p>
        </div>
      </section>
      <section class="section">
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
      return `<div class="comments-placeholder"><strong>Comments are ready to connect.</strong><p>Open <code>data/posts.js</code> and add your Giscus repository values to enable a real comment system.</p></div>`;
    }
    return `<div id="giscus-container" data-post-slug="${escapeHtml(post.slug)}"></div>`;
  };

  const renderPost = (post) => {
    if (!post) return renderNotFound();
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
                <div class="post-meta"><span>By ${escapeHtml(post.author || site.author?.name || "Editorial Team")}</span><span>${formatDate(post.date)}</span><span>${readTime(post)} min read</span><span>${views} local views</span></div>
              </header>
              <img class="article-hero" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">
              <div class="disclosure"><strong>Disclosure:</strong> ${escapeHtml(post.disclosure || "This article may contain affiliate links.")}</div>
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
              ${related.length ? `<section class="section"><div class="section-heading"><div><h2>Related posts</h2></div></div><div class="related-grid">${related.map(item => `<a class="related-card" href="#post=${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy"><div><span class="category-pill">${escapeHtml(item.categories?.[0] || "Article")}</span><strong>${escapeHtml(item.title)}</strong></div></a>`).join("")}</div></section>` : ""}
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
      showToast("Add your Formspree or newsletter endpoint in data/posts.js.");
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
      showToast("Add your contact form endpoint in data/posts.js.");
      return;
    }
    try {
      const response = await fetch(site.contactEndpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Contact request failed");
      form.reset();
      showToast("Message sent.");
    } catch (_) { showToast("Could not send. Check the configured endpoint."); }
  };

  const route = () => {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!hash || hash === "home") return renderHome();
    if (hash === "archive") { currentPage = 1; return renderArchive(); }
    const [key, ...rest] = hash.split("=");
    const value = rest.join("=");
    if (key === "post") return renderPost(getPost(value));
    if (key === "category") return renderCategory(value);
    if (key === "search") return renderSearch(value);
    if (key === "page") return renderPage(value);
    if (document.getElementById(hash)) return document.getElementById(hash).scrollIntoView({ behavior: "smooth" });
    return renderNotFound();
  };

  const liveSearch = (query) => {
    const target = document.getElementById("live-search-results");
    const q = query.trim().toLowerCase();
    if (!q) { target.innerHTML = ""; return; }
    const results = sortedPosts().filter(post => [post.title, post.excerpt, ...(post.categories || []), ...(post.tags || [])].join(" ").toLowerCase().includes(q)).slice(0, 6);
    target.innerHTML = results.length ? results.map(post => `<a class="live-result" href="#post=${encodeURIComponent(post.slug)}"><img src="${escapeHtml(post.image)}" alt=""><span><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.categories?.[0] || "Article")}</span></span></a>`).join("") : `<p>No matching articles.</p>`;
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "auto" });

  const initChrome = () => {
    document.getElementById("brand-name").textContent = site.name || "DigiReview";
    document.getElementById("brand-tagline").textContent = site.tagline || "Reviews & Buying Guides";
    document.getElementById("topbar-text").textContent = site.topbarText || "Independent reviews. Clear buying decisions.";
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

    document.querySelectorAll(".nav-dropdown > button").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      const dropdown = button.closest(".nav-dropdown");
      const isOpen = dropdown.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    }));

    document.addEventListener("click", event => {
      if (event.target.closest("#primary-nav a")) document.getElementById("primary-nav").classList.remove("open");
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
    }, { passive: true });

    const cookie = document.getElementById("cookie-banner");
    if (!localStorage.getItem("digireview-cookie-notice")) cookie.hidden = false;
    document.getElementById("accept-cookies").addEventListener("click", () => {
      localStorage.setItem("digireview-cookie-notice", "accepted");
      cookie.hidden = true;
    });
  };

  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", () => {
    initChrome();
    route();
  });
})();
