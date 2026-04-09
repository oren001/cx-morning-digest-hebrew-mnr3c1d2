# עיתון אישי - התקציר הבוקר

Personal morning digest that scrapes Ynet news, learns your preferences based on reading behavior, and delivers one personalized summary link every morning.

## Features

- 📰 Daily Ynet news scraping via scheduled Worker
- 🧠 Machine learning preference tracking (reads, clicks, time-on-page)
- 🎯 Personalized digest generation
- 📧 Single morning link delivery
- 🇮🇱 Hebrew RTL support
- 📊 Reading history analytics
- 🔐 Privacy-first: all data stays in your KV namespace

## Prerequisites

- Node.js 16+ and npm
- Cloudflare account with Workers and KV enabled
- Wrangler CLI installed globally: `npm install -g wrangler`

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd personal-news-digest
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

Follow the browser authentication flow.

### 3. Create KV Namespaces

Create two KV namespaces (production and preview):

```bash
# Production namespace
wrangler kv:namespace create "DIGEST_KV"

# Preview namespace for development
wrangler kv:namespace create "DIGEST_KV" --preview
```

Copy the output IDs and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "DIGEST_KV"
id = "your-production-namespace-id"
preview_id = "your-preview-namespace-id"
```

### 4. Configure Environment Variables (Optional)

If you need custom environment variables:

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars` with your values. This file is automatically loaded by Wrangler during local development.

### 5. Local Development

Run the Worker locally with hot reload:

```bash
npm run dev
# or
wrangler dev
```

Visit `http://localhost:8787` to test the application.

### 6. Deploy to Production

Deploy the Worker to Cloudflare:

```bash
npm run deploy
# or
wrangler deploy
```

The Worker will be deployed with:
- Cron trigger: Daily at 6:00 AM Israel time (0 6 * * *)
- KV namespace bindings
- API endpoints and static HTML serving

### 7. Verify Cron Configuration

Check that the scheduled trigger is active:

```bash
wrangler deployments list
```

The cron will run automatically every day at 6 AM Israel time to scrape Ynet and update articles.

## Usage

### First Visit

1. Open your Worker URL: `https://your-worker.your-subdomain.workers.dev`
2. Browse the daily digest of articles
3. Click articles to read them (opens in new tab)
4. Your reading behavior is automatically tracked

### Preference Learning

The system learns your preferences based on:
- **Click rate**: Which articles you choose to read
- **Reading time**: How long you spend on each article
- **Topic affinity**: Categories you engage with most
- **Recency**: More weight on recent behavior

Articles are scored using a weighted algorithm:
- 40% click history
- 30% reading time
- 20% topic preference
- 10% temporal decay

### Daily Digest

Every morning at 6 AM:
1. Worker scrapes latest Ynet articles
2. Applies your learned preferences
3. Ranks and filters articles
4. Generates personalized digest

### Analytics

View your reading history:
- Visit `/api/history` endpoint
- See tracked articles, read times, and preference scores
- JSON format for easy analysis

## API Endpoints

### `GET /`
Returns the HTML application interface

### `GET /api/articles`
Returns personalized article digest
- Query params: `?limit=20` (default: 20)
- Response: Array of ranked articles

### `POST /api/track`
Track reading behavior
```json
{
  "articleId": "article-url-hash",
  "action": "click|read",
  "duration": 45000,
  "category": "politics"
}
```

### `GET /api/history`
Get reading analytics
- Query params: `?days=30` (default: 30)
- Response: Reading history and stats

## Hebrew Language Notes

### RTL Support

The application fully supports Hebrew right-to-left layout:
- CSS `direction: rtl` on body
- Proper text alignment for Hebrew content
- Icon and UI element positioning adjusted for RTL

### Font Recommendations

For best Hebrew readability, the app uses:
- Primary: System fonts (San Francisco, Segoe UI)
- Fallback: Arial, sans-serif
- Font size: 16px base for comfortable reading

### Content Encoding

All API responses use UTF-8 encoding to properly handle Hebrew characters. No special configuration needed.

## Troubleshooting

### Cron Not Running

Check cron trigger configuration:
```bash
wrangler tail
```

Verify the cron expression in `wrangler.toml` matches your intended schedule.

### KV Namespace Errors

Ensure KV bindings are correct:
```bash
wrangler kv:namespace list
```

Update IDs in `wrangler.toml` if needed.

### Scraping Issues

Ynet's HTML structure may change. If articles aren't loading:
1. Check Worker logs: `wrangler tail`
2. Verify scraper selectors in `index.js`
3. Respect rate limits (10 second delay between requests)

### Hebrew Encoding Issues

Ensure all files are saved with UTF-8 encoding. If Hebrew appears garbled:
- Check file encoding in your editor
- Verify HTTP response headers include `charset=utf-8`

## Privacy & Data Storage

All user data is stored in Cloudflare KV:
- **Articles**: Cached for 24 hours
- **Preferences**: Stored indefinitely, per-user
- **Reading history**: Last 90 days kept
- **No external analytics**: Everything stays in your Worker

Data is keyed by anonymous user IDs (UUID generated on first visit).

## Development

### Project Structure

```
├── index.js          # Main Worker (API routes, cron, scraper, ML)
├── wrangler.toml     # Cloudflare configuration
├── package.json      # Dependencies
├── .gitignore        # Git exclusions
├── .env.example      # Environment template
└── README.md         # This file
```

### Key Dependencies

- `wrangler`: Cloudflare Workers CLI
- No external libraries in Worker runtime (vanilla JS)

### Testing

Test locally before deploying:
```bash
# Terminal 1: Start dev server
wrangler dev

# Terminal 2: Test endpoints
curl http://localhost:8787/api/articles
curl -X POST http://localhost:8787/api/track -d '{"articleId":"test","action":"click"}'
```

## Contributing

Contributions welcome! Areas for improvement:
- Enhanced ML algorithms
- Additional news sources
- UI/UX refinements
- Accessibility improvements
- Email delivery integration

## License

MIT License - feel free to use and modify for your personal news digest.

---

**Built with ❤️ for Hebrew readers who want their morning news personalized**