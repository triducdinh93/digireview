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
  const DEFAULT_PRIVACY_POLICY_HTML = '<p><strong>Last updated: July 13, 2026</strong></p>\n<p>This Privacy Policy explains how DigiReview collects, uses, stores and shares information when you visit this website, read an article, submit a comment, contact us or follow a link to a third-party website.</p>\n<h2>1. Information we collect</h2>\n<h3>Information you provide</h3>\n<p>We may collect information that you choose to submit, including your name, email address, message, comment and any other information you include in a form. Comment email addresses are used for moderation and administration and are not displayed publicly.</p>\n<h3>Usage and technical information</h3>\n<p>We use Google Analytics to understand how visitors use the website. Depending on your browser and settings, analytics information may include page views, referring pages, approximate location, device and browser information, interactions with website features and identifiers stored in first-party cookies such as <code>_ga</code>.</p>\n<p>This website is hosted through GitHub Pages. GitHub may process technical and security information, including visitor IP addresses and request information, when the website is accessed.</p>\n<h3>Browser storage</h3>\n<p>DigiReview uses browser local storage to remember settings and features such as theme preference, locally counted article views and article ratings. This information stays in your browser unless you clear your browser data.</p>\n<h2>2. How we use information</h2>\n<ul>\n  <li>To operate, maintain and improve DigiReview.</li>\n  <li>To understand website traffic and article performance.</li>\n  <li>To respond to contact requests and editorial feedback.</li>\n  <li>To publish and moderate comments and prevent spam or abuse.</li>\n  <li>To detect technical problems, fraud and security threats.</li>\n  <li>To comply with applicable legal obligations.</li>\n</ul>\n<h2>3. Cookies and similar technologies</h2>\n<p>Google Analytics may use first-party cookies to distinguish visitors and sessions. You can block or delete cookies through your browser settings. You can also use the Google Analytics opt-out browser add-on. Blocking cookies or local storage may affect some website features.</p>\n<h2>4. Third-party services</h2>\n<p>DigiReview may use or link to the following third-party services:</p>\n<ul>\n  <li><strong>Google Analytics</strong> for website measurement and usage analytics.</li>\n  <li><strong>GitHub Pages</strong> for website hosting and security logging.</li>\n  <li><strong>Supabase</strong> when the comment system is enabled, including storage and processing of comment submissions.</li>\n  <li><strong>Contact form providers</strong> if an external form endpoint is configured.</li>\n  <li><strong>Google Sites, product vendors and affiliate platforms</strong> when you open an original article source, product page or affiliate link.</li>\n</ul>\n<p>These providers process information under their own privacy policies and terms. DigiReview does not control the privacy practices of third-party websites.</p>\n<h2>5. Affiliate links</h2>\n<p>Some links on DigiReview may be affiliate links. If you click an affiliate link, the destination website or affiliate network may use cookies, referral identifiers or similar technologies to attribute a purchase or action. DigiReview may receive a commission at no additional cost to you.</p>\n<h2>6. How information is shared</h2>\n<p>We do not sell personal information. Information may be shared with service providers that support hosting, analytics, comments, form processing and website security; when you direct us to share it; or when disclosure is reasonably necessary to comply with law, protect rights, investigate abuse or secure the website.</p>\n<h2>7. Data retention</h2>\n<p>Contact messages and comments are retained only for as long as reasonably necessary for communication, moderation, recordkeeping and security. Analytics information is retained according to the settings and policies of Google Analytics. Local-storage information remains on your device until you clear it or your browser removes it.</p>\n<h2>8. Your choices and privacy rights</h2>\n<p>You may disable or delete cookies and local storage in your browser, use the Google Analytics opt-out browser add-on, or contact us to request access to, correction of or deletion of personal information that we control. Applicable rights may vary depending on where you live.</p>\n<h2>9. International processing</h2>\n<p>Service providers may process information in countries other than your own. Those countries may have different data-protection rules. We use services subject to their published privacy and security terms.</p>\n<h2>10. Children’s privacy</h2>\n<p>DigiReview is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has submitted personal information, please contact us so it can be reviewed and removed.</p>\n<h2>11. Data security</h2>\n<p>We use reasonable technical and organizational safeguards, but no website or transmission method can be guaranteed to be completely secure.</p>\n<h2>12. External links</h2>\n<p>Articles may link to product pages, Google Sites, vendors, social networks and other external websites. Review the privacy policy of each external service before submitting information or making a purchase.</p>\n<h2>13. Changes to this policy</h2>\n<p>We may update this Privacy Policy when website features, service providers or legal requirements change. The updated date at the top of this page indicates the latest revision.</p>\n<h2>14. Contact</h2>\n<p>For privacy questions or requests, email <a href="mailto:dinhtrantriduc@gmail.com">dinhtrantriduc@gmail.com</a>.</p>';
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

  const topRecommendationTimestamp = (post) => {
    const value = post.topRecommendedAt || post.publishedAt || post.updatedAt || post.updated || `${post.date || "1970-01-01"}T00:00:00`;
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

  const renderTopRecommendations = () => {
    currentPage = 1;
    renderArchive({
      title: "Top Recommendations",
      description: "A curated collection of the strongest product reviews and practical guides selected by DigiReview.",
      filter: post => Boolean(post.topRecommended)
    });
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

  const cleanNodeText = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();

  const directChildren = node => [...(node?.children || [])];
  const directHeading = node => directChildren(node).find(child => /^H[2-4]$/.test(child.tagName));
  const directMedia = node => directChildren(node).find(child => child.matches?.("video,iframe,object,embed,.content-video-wrap"));
  const priceNumber = value => {
    const match = String(value || "").replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };
  const actionTextPattern = /\b(?:get|buy|download|access|start|launch|try|claim|order|join|view|check|see|shop|unlock|grab|visit|learn more)\b/i;
  const normalizedHref = value => {
    try {
      const url = new URL(String(value || ""), location.href);
      url.hash = "";
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(key => url.searchParams.delete(key));
      return url.href.replace(/\/$/, "");
    } catch {
      return String(value || "").trim();
    }
  };

  const isShortLabel = value => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 64) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 10) return false;
    return !/[.!?]\s*$/.test(text) || /^(?:faq|pricing|overview|summary|verdict|bonus|cost|value|risk|ideal|watch|full library|what you download)/i.test(text);
  };

  const markSectionKickers = holder => {
    holder.querySelectorAll("section,.imported-section").forEach(section => {
      section.classList.add("imported-section");
      const children = directChildren(section);
      const headingIndex = children.findIndex(child => /^H[2-4]$/.test(child.tagName));
      if (headingIndex <= 0) return;
      for (let index = 0; index < headingIndex; index += 1) {
        const lead = children[index];
        const text = cleanNodeText(lead);
        if (!isShortLabel(text) || lead.querySelector("img,video,iframe,table,ul,ol,a")) continue;
        lead.classList.add("section-kicker");
      }
    });
  };

  const canonicalizeDirectoryTrees = holder => {
    holder.querySelectorAll("div").forEach(node => {
      if (node.closest("pre,.directory-tree") || node.querySelector("h2,h3,h4,table,ul,ol,img,video,iframe,a")) return;
      const raw = String(node.innerText || node.textContent || "").replace(/\r/g, "");
      const markers = (raw.match(/[├└│]|\.(?:mp4|mp3|png|jpg|txt|zip)\b/gi) || []).length;
      const lines = raw.split("\n").map(line => line.replace(/[ \t]+/g, " ").trimEnd()).filter(line => line.trim());
      if (markers < 4 || lines.length < 4) return;
      const pre = document.createElement("pre");
      pre.className = "directory-tree";
      const code = document.createElement("code");
      code.textContent = lines.join("\n");
      pre.appendChild(code);
      node.replaceWith(pre);
    });
  };

  const canonicalizeCatalogLists = holder => {
    holder.querySelectorAll("div").forEach(container => {
      if (container.closest(".catalog-list,.pricing-grid,.media-gallery")) return;
      const children = directChildren(container);
      if (children.length < 8 || children.length > 120) return;
      const parsed = children.map(child => {
        const first = child.firstElementChild;
        const numberText = cleanNodeText(first);
        if (!first || first.tagName !== "SPAN" || !/^\d{1,3}$/.test(numberText)) return null;
        const clone = child.cloneNode(true);
        clone.firstElementChild?.remove();
        const label = cleanNodeText(clone);
        return label ? { number: Number(numberText), label } : null;
      });
      if (parsed.some(item => !item)) return;
      const list = document.createElement("ol");
      list.className = "catalog-list";
      if (parsed[0].number !== 1) list.start = parsed[0].number;
      parsed.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item.label;
        list.appendChild(li);
      });
      container.replaceWith(list);
    });
  };

  const canonicalizeVideoCards = holder => {
    const mediaSelector = "video,iframe,object,embed,.content-video-wrap";
    holder.querySelectorAll("div,section").forEach(card => {
      if (card.classList.contains("content-video-wrap") || card.classList.contains("media-gallery")) return;
      const children = directChildren(card);
      const mediaChild = children.find(child => child.matches?.(mediaSelector) || child.querySelector?.(mediaSelector));
      if (!mediaChild) return;
      const mediaCount = card.querySelectorAll("video,iframe,object,embed").length;
      if (mediaCount !== 1 || children.length < 2 || children.length > 4) return;
      const caption = children.find(child => child !== mediaChild && cleanNodeText(child));
      if (!caption || caption.querySelector("h2,h3,ul,ol,table,img,video,iframe")) return;
      card.classList.add("media-card");
      caption.classList.add("media-caption");
      const strong = caption.querySelector("strong");
      if (strong) strong.classList.add("media-caption-title");
    });

    holder.querySelectorAll("div,section").forEach(container => {
      if (container.classList.contains("media-card")) return;
      const children = directChildren(container);
      if (children.length < 2 || children.length > 8) return;
      if (!children.every(child => child.classList.contains("media-card") || (child.querySelector("video,iframe,object,embed") && child.querySelectorAll("video,iframe,object,embed").length === 1))) return;
      container.classList.add("media-gallery");
      children.forEach(child => child.classList.add("media-card"));
    });
  };

  const canonicalizeRepeatedCards = holder => {
    holder.querySelectorAll("div,section").forEach(container => {
      if (container.closest(".media-gallery,.pricing-grid,.catalog-list") || container.classList.contains("content-video-wrap")) return;
      const children = directChildren(container);
      if (children.length < 2 || children.length > 8) return;
      if (!children.every(child => ["DIV", "SECTION", "ARTICLE"].includes(child.tagName))) return;
      const cardInfo = children.map(card => {
        const heading = directHeading(card);
        const badge = directChildren(card).find(child => child !== heading && isShortLabel(cleanNodeText(child)) && /^0?\d{1,2}$/.test(cleanNodeText(child)));
        const hasBody = Boolean(card.querySelector(":scope > p, :scope > ul, :scope > ol"));
        return { card, heading, badge, hasBody };
      });
      if (!cardInfo.every(item => item.heading && item.hasBody)) return;

      const isComparison = cardInfo.length === 2 && cardInfo.every(item => item.card.querySelector(":scope > ul, :scope > ol"));
      const isNumbered = cardInfo.every(item => item.badge);
      container.classList.add(isComparison ? "comparison-grid" : isNumbered ? "numbered-card-grid" : "content-card-grid");

      cardInfo.forEach((item, index) => {
        item.card.classList.add(isComparison ? "comparison-card" : isNumbered ? "numbered-card" : "content-card");
        if (isComparison) {
          const title = cleanNodeText(item.heading).toLowerCase();
          const body = cleanNodeText(item.card);
          if (/without|not|avoid|cons|limitations|wrong|before/i.test(title) || /✗|×/.test(body)) item.card.classList.add("is-negative");
          if (/with|perfect|pros|benefits|included|best/i.test(title) || /✓|✔/.test(body)) item.card.classList.add("is-positive");
        }
        if (isNumbered && item.badge) {
          item.badge.classList.add("card-number");
          const header = document.createElement("div");
          header.className = "card-heading-row";
          item.card.insertBefore(header, item.badge);
          header.appendChild(item.badge);
          header.appendChild(item.heading);
        }
        item.heading.classList.add("card-title");
      });
    });
  };

  const canonicalizeValueLists = holder => {
    holder.querySelectorAll("div").forEach(container => {
      if (container.closest(".pricing-grid,.catalog-list,.media-gallery,.value-list")) return;
      const rows = directChildren(container);
      if (rows.length < 3 || rows.length > 12) return;
      const valid = rows.every(row => {
        if (row.querySelector("h2,h3,h4,ul,ol,table,img,video,iframe,a")) return false;
        const spans = directChildren(row).filter(child => child.tagName === "SPAN");
        return spans.length >= 2 && cleanNodeText(spans[0]) && cleanNodeText(spans[spans.length - 1]);
      });
      if (!valid) return;
      const moneyRows = rows.filter(row => priceNumber(cleanNodeText(row)) !== null).length;
      if (moneyRows < Math.ceil(rows.length / 2)) return;
      container.classList.add("value-list");
      rows.forEach(row => {
        row.classList.add("value-row");
        const spans = directChildren(row).filter(child => child.tagName === "SPAN");
        spans[0].classList.add("value-label");
        spans[spans.length - 1].classList.add("value-amount");
      });
    });
  };

  const buildPricingCard = card => {
    if (card.classList.contains("pricing-card")) return;
    const direct = directChildren(card);
    const priceElements = direct.filter(child => {
      const text = cleanNodeText(child);
      return text.length <= 24 && priceNumber(text) !== null && !child.querySelector("ul,ol,a");
    });
    if (!priceElements.length || !card.querySelector(":scope > ul, :scope > ol")) return;

    const labels = direct.filter(child => child !== priceElements[0] && !priceElements.includes(child) && ["DIV", "P"].includes(child.tagName) && cleanNodeText(child).length <= 60 && !child.querySelector("ul,ol,a"));
    const values = priceElements.map(element => ({ element, value: priceNumber(cleanNodeText(element)), text: cleanNodeText(element) })).filter(item => item.value !== null);
    const unique = [...new Map(values.map(item => [item.text, item])).values()];
    const current = unique.length ? unique.reduce((best, item) => item.value < best.value ? item : best, unique[0]) : null;
    const old = unique.length > 1 ? unique.reduce((best, item) => item.value > best.value ? item : best, unique[0]) : null;

    card.classList.add("pricing-card");
    const combined = cleanNodeText(card);
    if (/best value|launch|today|recommended|popular/i.test(combined)) card.classList.add("is-featured");

    const head = document.createElement("div");
    head.className = "pricing-card-head";
    const badgeText = labels.map(cleanNodeText).find(text => /best value|regular price|launch|recommended|popular/i.test(text));
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
    const noteText = labels.map(cleanNodeText).find(text => text !== badgeText && !/^\$/.test(text));
    if (noteText) {
      const note = document.createElement("span");
      note.className = "pricing-note";
      note.textContent = noteText;
      head.appendChild(note);
    }
    [...priceElements, ...labels].forEach(element => element.remove());
    card.prepend(head);
    card.querySelectorAll(":scope > a[href]").forEach(link => link.classList.add("imported-cta"));
  };

  const canonicalizePricing = holder => {
    holder.querySelectorAll("div,section").forEach(container => {
      if (container.closest(".pricing-grid") || container.classList.contains("pricing-card")) return;
      const children = directChildren(container);
      const candidates = children.filter(child => {
        if (!["DIV", "SECTION", "ARTICLE"].includes(child.tagName) || !child.querySelector(":scope > ul, :scope > ol")) return false;
        return directChildren(child).some(block => {
          const text = cleanNodeText(block);
          return text.length <= 24 && priceNumber(text) !== null && !block.querySelector("ul,ol,a");
        });
      });
      if (candidates.length >= 2 && candidates.length === children.length) {
        container.classList.add("pricing-grid");
        candidates.forEach(buildPricingCard);
      }
    });
    holder.querySelectorAll(".imported-section > div").forEach(card => {
      const hasDirectPrice = directChildren(card).some(block => {
        const text = cleanNodeText(block);
        return text.length <= 24 && priceNumber(text) !== null && !block.querySelector("ul,ol,a");
      });
      if (hasDirectPrice && card.querySelector(":scope > ul, :scope > ol") && !card.closest(".pricing-grid")) buildPricingCard(card);
    });
  };

  const canonicalizePromosAndCtas = (holder, post) => {
    holder.querySelectorAll(".imported-cta,.imported-cta-wrap,.promo-card").forEach(node => node.classList.remove("imported-cta", "imported-cta-wrap", "promo-card"));

    holder.querySelectorAll("a[href]").forEach(link => {
      if (link.querySelector("img")) return;
      const text = cleanNodeText(link);
      const href = link.getAttribute("href") || "";
      const action = actionTextPattern.test(text) || /\$\s*\d/.test(text) || (post?.affiliateUrl && normalizedHref(href) === normalizedHref(post.affiliateUrl));
      if (!action) return;
      link.classList.add("imported-cta");
      const parent = link.parentElement;
      if (parent && parent.children.length === 1 && cleanNodeText(parent).length <= 180) parent.classList.add("imported-cta-wrap");
      const region = link.closest(".imported-section,section,div");
      if (region && region.querySelector("h2,h3") && cleanNodeText(region).split(/\s+/).length <= 90 && !region.querySelector("table,video,iframe,ol,ul:not(.pricing-card ul),img")) region.classList.add("promo-card");
    });

    const actionLinks = [...holder.querySelectorAll("a.imported-cta")];
    const keep = new Set();
    const byHref = new Map();
    actionLinks.forEach(link => {
      const key = normalizedHref(link.getAttribute("href"));
      if (!byHref.has(key)) byHref.set(key, []);
      byHref.get(key).push(link);
    });
    byHref.forEach(links => {
      const pricing = links.find(link => link.closest(".pricing-card"));
      keep.add(links[0]);
      if (pricing) keep.add(pricing);
      keep.add(links[links.length - 1]);
    });

    const preferred = actionLinks.filter(link => keep.has(link));
    if (preferred.length > 4) {
      const finalKeep = new Set([
        preferred[0],
        preferred.find(link => link.closest(".pricing-card")),
        preferred[Math.floor(preferred.length / 2)],
        preferred[preferred.length - 1]
      ].filter(Boolean));
      keep.clear();
      finalKeep.forEach(link => keep.add(link));
    }

    actionLinks.forEach(link => {
      if (keep.has(link)) return;
      const wrap = link.closest(".promo-card,.imported-cta-wrap");
      if (wrap && cleanNodeText(wrap).split(/\s+/).length <= 90) {
        wrap.remove();
      } else {
        const text = document.createTextNode(cleanNodeText(link));
        link.replaceWith(text);
      }
    });
  };

  const canonicalizeOrphanNotes = holder => {
    holder.querySelectorAll(".imported-section").forEach(section => {
      directChildren(section).forEach(child => {
        if (!child.matches("p,div") || child.classList.length || child.querySelector("a,img,video,iframe,table,ul,ol,h2,h3,h4,details,pre")) return;
        const text = cleanNodeText(child);
        if (!text || text.length > 90) return;
        if (/^(?:✓|✔|✗|×|🔒|🛡️|♾️)|\b(?:included|save|only|best for|total value|one-time|no upsell|guarantee)\b/i.test(text)) child.classList.add("inline-note");
      });
    });
  };

  const normalizeImportedStructures = (holder, post) => {
    markSectionKickers(holder);
    canonicalizeDirectoryTrees(holder);
    canonicalizeCatalogLists(holder);
    canonicalizeVideoCards(holder);
    canonicalizeRepeatedCards(holder);
    canonicalizeValueLists(holder);
    canonicalizePricing(holder);
    canonicalizeOrphanNotes(holder);
    canonicalizePromosAndCtas(holder, post);
    markSectionKickers(holder);
  };

  const unwrapImportedNode = node => node.replaceWith(...node.childNodes);

  const safeImportedClass = value => String(value || "")
    .split(/\s+/)
    .filter(name => /^(?:imported-|content-|table-scroll|code-scroll|section-kicker|layout-contained|media-|card-|numbered-|comparison-|pricing-|value-|catalog-|directory-|promo-|inline-note)/.test(name))
    .join(" ");

  const stripUnsafeImportedAttributes = holder => {
    const allowed = {
      A: new Set(["href", "title"]),
      IMG: new Set(["src", "alt", "title", "loading", "decoding"]),
      VIDEO: new Set(["poster", "controls", "preload", "playsinline"]),
      SOURCE: new Set(["src", "type"]),
      IFRAME: new Set(["src", "title", "loading", "allowfullscreen", "referrerpolicy"]),
      OBJECT: new Set(["data", "type"]),
      EMBED: new Set(["src", "type"]),
      TD: new Set(["colspan", "rowspan"]),
      TH: new Set(["colspan", "rowspan", "scope"]),
      DETAILS: new Set(["open"]),
      OL: new Set(["start"])
    };

    holder.querySelectorAll("*").forEach(element => {
      const keep = allowed[element.tagName] || new Set();
      [...element.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (name === "class") {
          const classes = safeImportedClass(attribute.value);
          if (classes) element.className = classes;
          else element.removeAttribute("class");
          return;
        }
        if (!keep.has(name)) element.removeAttribute(attribute.name);
      });
    });
  };

  const normalizeGenericImportedBlocks = holder => {
    holder.querySelectorAll("font,center").forEach(unwrapImportedNode);
    holder.querySelectorAll("b").forEach(node => { node.outerHTML = `<strong>${node.innerHTML}</strong>`; });
    holder.querySelectorAll("i").forEach(node => { node.outerHTML = `<em>${node.innerHTML}</em>`; });
    holder.querySelectorAll("h5,h6").forEach(node => { node.outerHTML = `<h4>${node.innerHTML}</h4>`; });

    holder.querySelectorAll("section,div").forEach(node => {
      const text = cleanNodeText(node);
      const firstLabel = cleanNodeText(node.querySelector(":scope > h2, :scope > h3, :scope > h4, :scope > p, :scope > div"));
      const anchors = node.querySelectorAll("a").length;
      if ((/^navigation$/i.test(firstLabel) || /^navigation\b/i.test(text)) && anchors >= 4) node.remove();
    });

    holder.querySelectorAll("section").forEach(section => {
      section.classList.add("imported-section");
      const children = [...section.children];
      const headingIndex = children.findIndex(child => /^H[2-4]$/.test(child.tagName));
      if (headingIndex > 0) {
        const lead = children[0];
        const label = cleanNodeText(lead);
        if (label && label.length <= 45 && !lead.querySelector("img,video,table,ul,ol")) lead.classList.add("section-kicker");
      }
    });

    holder.querySelectorAll("details").forEach(details => {
      details.classList.add("imported-faq");
      if (!details.querySelector(":scope > summary")) {
        const summary = document.createElement("summary");
        summary.textContent = "More details";
        details.prepend(summary);
      }
    });

    holder.querySelectorAll("figure").forEach(figure => figure.classList.add("imported-figure"));

    for (let pass = 0; pass < 4; pass += 1) {
      holder.querySelectorAll("div,section").forEach(node => {
        const directText = [...node.childNodes]
          .filter(child => child.nodeType === Node.TEXT_NODE)
          .map(child => child.textContent)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (node.className || directText || node.querySelector(":scope > h2, :scope > h3, :scope > h4")) return;
        if (node.children.length === 1 && !node.querySelector(":scope > table, :scope > video, :scope > iframe, :scope > details")) unwrapImportedNode(node);
      });
    }
  };

  const sanitizeArticleHtml = (post) => {
    const holder = document.createElement("div");
    holder.innerHTML = renderRichContent(post.content, post.title, post.image);

    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(comment => comment.remove());

    holder.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,input,textarea,select,button,dialog,template,svg,canvas").forEach(node => node.remove());
    holder.querySelectorAll("main,article").forEach(node => node.classList.add("imported-root"));

    holder.querySelectorAll("iframe").forEach(iframe => {
      const src = iframe.getAttribute("src") || "";
      if (!/^https:\/\/(?:www\.)?(?:youtube\.com\/embed|youtube-nocookie\.com\/embed|player\.vimeo\.com\/video)\//i.test(src)) iframe.remove();
    });

    stripUnsafeImportedAttributes(holder);
    normalizeGenericImportedBlocks(holder);

    holder.querySelectorAll("h1").forEach(heading => {
      if (cleanNodeText(heading).toLowerCase() === String(post.title || "").trim().toLowerCase()) heading.remove();
      else heading.outerHTML = `<h2>${heading.innerHTML}</h2>`;
    });

    holder.querySelectorAll("h2,h3,h4,p,div,section").forEach(element => {
      const text = cleanNodeText(element);
      if (!text && !element.querySelector("img,video,iframe,audio,object,embed,table,ul,ol,blockquote,details,pre")) {
        element.remove();
        return;
      }
      if (/^(table of contents|contents)$/i.test(text)) { element.remove(); return; }
      if (/^disclosure\s*:/i.test(text) || /^review snapshot$/i.test(text)) { element.remove(); return; }
      if (/^quick summary\s*:/i.test(text)) element.classList.add("imported-callout");
      if (element.matches("div,section") && element.querySelector(":scope > h2, :scope > h3")) element.classList.add("imported-section");
    });

    holder.querySelectorAll("a[href]").forEach(link => {
      const href = link.getAttribute("href") || "";
      if (/^javascript:/i.test(href)) { unwrapImportedNode(link); return; }
      if (/^https?:/i.test(href)) {
        link.target = "_blank";
        link.rel = "noopener sponsored nofollow";
      }
    });

    holder.querySelectorAll("img").forEach(image => {
      image.loading = "lazy";
      image.decoding = "async";
      image.removeAttribute("width");
      image.removeAttribute("height");
      const label = `${image.alt || ""} ${image.src || ""}`;
      if (/favicon|avatar|profile|small.?icon/i.test(label)) image.classList.add("content-icon");
      else image.classList.add("content-media");
      const link = image.closest("a");
      if (link) link.classList.add("content-media-link");
      if (!image.closest("figure") && !link) {
        const figure = document.createElement("figure");
        figure.className = "imported-figure";
        image.replaceWith(figure);
        figure.appendChild(image);
      }
    });

    holder.querySelectorAll("video").forEach(video => {
      video.classList.add("content-video");
      video.controls = true;
      video.preload = "metadata";
      video.setAttribute("playsinline", "");
      video.removeAttribute("width");
      video.removeAttribute("height");
      video.removeAttribute("autoplay");
      video.removeAttribute("loop");
      video.removeAttribute("muted");
      if (!video.parentElement?.classList.contains("content-video-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "content-video-wrap";
        video.replaceWith(wrap);
        wrap.appendChild(video);
      }
    });

    holder.querySelectorAll("iframe,object,embed").forEach(media => {
      media.classList.add("content-embedded-media");
      media.removeAttribute("width");
      media.removeAttribute("height");
      if (!media.parentElement?.classList.contains("content-video-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "content-video-wrap";
        media.replaceWith(wrap);
        wrap.appendChild(media);
      }
    });

    holder.querySelectorAll("table").forEach(table => {
      if (table.parentElement?.classList.contains("table-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    holder.querySelectorAll("pre").forEach(pre => {
      if (pre.parentElement?.classList.contains("code-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "code-scroll";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
    });

    holder.querySelectorAll("p,div").forEach(element => {
      const links = [...element.querySelectorAll(":scope > a")];
      const onlyDirectLink = links.length === 1 && [...element.children].every(child => child.tagName === "A");
      if (!onlyDirectLink) return;
      const href = links[0].href || "";
      const label = cleanNodeText(links[0]);
      if (href === post.externalUrl || label.toLowerCase() === String(post.title || "").toLowerCase()) element.remove();
    });

    normalizeImportedStructures(holder, post);
    normalizeGenericImportedBlocks(holder);
    return holder.innerHTML;
  };

  const auditArticleLayout = () => {
    const content = document.getElementById("article-content");
    if (!content) return;
    const width = content.clientWidth;
    content.querySelectorAll("*").forEach(element => {
      element.classList.remove("layout-contained");
      const rect = element.getBoundingClientRect();
      if (rect.width > width + 3 || element.scrollWidth > Math.max(element.clientWidth + 3, width + 3)) {
        element.classList.add("layout-contained");
      }
    });
  };

  const prepareArticleMedia = () => {
    const content = document.getElementById("article-content");
    if (!content) return;

    content.querySelectorAll("img").forEach(image => {
      const classify = () => {
        image.classList.remove("content-icon", "content-tall-media", "content-portrait-media", "content-landscape-media");
        const width = Number(image.naturalWidth || 0);
        const height = Number(image.naturalHeight || 0);
        if (!width || !height) return;
        const ratio = height / width;
        if (width <= 220 && height <= 220) {
          image.classList.remove("content-media");
          image.classList.add("content-icon");
          return;
        }
        image.classList.add("content-media");
        const wrapper = image.closest("figure, a.content-media-link");
        wrapper?.classList.remove("contains-tall-media", "contains-portrait-media", "contains-landscape-media");
        if (ratio >= 1.75 || height >= 1800) {
          image.classList.add("content-tall-media");
          wrapper?.classList.add("contains-tall-media");
        } else if (ratio >= 1.12) {
          image.classList.add("content-portrait-media");
          wrapper?.classList.add("contains-portrait-media");
        } else {
          image.classList.add("content-landscape-media");
          wrapper?.classList.add("contains-landscape-media");
        }
        auditArticleLayout();
      };
      if (image.complete) classify();
      else image.addEventListener("load", classify, { once: true });
    });

    content.querySelectorAll("video").forEach(video => {
      const classify = () => {
        const wrap = video.closest(".content-video-wrap");
        if (!wrap) return;
        wrap.classList.toggle("is-portrait-video", Number(video.videoHeight || 0) > Number(video.videoWidth || 0));
        auditArticleLayout();
      };
      if (video.readyState >= 1) classify();
      else video.addEventListener("loadedmetadata", classify, { once: true });
    });

    window.requestAnimationFrame(auditArticleLayout);
    document.fonts?.ready?.then(auditArticleLayout).catch(() => {});
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => window.requestAnimationFrame(auditArticleLayout));
      observer.observe(content);
      window.setTimeout(() => observer.disconnect(), 12000);
    }
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
              <div id="toc-container"></div>
              <img class="article-hero" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src=\'thumbnail-placeholder.svg\'">
              ${renderOriginalSource(post)}
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

  const cleanTocLabel = (value) => String(value || "")
    .replace(/^\s*(?:section\s+)?\d+(?:\.\d+)*(?:[.)]|\s*[-:])?\s*/i, "")
    .replace(/^\s*[✅❌☑️✔️✖️•▪︎▫︎]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  const buildToc = () => {
    const content = document.getElementById("article-content");
    if (!content) return;
    const headings = [...content.querySelectorAll("h2, h3")]
      .filter(heading => !/^(table of contents|contents)$/i.test(heading.textContent.trim()));

    headings.forEach((heading, index) => {
      heading.id = heading.id || `${slugify(heading.textContent)}-${index + 1}`;
    });

    const groups = [];
    let activeGroup = null;
    headings.forEach(heading => {
      const item = {
        id: heading.id,
        label: cleanTocLabel(heading.textContent) || heading.textContent.trim(),
        tag: heading.tagName
      };
      if (heading.tagName === "H2" || !activeGroup) {
        activeGroup = { ...item, children: [] };
        groups.push(activeGroup);
      } else {
        activeGroup.children.push(item);
      }
    });

    const list = groups.map(group => `
      <li>
        <a href="#${escapeHtml(group.id)}">${escapeHtml(group.label)}</a>
        ${group.children.length ? `<ul>${group.children.map(child => `<li><a href="#${escapeHtml(child.id)}">${escapeHtml(child.label)}</a></li>`).join("")}</ul>` : ""}
      </li>`).join("");

    const container = document.getElementById("toc-container");
    if (!container) return;
    container.innerHTML = groups.length
      ? `<details class="toc toc-inline" open>
          <summary><span>In this article</span><small>${groups.length} main sections</small></summary>
          <ol>${list}</ol>
        </details>`
      : "";
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
    const storedPage = pages[slug];
    if (!storedPage) return renderNotFound();
    const isPrivacyPlaceholder = slug === "privacy" && /replace this sample policy|this template stores theme preference/i.test(String(storedPage.content || ""));
    const page = isPrivacyPlaceholder
      ? { title: "Privacy Policy", content: DEFAULT_PRIVACY_POLICY_HTML }
      : storedPage;
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
    } else if (hash === "top-recommendations") {
      result = renderTopRecommendations();
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
