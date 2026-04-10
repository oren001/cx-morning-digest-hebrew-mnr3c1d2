/**
 * 🌅 התקציר הבוקר - Personal Hebrew Morning Digest
 * Cloudflare Worker - scrapes Ynet, learns preferences, delivers personalized morning digest
 */

// ─── HTML TEMPLATE ────────────────────────────────────────────────────────────

function getHTML(articles, userId, stats) {
  const articlesHTML = articles.length === 0
    ? `<div class="empty-state">
        <div class="empty-icon">🌅</div>
        <h2>אין כתבות עדיין</h2>
        <p>התקציר הבוקר מתעדכן כל בוקר בשעה 6:00. בוא מחר!</p>
        <button onclick="manualFetch()" class="btn-primary">🔄 עדכן עכשיו</button>
      </div>`
    : articles.map((a, i) => `
        <article class="article-card ${a.read ? 'read' : ''}" id="article-${i}" data-id="${a.id}" data-category="${a.category || 'general'}">
          <div class="article-meta">
            <span class="category-badge cat-${(a.category || 'general').replace(/\s/g,'-')}">${a.category || 'כללי'}</span>
            <span class="score-badge" title="ציון התאמה אישית">⭐ ${Math.round((a.personalScore || 0.5) * 100)}%</span>
          </div>
          ${a.image ? `<div class="article-image"><img src="${a.image}" alt="${a.title}" loading="lazy" onerror="this.parentElement.remove()"></div>` : ''}
          <div class="article-body">
            <h2 class="article-title">
              <a href="${a.url}" target="_blank" rel="noopener" onclick="trackClick('${a.id}','${a.category || 'general'}',this)">${a.title}</a>
            </h2>
            <p class="article-summary">${a.summary || ''}</p>
            <div class="article-footer">
              <span class="article-time">🕐 ${a.publishedAt || ''}</span>
              <button class="read-later" onclick="toggleSave('${a.id}',this)" title="שמור לקריאה מאוחר יותר">🔖</button>
            </div>
          </div>
        </article>
      `).join('');

  const statsHTML = stats ? `
    <div class="stats-bar">
      <span>📰 ${stats.totalArticles || 0} כתבות היום</span>
      <span>👁️ קראת ${stats.readToday || 0} כתבות</span>
      <span>🎯 ${stats.topCategory || 'כללי'} הנושא המועדף</span>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="התקציר הבוקר האישי שלך - כתבות מובחרות מ-Ynet מותאמות לטעם שלך">
  <title>🌅 התקציר הבוקר - תקציר חדשות אישי</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌅</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a1a;
      --bg-card: #12122a;
      --bg-card-hover: #1a1a38;
      --accent-gold: #f5a623;
      --accent-orange: #ff6b35;
      --accent-blue: #4a9eff;
      --accent-purple: #9b59b6;
      --text-primary: #f0f0f0;
      --text-secondary: #a0a0b0;
      --text-muted: #606080;
      --border: rgba(255,255,255,0.08);
      --shadow: 0 8px 32px rgba(0,0,0,0.4);
      --radius: 16px;
      --radius-sm: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Heebo', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      direction: rtl;
      text-align: right;
    }

    /* ─── HEADER ─── */
    header {
      background: linear-gradient(135deg, #1a0a2e 0%, #0d1b4a 50%, #1a0a2e 100%);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
    }

    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
      gap: 16px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      font-size: 32px;
      filter: drop-shadow(0 0 12px rgba(245,166,35,0.5));
      animation: pulse-glow 3s ease-in-out infinite;
    }

    @keyframes pulse-glow {
      0%, 100% { filter: drop-shadow(0 0 12px rgba(245,166,35,0.5)); }
      50% { filter: drop-shadow(0 0 20px rgba(245,166,35,0.9)); }
    }

    .logo-text h1 {
      font-size: 20px;
      font-weight: 800;
      background: linear-gradient(135deg, #f5a623, #ff6b35);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
    }

    .logo-text span {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 400;
    }

    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 24px;
      border: none;
      cursor: pointer;
      font-family: 'Heebo', sans-serif;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent-gold), var(--accent-orange));
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(245,166,35,0.4);
    }

    .btn-ghost {
      background: rgba(255,255,255,0.08);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    .btn-ghost:hover {
      background: rgba(255,255,255,0.14);
      color: var(--text-primary);
    }

    /* ─── STATS BAR ─── */
    .stats-bar {
      background: rgba(245,166,35,0.08);
      border-bottom: 1px solid rgba(245,166,35,0.15);
      padding: 10px 24px;
      display: flex;
      gap: 24px;
      justify-content: center;
      flex-wrap: wrap;
      font-size: 13px;
      color: var(--accent-gold);
      font-weight: 500;
    }

    /* ─── FILTER BAR ─── */
    .filter-bar {
      max-width: 1200px;
      margin: 24px auto 0;
      padding: 0 24px;
    }

    .filter-scroll {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
      scrollbar-width: none;
    }

    .filter-scroll::-webkit-scrollbar { display: none; }

    .filter-chip {
      flex-shrink: 0;
      padding: 6px 16px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      font-family: 'Heebo', sans-serif;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-chip.active, .filter-chip:hover {
      background: linear-gradient(135deg, var(--accent-gold), var(--accent-orange));
      color: white;
      border-color: transparent;
    }

    /* ─── MAIN GRID ─── */
    main {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 24px 80px;
    }

    .articles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 20px;
    }

    /* ─── ARTICLE CARD ─── */
    .article-card {
      background: var(--bg-card);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      overflow: hidden;
      transition: all 0.3s ease;
      animation: fadeIn 0.4s ease forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .article-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(245,166,35,0.3);
      transform: translateY(-4px);
      box-shadow: var(--shadow), 0 0 0 1px rgba(245,166,35,0.1);
    }

    .article-card.read {
      opacity: 0.6;
    }

    .article-card.read:hover {
      opacity: 1;
    }

    .article-meta {
      padding: 14px 16px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .category-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 12px;
      letter-spacing: 0.3px;
    }

    .cat-חדשות, .cat-כללי { background: rgba(74,158,255,0.2); color: #4a9eff; }
    .cat-כלכלה { background: rgba(39,174,96,0.2); color: #27ae60; }
    .cat-ספורט { background: rgba(231,76,60,0.2); color: #e74c3c; }
    .cat-טכנולוגיה { background: rgba(155,89,182,0.2); color: #9b59b6; }
    .cat-בידור { background: rgba(241,196,15,0.2); color: #f1c40f; }
    .cat-בריאות { background: rgba(26,188,156,0.2); color: #1abc9c; }
    .cat-default { background: rgba(255,255,255,0.1); color: var(--text-secondary); }

    .score-badge {
      font-size: 11px;
      color: var(--accent-gold);
      font-weight: 600;
    }

    .article-image {
      width: 100%;
      height: 180px;
      overflow: hidden;
    }

    .article-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }

    .article-card:hover .article-image img {
      transform: scale(1.05);
    }

    .article-body {
      padding: 14px 16px 16px;
    }

    .article-title {
      font-size: 17px;
      font-weight: 700;
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .article-title a {
      color: var(--text-primary);
      text-decoration: none;
      transition: color 0.2s;
    }

    .article-title a:hover {
      color: var(--accent-gold);
    }

    .article-summary {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .article-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .article-time {
      font-size: 12px;
      color: var(--text-muted);
    }

    .read-later {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 8px;
      transition: all 0.2s;
      opacity: 0.5;
    }

    .read-later:hover, .read-later.saved {
      opacity: 1;
      background: rgba(255,255,255,0.08);
    }

    /* ─── EMPTY STATE ─── */
    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 80px 20px;
    }

    .empty-icon {
      font-size: 72px;
      margin-bottom: 20px;
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-12px); }
    }

    .empty-state h2 {
      font-size: 24px;
      color: var(--text-primary);
      margin-bottom: 12px;
    }

    .empty-state p {
      color: var(--text-secondary);
      margin-bottom: 24px;
    }

    /* ─── TOAST ─── */
    #toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: rgba(30,30,50,0.95);
      backdrop-filter: blur(20px);
      color: white;
      padding: 12px 24px;
      border-radius: 50px;
      border: 1px solid var(--border);
      font-size: 14px;
      font-weight: 500;
      transition: transform 0.3s ease;
      z-index: 1000;
      white-space: nowrap;
      box-shadow: var(--shadow);
    }

    #toast.show { transform: translateX(-50%) translateY(0); }

    /* ─── LOADING ─── */
    .loading-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      gap: 16px;
      grid-column: 1 / -1;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--accent-gold);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ─── RESPONSIVE ─── */
    @media (max-width: 640px) {
      .header-content { height: 60px; }
      .logo-text span { display: none; }
      .articles-grid { grid-template-columns: 1fr; gap: 14px; }
      main { padding: 0 16px 60px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <div class="logo">
        <div class="logo-icon">🌅</div>
        <div class="logo-text">
          <h1>התקציר הבוקר</h1>
          <span>חדשות מ-Ynet מותאמות אישית</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="showHistory()" id="btn-history">📊 היסטוריה</button>
        <button class="btn btn-primary" onclick="manualFetch()" id="btn-refresh">🔄 עדכן</button>
      </div>
    </div>
  </header>

  ${statsHTML}

  <div class="filter-bar">
    <div class="filter-scroll" id="filterBar">
      <button class="filter-chip active" onclick="filterBy('all', this)">הכל</button>
      <button class="filter-chip" onclick="filterBy('חדשות', this)">חדשות</button>
      <button class="filter-chip" onclick="filterBy('כלכלה', this)">כלכלה</button>
      <button class="filter-chip" onclick="filterBy('ספורט', this)">ספורט</button>
      <button class="filter-chip" onclick="filterBy('טכנולוגיה', this)">טכנולוגיה</button>
      <button class="filter-chip" onclick="filterBy('בידור', this)">בידור</button>
      <button class="filter-chip" onclick="filterBy('בריאות', this)">בריאות</button>
    </div>
  </div>

  <main>
    <div class="articles-grid" id="articlesGrid">
      ${articlesHTML}
    </div>
  </main>

  <div id="toast"></div>

  <script>
    const USER_ID = '${userId}';
    const readTimes = {};
    const saved = JSON.parse(localStorage.getItem('saved') || '[]');

    // Mark saved articles
    saved.forEach(id => {
      const btn = document.querySelector(\`.read-later[onclick*="\${id}"]\`);
      if (btn) btn.classList.add('saved');
    });

    // Track read time when leaving articles
    document.querySelectorAll('.article-card').forEach(card => {
      const id = card.dataset.id;
      let startTime = null;

      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            startTime = Date.now();
          } else if (startTime) {
            const duration = Date.now() - startTime;
            if (duration > 3000) trackRead(id, card.dataset.category, duration);
            startTime = null;
          }
        });
      }, { threshold: 0.5 });

      obs.observe(card);
    });

    async function trackClick(articleId, category, el) {
      const card = el.closest('.article-card');
      if (card) card.classList.add('read');
      try {
        await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId, action: 'click', category, userId: USER_ID })
        });
      } catch(e) {}
    }

    async function trackRead(articleId, category, duration) {
      try {
        await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId, action: 'read', category, duration, userId: USER_ID })
        });
      } catch(e) {}
    }

    function toggleSave(id, btn) {
      const idx = saved.indexOf(id);
      if (idx === -1) {
        saved.push(id);
        btn.classList.add('saved');
        showToast('🔖 נשמר לקריאה מאוחרת');
      } else {
        saved.splice(idx, 1);
        btn.classList.remove('saved');
        showToast('🗑️ הוסר מהשמורים');
      }
      localStorage.setItem('saved', JSON.stringify(saved));
    }

    function filterBy(cat, btn) {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.article-card').forEach(card => {
        if (cat === 'all' || card.dataset.category === cat) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    async function manualFetch() {
      const btn = document.getElementById('btn-refresh');
      btn.textContent = '⏳ מעדכן...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/fetch-now', { method: 'POST' });
        const data = await res.json();
        showToast('✅ ' + (data.message || 'עודכן בהצלחה!'));
        setTimeout(() => location.reload(), 1500);
      } catch(e) {
        showToast('❌ שגיאה בעדכון');
      }
      btn.textContent = '🔄 עדכן';
      btn.disabled = false;
    }

    async function showHistory() {
      try {
        const res = await fetch('/api/history?days=7');
        const data = await res.json();
        const total = data.history ? data.history.length : 0;
        showToast(\`📊 קראת \${total} כתבות ב-7 הימים האחרונים\`);
      } catch(e) {
        showToast('📊 אין היסטוריה עדיין');
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>`;
}

// ─── YNET RSS SCRAPER ─────────────────────────────────────────────────────────
// Using RSS feeds instead of HTML scraping — Ynet is React-rendered so HTML
// scraping returns empty content. RSS is structured XML, always works.

const YNET_RSS_FEEDS = [
  { url: 'https://www.ynet.co.il/Integration/StoryRss2.xml',    category: 'חדשות' },
  { url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', category: 'כלכלה' },
  { url: 'https://www.ynet.co.il/Integration/StoryRss3262.xml', category: 'טכנולוגיה' },
  { url: 'https://www.ynet.co.il/Integration/StoryRss6.xml',    category: 'ספורט' },
  { url: 'https://www.ynet.co.il/Integration/StoryRss3084.xml', category: 'בידור' },
  { url: 'https://www.ynet.co.il/Integration/StoryRss5099.xml', category: 'בריאות' },
];

// Simple RSS/XML field extractor
function extractXML(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const m = re.exec(xml);
  if (!m) return '';
  return (m[1] || m[2] || '').trim();
}

function extractAllXML(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push((m[1] || m[2] || '').trim());
  }
  return results;
}

function extractItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    items.push(m[1]);
  }
  return items;
}

function parseRSSDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    // Convert to Israel time (UTC+3)
    const israelTime = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    return `${israelTime.getUTCHours().toString().padStart(2,'0')}:${israelTime.getUTCMinutes().toString().padStart(2,'0')}`;
  } catch(e) {
    return '';
  }
}

function extractImage(itemXml) {
  // Try enclosure tag
  const encRe = /<enclosure[^>]+url="([^"]+)"[^>]*>/i;
  let m = encRe.exec(itemXml);
  if (m) return m[1];

  // Try media:content
  const mediaRe = /<media:content[^>]+url="([^"]+)"[^>]*>/i;
  m = mediaRe.exec(itemXml);
  if (m) return m[1];

  // Try img in description
  const imgRe = /<img[^>]+src="([^"]+)"/i;
  m = imgRe.exec(itemXml);
  if (m) return m[1];

  return null;
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')           // strip HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeYnet() {
  const articles = [];
  const seen = new Set();

  const fetches = YNET_RSS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MorningDigestBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
        cf: { cacheTtl: 300 } // cache 5 min in CF edge
      });

      if (!res.ok) {
        console.error(`RSS fetch failed for ${feed.url}: ${res.status}`);
        return;
      }

      const xml = await res.text();
      const items = extractItems(xml);
      const now = new Date();

      for (const item of items.slice(0, 15)) {
        const rawTitle = extractXML(item, 'title');
        const rawLink  = extractXML(item, 'link') || extractXML(item, 'guid');
        const rawDesc  = extractXML(item, 'description');
        const rawDate  = extractXML(item, 'pubDate');

        const title = cleanText(rawTitle);
        const url   = rawLink.startsWith('http') ? rawLink : `https://www.ynet.co.il${rawLink}`;
        const summary = cleanText(rawDesc).slice(0, 200);
        const image = extractImage(item);
        const publishedAt = parseRSSDate(rawDate) || `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

        if (!title || title.length < 5) continue;
        if (seen.has(url)) continue;
        seen.add(url);

        const id = hashString(url);
        articles.push({
          id,
          url,
          title,
          summary,
          image,
          category: feed.category,
          publishedAt,
          scrapedAt: now.toISOString(),
          personalScore: 0.5,
        });
      }
    } catch (err) {
      console.error(`Error fetching RSS ${feed.url}:`, err.message);
    }
  });

  // Fetch all feeds in parallel (no delays needed with RSS)
  await Promise.all(fetches);

  console.log(`📰 Total articles scraped: ${articles.length}`);
  return articles;
}

// ─── ML PREFERENCE ENGINE ──────────────────────────────────────────────────────

async function rankArticles(articles, userId, env) {
  if (!env.ARTICLES_KV || articles.length === 0) return articles;

  let prefs = {};
  try {
    const raw = await env.ARTICLES_KV.get(`prefs:${userId}`);
    if (raw) prefs = JSON.parse(raw);
  } catch(e) {}

  // Score each article
  const ranked = articles.map(article => {
    let score = 0.5;

    // Category affinity (0-40 points)
    const catScore = prefs.categories?.[article.category] || 0;
    score += catScore * 0.4;

    // Keyword matching (0-30 points) 
    if (prefs.keywords) {
      const titleWords = article.title.split(/\s+/);
      let kwMatch = 0;
      for (const word of titleWords) {
        if (prefs.keywords[word]) kwMatch += prefs.keywords[word];
      }
      score += Math.min(kwMatch * 0.01, 0.3);
    }

    // Recency bonus (0-20 points) - newer content scores higher
    const age = Date.now() - new Date(article.scrapedAt || Date.now()).getTime();
    const recencyScore = Math.max(0, 1 - age / (12 * 60 * 60 * 1000));
    score += recencyScore * 0.2;

    // Already-read penalty (-30 points)
    if (prefs.readArticles?.includes(article.id)) score -= 0.3;

    return { ...article, personalScore: Math.max(0, Math.min(1, score)) };
  });

  // Sort by score descending
  ranked.sort((a, b) => b.personalScore - a.personalScore);
  return ranked;
}

async function updatePreferences(userId, articleId, action, category, duration, env) {
  if (!env.ARTICLES_KV) return;

  const key = `prefs:${userId}`;
  let prefs = {};
  try {
    const raw = await env.ARTICLES_KV.get(key);
    if (raw) prefs = JSON.parse(raw);
  } catch(e) {}

  if (!prefs.categories) prefs.categories = {};
  if (!prefs.readArticles) prefs.readArticles = [];
  if (!prefs.history) prefs.history = [];

  const now = new Date().toISOString();

  if (action === 'click') {
    // Boost category score
    prefs.categories[category] = Math.min(1, (prefs.categories[category] || 0) + 0.15);
    if (!prefs.readArticles.includes(articleId)) {
      prefs.readArticles.push(articleId);
    }
    // Keep only last 200 read articles
    if (prefs.readArticles.length > 200) {
      prefs.readArticles = prefs.readArticles.slice(-200);
    }
  }

  if (action === 'read' && duration > 5000) {
    // More reading time = stronger preference
    const boost = Math.min(0.3, duration / 120000);
    prefs.categories[category] = Math.min(1, (prefs.categories[category] || 0) + boost);
  }

  // Add to history
  prefs.history.push({ articleId, action, category, duration, timestamp: now });
  if (prefs.history.length > 500) {
    prefs.history = prefs.history.slice(-500);
  }

  // Decay all scores slightly (temporal decay)
  for (const cat in prefs.categories) {
    prefs.categories[cat] *= 0.98;
  }

  await env.ARTICLES_KV.put(key, JSON.stringify(prefs), {
    expirationTtl: 90 * 24 * 60 * 60 // 90 days
  });
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function generateUserId() {
  return 'u_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now().toString(36);
}

function getUserId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/digest_uid=([^;]+)/);
  return match ? match[1] : null;
}

function setUserIdCookie(userId) {
  return `digest_uid=${userId}; Path=/; Max-Age=${90 * 24 * 60 * 60}; SameSite=Lax`;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ─── MAIN WORKER ──────────────────────────────────────────────────────────────

export default {
  // HTTP Request Handler
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Get or create user ID
    let userId = getUserId(request);
    let isNewUser = false;
    if (!userId) {
      userId = generateUserId();
      isNewUser = true;
    }

    const headers = {
      ...corsHeaders(),
      'Content-Type': 'text/html; charset=utf-8',
    };

    if (isNewUser) {
      headers['Set-Cookie'] = setUserIdCookie(userId);
    }

    // ── Routes ──
    try {

      // POST /api/fetch-now - manually trigger scrape
      if (path === '/api/fetch-now' && request.method === 'POST') {
        ctx.waitUntil(fetchAndStore(env));
        return new Response(
          JSON.stringify({ ok: true, message: 'עדכון החל, טען מחדש בעוד כמה שניות' }),
          { headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }

      // POST /api/track - track reading behavior
      if (path === '/api/track' && request.method === 'POST') {
        try {
          const body = await request.json();
          const uid = body.userId || userId;
          ctx.waitUntil(updatePreferences(uid, body.articleId, body.action, body.category, body.duration || 0, env));
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
          });
        } catch(e) {
          return new Response(JSON.stringify({ ok: false }), { status: 400, headers: corsHeaders() });
        }
      }

      // GET /api/articles - get personalized articles list
      if (path === '/api/articles') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        let articles = [];
        if (env.ARTICLES_KV) {
          const raw = await env.ARTICLES_KV.get('articles:today');
          if (raw) articles = JSON.parse(raw);
        }
        const ranked = await rankArticles(articles, userId, env);
        return new Response(
          JSON.stringify(ranked.slice(0, limit)),
          { headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }

      // GET /api/history - get reading history
      if (path === '/api/history') {
        const days = parseInt(url.searchParams.get('days') || '30');
        let prefs = {};
        if (env.ARTICLES_KV) {
          const raw = await env.ARTICLES_KV.get(`prefs:${userId}`);
          if (raw) prefs = JSON.parse(raw);
        }

        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const history = (prefs.history || []).filter(h => new Date(h.timestamp).getTime() > cutoff);
        return new Response(
          JSON.stringify({ history, categories: prefs.categories || {} }),
          { headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }

      // GET / - main HTML page
      if (path === '/' || path === '') {
        let articles = [];
        if (env.ARTICLES_KV) {
          const raw = await env.ARTICLES_KV.get('articles:today');
          if (raw) articles = JSON.parse(raw);
        }

        const ranked = await rankArticles(articles, userId, env);
        const limit = 24;

        // Build stats
        let prefs = {};
        if (env.ARTICLES_KV) {
          const raw = await env.ARTICLES_KV.get(`prefs:${userId}`);
          if (raw) prefs = JSON.parse(raw);
        }

        const today = new Date().toDateString();
        const readToday = (prefs.history || []).filter(h => new Date(h.timestamp).toDateString() === today && h.action === 'click').length;
        const topCategory = Object.entries(prefs.categories || {}).sort((a,b) => b[1]-a[1])[0]?.[0] || 'כללי';

        const stats = {
          totalArticles: articles.length,
          readToday,
          topCategory,
        };

        const html = getHTML(ranked.slice(0, limit), userId, stats);
        return new Response(html, { headers });
      }

      // 404
      return new Response('לא נמצא', { status: 404, headers });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(`שגיאה: ${err.message}`, { status: 500, headers });
    }
  },

  // Scheduled Cron Handler - runs daily at 6 AM Israel time
  async scheduled(event, env, ctx) {
    console.log('🌅 Morning digest cron triggered:', new Date().toISOString());
    ctx.waitUntil(fetchAndStore(env));
  }
};

// ─── FETCH AND STORE ──────────────────────────────────────────────────────────

async function fetchAndStore(env) {
  try {
    console.log('📰 Starting Ynet scrape...');
    const articles = await scrapeYnet();
    console.log(`✅ Scraped ${articles.length} articles`);

    if (articles.length > 0 && env.ARTICLES_KV) {
      await env.ARTICLES_KV.put('articles:today', JSON.stringify(articles), {
        expirationTtl: 24 * 60 * 60 // expire after 24h
      });
      console.log('💾 Articles stored in KV');
    }

    return articles;
  } catch (err) {
    console.error('❌ fetchAndStore error:', err);
    return [];
  }
}