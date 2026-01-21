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