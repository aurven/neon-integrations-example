# Neon Integrations Example

A comprehensive Node.js integration hub built with Fastify that serves as a bridge between Neon CMS and various external systems. The server provides webhook handling, rich text editing, Telegram integration, and multiple third-party service connections.

## Features

- **Webhook System**: Multi-site routing for Neon CMS webhooks with Telegram integration
- **Mobile Client POC**: Rich text editor with Quill.js and XML generation
- **Content Management**: Article cards interface with CRUD operations
- **Third-party Integrations**: Guardian API, RSS feeds, Mailjet, SendGrid, OpenAI, and more
- **HTTPS Support**: Local SSL certificates for custom domain development
- **Auto-restart**: Development mode with file watching using nodemon

## Quick Start

### Prerequisites

- Node.js 20.x
- npm
- Homebrew (for macOS SSL setup)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd neon-integrations-example
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## HTTPS Development Setup

To run the application locally with HTTPS and custom domain support:

### Step 1: Install mkcert

```bash
# Install mkcert (certificate authority for localhost)
brew install mkcert

# Install local CA root certificate (requires sudo)
sudo mkcert -install
```

### Step 2: Generate SSL Certificates

```bash
# Generate certificates for your custom domain
mkcert integrations.neon-examples.test localhost 127.0.0.1 ::1

# Move certificates to ssl directory
mkdir -p ssl
mv integrations.neon-examples.test+3.pem ssl/
mv integrations.neon-examples.test+3-key.pem ssl/
```

### Step 3: Configure Local DNS

Add the following line to your `/etc/hosts` file:

```bash
# Edit hosts file (requires sudo)
sudo vim /etc/hosts

# Add this line:
127.0.0.1 integrations.neon-examples.test
```

### Step 4: Update Environment Configuration

In your `.env` file, set:

```bash
PORT=54861
PROJECT_DOMAIN=https://integrations.neon-examples.test:54861
```

### Step 5: Start HTTPS Server

```bash
npm run dev
```

The application will now be available at:
- 🔒 **HTTPS Custom Domain**: https://integrations.neon-examples.test:54861
- 📱 **Local HTTPS**: https://localhost:54861
- 🌐 **HTTP fallback**: http://localhost:54861 (if certificates not found)

## Available Endpoints

### Main Pages
- `/` - Home page
- `/services` - Services dashboard with all available integrations
- `/mobileclient` - Mobile-optimized article management interface
- `/mobileclient/editor` - Rich text editor for creating/editing articles

### API Endpoints

#### Webhooks
- `POST /in/neon/webhook` - Process incoming Neon CMS webhooks
- `POST /in/neon/webhook/test` - Test webhook handler

#### Mobile Client API
- `GET /mobileclient/api/articles` - List articles with metadata
- `GET /mobileclient/api/articles/:id` - Get specific article by UUID
- `POST /mobileclient/save` - Save article with XML generation

#### Content Import (Inbound)
- `POST /in/neon` - Generic import from external sources
- `POST /in/neon/from/guardian` - Import from The Guardian API
- `POST /in/neon/from/rss` - Import from RSS feeds
- `POST /in/binary` - Upload binary files

#### Delayed Import (Feed Simulation)
- `POST /in/delayed-import` - Submit a batch of stories/images imported one at a time, spread evenly over a timespan, into a target workfolder
- `GET /in/delayed-import` - List jobs (running + recently finished)
- `GET /in/delayed-import/:jobId` - Job status with per-item results
- `DELETE /in/delayed-import/:jobId` - Cancel pending imports (already-imported items are kept)

Example request body:

```json
{
  "duration": 30,
  "site": "demo-site",
  "workspace": "Demo Workspace",
  "workfolder": "/Demo/Imports",
  "publish": false,
  "assignTo": "62038d84-f161-3579-a5f1-7aba053f999a",
  "items": [
    { "type": "story", "title": "Headline", "content": "<p>Body HTML</p>" },
    { "type": "image", "url": "https://example.com/pic.jpg", "metadata": { "caption": "…", "credit": "…" } }
  ]
}
```

`duration` is in minutes; the interval between items is `duration / items.length`, first item fires immediately. Per-item `workfolder` overrides the job default. `assignTo` (a Neon user ID, or array of them) sets the workflow assignee for story items during their workflow transitions; per-item `assignTo` overrides the job default. Jobs are in-memory only (lost on restart). Full design: `docs/superpowers/specs/2026-06-10-delayed-importer-design.md`.

#### Content Export (Outbound)
- `POST /out/methode` - Export to Méthode CMS
- `POST /out/imagesToMethode` - Export images to Méthode
- `POST /out/sendgrid` - Export to SendGrid email marketing
- `POST /out/mailjet` - Export to Mailjet email service

#### Utilities
- `POST /utilities/cleanup` - Clean and format HTML content
- `POST /ai/openai` - AI-powered content processing
- `GET /sources/pexels` - Search stock images from Pexels

## Environment Variables

### Server Configuration
```bash
PORT=54861                    # Server port
HOST=0.0.0.0                 # Server host (0.0.0.0 for all interfaces)
NODE_ENV=development         # Environment mode
PROJECT_DOMAIN=https://integrations.neon-examples.test:54861
```

### Neon CMS Configuration
```bash
NEON_BO_URL=https://your-neon-bo.domain.com
NEON_BO_APIKEY=your_neon_bo_api_key
NEON_FO_URL=https://your-neon-fo.example.io
NEON_FO_APIKEY=your_neon_fo_api_key
NEON_APP_URL=https://your-neon-app.domain.com
NEON_USERNAME=your.username
NEON_PASSWORD=your_password
NEON_EXT_LOCATION=Local
NEON_EXT_APIKEY=your_external_api_key
```

### Third-party Services
```bash
# Email Services
MAILJET_APIKEY=your_mailjet_api_key
MAILJET_APISECRET=your_mailjet_secret
SENDGRID_APIKEY=your_sendgrid_api_key

# AI Services
OPENAI_APIKEY=your_openai_api_key
DEEPL_APIKEY=your_deepl_api_key

# Media & News
PEXELS_APIKEY=your_pexels_api_key
GUARDIAN_APIKEY=your_guardian_api_key

# Telegram Integration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_default_chat_id
TELEGRAM_THEGLOBE_CHAT_ID=your_theglobe_chat_id

# Other Services
TRELLO_APIKEY=your_trello_api_key
TRELLO_TOKEN=your_trello_token
```

### Méthode CMS Integration
```bash
SERVER_EDAPI=https://your-swing-api.domain.com
EDAPI_REST_ENDPOINT=/swing/api/rest
EDAPI_USERNAME=your_edapi_username
EDAPI_PASSWORD=your_edapi_password
CONNECTIONID=Editorial
DATABASEID=33
```

## Development Scripts

```bash
npm start          # Production server
npm run dev        # Development with auto-restart (nodemon)
npm run dev:legacy # Development without auto-restart
```

## SSL Certificate Management

### Certificate Renewal
Certificates generated by mkcert are valid for ~2 years. To renew:

```bash
# Remove old certificates
rm ssl/integrations.neon-examples.test+3*

# Generate new certificates
mkcert integrations.neon-examples.test localhost 127.0.0.1 ::1
mv integrations.neon-examples.test+3* ssl/
```

### Adding Additional Domains
To add more custom domains:

```bash
# Generate certificate with multiple domains
mkcert integrations.neon-examples.test another-domain.dev localhost 127.0.0.1 ::1

# Add to /etc/hosts
echo "127.0.0.1 another-domain.dev" | sudo tee -a /etc/hosts
```

## Architecture

This application serves as an integration hub with the following components:

- **Fastify Server**: High-performance Node.js web framework
- **Handlebars Templates**: Server-side templating for UI
- **Quill.js Editor**: Rich text editing for mobile client
- **Auto-restart**: File watching with nodemon in development
- **SSL Support**: Local HTTPS with mkcert for development
- **Multi-site Routing**: Webhook handling for different sites (TheGlobe, NextFrontier, SportsArena)

## Multiple Neon Environments

A single deployment can serve multiple Neon environments (e.g., demorc, poc, adn-demo). Each request resolves to exactly one environment.

### Registry

The registry is a JSON file loaded from:
1. `/etc/secrets/neon-environments.json` (Render Secret File)
2. `./config/neon-environments.json` (local development; gitignored)
3. Legacy fallback: synthesized from `NEON_*` env vars (no registry file)

See `config/neon-environments.example.json` for the schema.

- **Front Office sites** are discovered, not configured: each environment sets `neon.fo.url` (FO API base, e.g. `https://neon-fo-<env>…`) and `neon.fo.apiKey`; sites, their public hostnames and live/stage/preview API hosts come from `<fo.url>/api/sites/live?siteMap=false` (cached 10 min). The old `neon.fo.sites` block is ignored with a warning.
- **Upgrading from `neon.fo.sites`:** an entry that has `neon.fo` but no `neon.fo.url` is **skipped entirely** (BO included). Add `fo.url` (e.g. `https://neon-fo-<env>…`) to every env in the registry / Render Secret File **before** deploying, then check the startup log and the admin `/services` page for skipped environments.

### Environment Resolution

For each request, the environment is determined by:
1. **Env-bound key**: If `apikey` matches an environment's `extApiKey` or `extApiKeyLimited`, that environment is selected.
2. **Admin key + explicit environment**: If `apikey` equals `adminApiKey`, the environment comes from `x-neon-env` header, `?env=<id>` query param, or `neonEnv` cookie.
3. **Admin key + caller host**: If no explicit env, use the environment whose `hosts` contain the request's caller host.
4. **Admin key + default**: Fall back to the default environment.

Once an environment is selected (by key or by explicit `?env=`), its `hosts` list is checked against the request's `Origin`/`Referer`/`X-Forwarded-Host`. The request is rejected with 403 **only when a caller host belongs to a different registered environment** — e.g. an `env-a` apikey used from a page whose `Referer` is one of `env-b`'s hosts. A caller host that isn't registered to any environment (a standalone link opened from Notion, Slack, an email client, etc.) is ignored, not rejected.

In **legacy mode** (no registry file), keyless requests still run in the single legacy environment's context, so keyless routes such as `/in/neon/webhook` keep working as before. In **file mode** (a registry file is present), a keyless request resolves to no environment at all — env-scoped routes (webhooks, delayed-import jobs, etc.) then require either an env-bound `?apikey=` or the known-insecure `/legacy?env=<id>` fallback below.

### Integration Configuration

For each Neon environment in your registry:
- Set that environment's `extApiKey` as the `apikey` in its panel/widget integration config.
- Append `?apikey=<extApiKey>` to its webhook URL: `POST /in/neon/webhook?apikey=<extApiKey>`

### Console Logging

- The browser console shows a styled banner on page load: `🟢 [neon-env] <id> (<label>) → bo: <host>`
- Fetch helpers log `[neon-env] <id> → <METHOD> <path>` on every call.
- Response headers include `X-Neon-Env: <id>` and `X-Neon-Env-Bo: <bo-host>`.

### Known-Insecure Webhook Fallback

The endpoint `POST /in/neon/webhook/legacy?env=<id>` accepts requests **without an apikey**, but only for environments with `"insecureWebhook": true` in the registry. Unknown environments or those without the flag return 403. This fallback is for **Neon webhooks**, which cannot send custom headers or an apikey; prefer `?apikey=` URLs whenever possible. Each insecure call is logged as a warning. A wrong apikey on this endpoint is always rejected with 401, never silently treated as a keyless call.

### After Fixing a Misconfigured Environment

If an environment's registry entry was missing/wrong (bad `extApiKey`, unreachable `neon.bo.url`, etc.) and its first Neon config warm-up failed at startup, that environment's cached config (users/groups, workflows, content types, workfolders) can be left empty. Fixing the registry entry alone does not retry that warm-up. After correcting it, refresh the cache explicitly: `POST /neon/config/refresh` using that environment's own apikey.

### Rollout

1. Ship with the legacy fallback only (no Render changes needed).
2. Use `/debug/headers` probe (admin key only) to identify which headers carry the Neon host.
3. Add the Secret File with environments and update each environment's panel/widget/webhook config.
4. Remove legacy Neon env vars from Render.

## Site Builder

Create a headless Neon site and its section hierarchy from an indented outline.

- Widget: `GET /widgets/site-builder` (add `?demo=true` to simulate creation without touching Neon).
- Endpoints: `POST /api/neon/site-builder/preview` (plans only, creates nothing) and `POST /api/neon/site-builder/create`, both with body `{ "title": "...", "outline": "..." }`.
- Each environment must set `neon.fo.siteHostSuffix` in the registry (also `NEON_FO_SITE_HOST_SUFFIX` in legacy mode). The site's `liveHostname` is `https://<name without hyphens><siteHostSuffix>`, e.g. `-canary.neon.test:3000` gives `https://ilmionuovosito-canary.neon.test:3000`. Demo mode uses a placeholder suffix.
- Admin only: requires the admin API key.
- Nothing is published: the site and sections are only created.
- Partial failure: If the site is created but some sections fail, the response is still 200 with a per-section report (created / failed / skipped): nothing is rolled back and the children of a failed section are skipped. 502 is returned only when the site itself could not be created; validation errors return 400.

## Taxonomy Builder

Bulk-create category families/categories and tag families/tags from indented outlines.

- Widget: `GET /widgets/taxonomy-builder` (add `?demo=true` to simulate creation without touching Neon).
- Endpoints: `POST /api/neon/taxonomy-builder/preview` (plans only, writes nothing) and `POST /api/neon/taxonomy-builder/create`, both with body `{ "categories": "...", "tags": "...", "defaultLanguage": "en-uk" }`.
- Outline rules: top level is a family. Categories nest freely under a family; tags are one level only (a tag directly under a family).
- Merging: items are matched to existing ones by case-insensitive name, so re-running the same outline is safe: existing items are reported as `exists` and only missing ones are created.
- Admin only: requires the admin API key.
- Status codes: 200 with a per-item report (created / exists / failed / skipped); 400 for outline parse errors or when existing taxonomy cannot be read (nothing is written); 502 when every attempted create failed.

### Large taxonomies (background jobs)

- Outline lines starting with `#` are comments and are ignored.
- Limits: the synchronous `create` accepts up to 500 items; `preview` and jobs accept up to 50,000. Request bodies are capped at 5 MB (413 above).
- Endpoints (admin key; `?demo=true` simulates a job without touching Neon):
  - `POST /api/neon/taxonomy-builder/jobs` with the same body as `create`: 202 `{ jobId, total, toCreate }`; 400 `{ errors, errorCount }` (errors capped at 200); 409 `{ error, jobId }` when a job is already running in the env.
  - `GET /api/neon/taxonomy-builder/jobs`: 200 `{ jobs }`.
  - `GET /api/neon/taxonomy-builder/jobs/:id`: 200 status (state, counts, first 5000 failures) or 404.
  - `GET /api/neon/taxonomy-builder/jobs/:id/report`: 200 full report with a `Content-Disposition` attachment header, or 404.
  - `POST /api/neon/taxonomy-builder/jobs/:id/cancel`: 200 status; 409 `job is not running`; 404 if unknown.
- One running job per env. Items are created with `CONCURRENCY = 4`.
- Jobs live in memory: a server restart loses them. Re-run the same outline afterwards, existing items are merged and only missing ones are created.
- Visibility: the global admin key sees jobs of all envs; an env-bound key sees only its own env's jobs.
- Logs: `[taxonomy-job] <jobId> env=<id> ...` on start, every 1000 items, and at the end.

## Troubleshooting

### HTTPS Issues
- Ensure mkcert root CA is installed: `mkcert -install`
- Verify certificates exist in `ssl/` directory
- Check `/etc/hosts` contains domain mapping
- Clear browser cache/certificate store if needed

### Development Issues
- Check Node.js version: `node --version` (requires 20.x)
- Verify all environment variables are set in `.env`
- Check server logs for specific error messages
- Ensure port 54861 is not in use by another application

### API Key Issues
- Verify all required API keys are configured
- Check API key permissions and rate limits
- Test individual integrations via `/services` dashboard

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper testing
4. Update documentation as needed
5. Submit a pull request

## License

MIT License - see LICENSE file for details