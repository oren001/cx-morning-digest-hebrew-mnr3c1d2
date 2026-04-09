```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for API requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/' || path === '/index.html') {
        return new Response(getHTMLContent(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      if (path === '/api/articles' && request.method === 'GET') {
        const userId = url.searchParams.get('userId') || 'default';
        const articles = await getPersonalizedDigest(env, userId);
        return new Response(JSON.stringify(articles), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      if (path === '/api/track' && request.method === 'POST') {
        const data = await request.json();
        await trackReadingBehavior(env, data);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (path === '/api/history' && request.method === 'GET') {
        const userId = url.searchParams.get('userId') || 'default';
        const history = await getReadingHistory(env, userId);
        return new Response(JSON.stringify(history), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(scrapeAndStoreArticles(env));
  }
};

async function scrapeAndStoreArticles(env) {
  try {
    const ynetUrl = 'https://www.ynet.co.il/home/0,7340,L-8,00.html';
    const response = await fetch(ynetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const articles = parseYnetArticles(html);
    
    const timestamp = Date.now();
    await env.PERSONAL_NEWS_KV.put(
      `articles:${timestamp}`,
      JSON.stringify(articles),
      { expirationTtl: 86400 * 7 }
    );

    await env.PERSONAL_NEWS_KV.put('articles:latest', timestamp.toString());

    console.log(`Scraped ${articles.length} articles at ${new Date(timestamp).toISOString()}`);
  } catch (error) {
    console.error('Scraping error:', error);
  }
}

function parseYnetArticles(html) {
  const articles = [];
  
  const titleRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
  const matches = [...html.matchAll(titleRegex)];
  
  const seen = new Set();
  
  for (const match of matches) {
    let link = match[1];
    const title = match[2].trim();
    
    if (!title || title.length < 10 || seen.has(link)) continue;
    
    if (link.startsWith('//')) {
      link = 'https:' + link;
    } else if (link.startsWith('/')) {
      link = 'https://www.ynet.co.il' + link;
    }
    
    if (!link.includes('ynet.co.il') || !link.includes('articles')) continue;
    
    seen.add(link);
    
    const category = extractCategory(link);
    const keywords = extractKeywords(title);
    
    articles.push({
      id: hashString(link),
      title,
      link,
      category,
      keywords,
      scrapedAt: Date.now()
    });
    
    if (articles.length >= 50) break;
  }
  
  return articles;
}

function extractCategory(link) {
  if (link.includes('/news/')) return 'חדשות';
  if (link.includes('/sport/')) return 'כדורגל';
  if (link.includes('/entertainment/')) return 'בידור';
  if (link.includes('/economy/')) return 'כלכלה';
  if (link.includes('/health/')) return 'בריאות';
  if (link.includes('/digital/')) return 'טכנולוגיה';
  if (link.includes('/tourism/')) return 'תיירות';
  return 'כללי';
}

function extractKeywords(title) {
  const commonWords = ['של', 'את', 'על', 'עם', 'אל', 'לא', 'מה', 'זה', 'היא', 'הוא', 'אני', 'או', 'כי', 'יש', 'אין', 'גם'];
  const words = title.split(/\s+/)
    .filter(w => w.length > 2 && !commonWords.includes(w))
    .slice(0, 5);
  return words;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function getPersonalizedDigest(env, userId) {
  const latestTimestamp = await env.PERSONAL_NEWS_KV.get('articles:latest');
  
  if (!latestTimestamp) {
    return [];
  }
  
  const articlesJson = await env.PERSONAL_NEWS_KV.get(`articles:${latestTimestamp}`);
  
  if (!articlesJson) {
    return [];
  }
  
  const articles = JSON.parse(articlesJson);
  const preferences = await getUserPreferences(env, userId);
  
  const scoredArticles = articles.map(article => ({
    ...article,
    score: calculatePersonalizationScore(article, preferences)
  }));
  
  scoredArticles.sort((a, b) => b.score - a.score);
  
  return scoredArticles.slice(0, 15);
}

async function getUserPreferences(env, userId) {
  const prefsJson = await env.PERSONAL_NEWS_KV.get(`prefs:${userId}`);
  
  if (!prefsJson) {
    return {
      categoryWeights: {},
      keywordWeights: {},
      totalReads: 0
    };
  }
  
  return JSON.parse(prefsJson);
}

function calculatePersonalizationScore(article, preferences) {
  let score = 1.0;
  
  if (preferences.categoryWeights[article.category]) {
    score += preferences.categoryWeights[article.category] * 2;
  }
  
  for (const keyword of article.keywords) {
    if (preferences.keywordWeights[keyword]) {
      score += preferences.keywordWeights[keyword];
    }
  }
  
  const ageHours = (Date.now() - article.scrapedAt) / (1000 * 60 * 60);
  const recencyBoost = Math.max(0, 1 - (ageHours / 24));
  score += recencyBoost * 0.5;
  
  return score;
}

async function trackReadingBehavior(env, data) {
  const { userId = 'default', articleId, action, duration } = data;
  
  const article = await getArticleById(env, articleId);
  if (!article) return;
  
  const preferences = await getUserPreferences(env, userId);
  
  let weight = 0;
  if (action === 'click') weight = 0.5;
  else if (action === 'read' && duration > 10) weight = 1.0;
  else if (action === 'read' && duration > 30) weight = 2.0;
  else if (action === 'read' && duration > 60) weight = 3.0;
  
  if (!preferences.categoryWeights[article.category]) {
    preferences.categoryWeights[article.category] = 0;
  }
  preferences.categoryWeights[article.category] += weight;
  
  for (const keyword of article.keywords) {
    if (!preferences.keywordWeights[keyword]) {
      preferences.keywordWeights[keyword] = 0;
    }
    preferences.keywordWeights[keyword] += weight * 0.5;
  }
  
  preferences.totalReads = (preferences.totalReads || 0) + 1;
  
  normalizeWeights(preferences);
  
  await env.PERSONAL_NEWS_KV.put(
    `prefs:${userId}`,
    JSON.stringify(preferences)
  );
  
  const historyKey = `history:${userId}`;
  const historyJson = await env.PERSONAL_NEWS_KV.get(historyKey);
  const history = historyJson ? JSON.parse(historyJson) : [];
  
  history.unshift({
    articleId,
    title: article.title,
    action,
    duration,
    timestamp: Date.now()
  });
  
  await env.PERSONAL_NEWS_KV.put(
    historyKey,
    JSON.stringify(history.slice(0, 100))
  );
}

function normalizeWeights(preferences) {
  const maxCategoryWeight = Math.max(...Object.values(preferences.categoryWeights), 1);
  for (const key in preferences.categoryWeights) {
    preferences.categoryWeights[key] = preferences.categoryWeights[key] / maxCategoryWeight;
  }
  
  const maxKeywordWeight = Math.max(...Object.values(preferences.keywordWeights), 1);
  for (const key in preferences.keywordWeights) {
    preferences.keywordWeights[key] = preferences.keywordWeights[key] / maxKeywordWeight;
  }
}

async function getArticleById(env, articleId) {
  const latestTimestamp = await env.PERSONAL_NEWS_KV.get('articles:latest');
  if (!latestTimestamp) return null;
  
  const articlesJson = await env.PERSONAL_NEWS_KV.get(`articles:${latestTimestamp}`);
  if (!articlesJson) return null;
  
  const articles = JSON.parse(articlesJson);
  return articles.find(a => a.id === articleId);
}

async function getReadingHistory(env, userId) {
  const historyJson = await env.PERSONAL_NEWS_KV.get(`history:${userId}`);
  if (!historyJson) return [];
  
  return JSON.parse(historyJson);
}

function getHTMLContent() {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>התקציר הבוקר - עיתון אישי</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    h1 {
      font-size: 2em;
      margin-bottom: 10px;
    }

    .subtitle {
      opacity: 0.9;
      font-size: 1.1em;
    }

    .tabs {
      display: flex;
      background: #f5f5f5;
      border-bottom: 2px solid #e0e0e0;
    }

    .tab {
      flex: 1;
      padding: 15px;
      text-align: center;
      cursor: pointer;
      background: transparent;
      border: none;
      font-size: 1em;
      font-weight: 600;
      color: #666;
      transition: all 0.3s;
    }

    .tab.active {
      background: white;
      color: #667eea;
      border-bottom: 3px solid #667eea;
    }

    .tab:hover {
      background: rgba(102, 126, 234, 0.1);
    }

    .content {
      padding: 30px;
    }

    .view {
      display: none;
    }

    .view.active {
      display: block;
    }

    .article-card {
      background: #f9f9f9;
      padding: 20px;
      margin-bottom: 15px;
      border-radius: 12px;
      border-right: 4px solid #667eea;
      cursor: pointer;
      transition: all 0.3s;
      position: relative;
    }

    .article-card:hover {
      transform: translateX(-5px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .article-title {
      font-size: 1.2em;
      font-weight: 600;
      color: #333;
      margin-bottom: 10px;
      line-height: 1.4;
    }

    .article-meta {
      display: flex;
      gap: 15px;
      font-size: 0.9em;
      color: #666;
    }

    .category {
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
    }

    .score {
      background: #ffd700;
      color: #333;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 1.1em;
    }

    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .history-item {
      background: #f9f9f9;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 8px;
      border-right: 3px solid #764ba2;
    }

    .history-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }

    .history-meta {
      font-size: 0.85em;
      color: #666;
      display: flex;
      gap: 15px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }

    .stat-value {
      font-size: 2.5em;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .stat-label {
      font-size: 0.9em;
      opacity: 0.9;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }

    .empty-state-icon {
      font-size: 4em;
      margin-bottom: 20px;
    }

    @media (max-width: 600px) {
      body {
        padding: 10px;
      }

      .container {
        border-radius: 8px;
      }

      header {
        padding: 20px;
      }

      h1 {
        font-size: 1.5em;
      }

      .content {
        padding: 15px;
      }

      .article-title {
        font-size: 1.05em;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🌅 התקציר הבוקר</h1>
      <div class="subtitle">העיתון האישי שלך - חדשות מותאמות אישית</div>
    </header>

    <div class="tabs">
      <button class="tab active" data-view="digest">התקציר שלי</button>
      <button class="tab" data-view="history">היסטוריית קריאה</button>
    </div>

    <div class="content">
      <div id="digest-view" class="view active">
        <div class="loading">
          <div class="spinner"></div>
          <div>טוען את התקציר האישי שלך...</div>
        </div>
      </div>

      <div id="history-view" class="view">
        <div class="stats" id="stats"></div>
        <div id="history-list"></div>
      </div>
    </div>
  </div>

  <script>
    const userId = localStorage.getItem('userId') || 
      'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userId', userId);

    const tabs = document.querySelectorAll('.tab');
    const views = document.querySelectorAll('.view');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const viewName = tab.dataset.view;
        
        tabs.forEach(t => t.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(viewName + '-view').classList.add('active');
        
        if (viewName === 'history') {
          loadHistory();
        }
      });
    });

    async function loadDigest() {
      try {
        const response = await fetch('/api/articles?userId=' + userId);
        const articles = await response.json();
        
        const digestView = document.getElementById('digest-view');
        
        if (articles.length === 0) {
          digestView.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">📰</div>
              <h2>אין כתבות זמינות כרגע</h2>
              <p>התקציר הבא יגיע מחר בבוקר בשעה 6:00</p>
            </div>
          `;
          return;
        }
        
        digestView.innerHTML = articles.map(article => `
          <div class="article-card" data-id="${article.id}" data-link="${article.link}">
            <div class="article-title">${escapeHtml(article.title)}</div>
            <div class="article-meta">
              <span class="category">${article.category}</span>
              <span class="score">ציון: ${article.score.toFixed(1)}</span>
            </div>
          </div>
        `).join('');
        
        document.querySelectorAll('.article-card').forEach(card => {
          const startTime = Date.now();
          
          card.addEventListener('click', async () => {
            const articleId = card.dataset.id;
            const link = card.dataset.link;
            
            await fetch('/api/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                articleId,
                action: 'click',
                duration: 0
              })
            });
            
            window.open(link, '_blank');
            
            setTimeout(async () => {
              const duration = Math.floor((Date.now() - startTime) / 1000);
              await fetch('/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId,
                  articleId,
                  action: 'read',
                  duration
                })
              });
            }, 5000);
          });
        });
      } catch (error) {
        document.getElementById('digest-view').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h2>שגיאה בטעינת התקציר</h2>
            <p>${error.message}</p>
          </div>
        `;
      }
    }

    async function loadHistory() {
      try {
        const response = await fetch('/api/history?userId=' + userId);
        const history = await response.json();
        
        const totalReads = history.filter(h => h.action === 'read').length;
        const totalClicks = history.filter(h => h.action === 'click').length;
        const avgDuration = history.filter(h => h.duration > 0)
          .reduce((sum, h) => sum + h.duration, 0) / 
          (history.filter(h => h.duration > 0).length || 1);
        
        document.getElementById('stats').innerHTML = `
          <div class="stat-card">
            <div class="stat-value">${totalReads}</div>
            <div class="stat-label">כתבות שנקראו</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalClicks}</div>
            <div class="stat-label">לחיצות</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Math.round(avgDuration)}</div>
            <div class="stat-label">שניות קריאה ממוצעות</div>
          </div>
        `;
        
        const historyList = document.getElementById('history-list');
        
        if (history.length === 0) {
          historyList.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">📖</div>
              <h2>עדיין אין היסטוריה</h2>
              <p>התחל לקרוא כתבות כדי לראות את ההיסטוריה שלך כאן</p>
            </div>
          `;
          return;
        }
        
        historyList.innerHTML = history.map(item => `
          <div class="history-item">
            <div class="history-title">${escapeHtml(item.title)}</div>
            <div class="history-meta">
              <span>פעולה: ${item.action === 'click' ? 'לחיצה' : 'קריאה'}</span>
              ${item.duration ? `<span>משך: ${item.duration} שניות</span>` : ''}
              <span>${new Date(item.timestamp).toLocaleDateString('he-IL')}</span>
            </div>
          </div>
        `).join('');
      } catch (error) {
        document.getElementById('history-list').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h2>שגיאה בטעינת ההיסטוריה</h2>
          </div>
        `;
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    loadDigest();
  </script>
</body>
</html>`;
}
```