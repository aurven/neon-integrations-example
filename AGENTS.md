# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

### Development
- `npm start` - Start the production server
- `npm run dev` - Start the development server with auto-restart (nodemon) and environment file loading
- `npm run dev:legacy` - Start development server without auto-restart (legacy mode)

### Server Configuration
- **Default Port**: 3000 (configurable via `PORT` environment variable)
- **Default Host**: 0.0.0.0 (configurable via `HOST` environment variable)
- **Auto-restart**: Enabled in development mode using nodemon
- **File Watching**: Monitors `.js`, `.json`, `.hbs`, `.css`, `.html` files in `src/`, `public/`, and root directory

### Hostname Configuration
To run the server on a specific hostname instead of IP:
1. Copy `.env.example` to `.env`
2. Set `HOST=your-hostname` (e.g., `HOST=localhost` or `HOST=myapp.local`)
3. For custom hostnames, ensure DNS resolution or add to `/etc/hosts`

### Testing
No specific test commands are configured. The project doesn't appear to have a formal testing framework setup.

## Architecture Overview

This is a **Node.js-based integration hub** built with **Fastify** that serves as a bridge between **Neon CMS** and various external systems. The server runs on Node.js 20.x and uses Handlebars for templating.

### Core Integration Patterns

**Inbound Integrations** (`/in/*` endpoints):
- External sources → Neon CMS
- RSS feeds, Guardian API, Trello cards, Google Docs, file uploads

**Outbound Integrations** (`/out/*` endpoints):  
- Neon CMS → External systems
- Méthode CMS, Sendgrid email marketing

**Utility Services** (`/utilities/*`, `/widgets/*`):
- Content cleanup, AI processing (Codex/OpenAI), image sourcing (Pexels)
- File upload widgets, document processing
- Social media post generation with AI (Codex primary, OpenAI fallback)

### Key Source Structure

**Request Handlers** (`/src/requestHandlers/`):
- `methode.js` - Neon → Méthode CMS integration
- `neon-import.js` - External sources → Neon integration  
- `neon-export.js` - Neon → Sendgrid integration
- `trello.js` - Trello → Neon integration with UI
- `utilities.js` - Utility services (cleanup, OpenAI, Pexels)
- `widgets.js` - File upload and document processing

**Core Helpers** (`/src/helpers/`):
- `neon-bo-api.js` - Complete Neon CMS API wrapper
- `utils.js` - Common utilities and content transformation
- `edapi-utils.js` - Editorial API utilities for Méthode
- `sites-helpers.js` - Site-specific helper functions

**External Connectors** (`/src/connectors/`):
- `guardian-connector.js` - The Guardian API integration
- `rss-connector.js` - RSS feed parsing (ANSA, TGcom24)
- `pexels-connector.js` - Stock photo/video API

### Authentication & Security

All endpoints require API key authentication via `apikey` header. The server validates against `NEON_EXT_APIKEY` environment variable.

### Environment Configuration

The application uses environment variables for:
- `NEON_EXT_APIKEY` - API key for endpoint authentication
- `NEON_EXT_LOCATION` - Deployment location identifier
- `PORT` - Server port
- Additional service-specific API keys (OpenAI, Pexels, etc.)

### Content Processing Flow

1. **Content Ingestion**: External sources → Connectors → Content parsing
2. **Content Transformation**: `stories-populator.js` handles content enrichment and formatting
3. **Content Publishing**: Neon API integration for content creation and workflow management
4. **Content Distribution**: Outbound integrations to Méthode, Sendgrid, etc.

### Key Dependencies

- **Fastify** - Web framework with plugins for static files, forms, templating
- **Handlebars** - Template engine for UI components
- **Axios** - HTTP client with cookie support
- **Mammoth** - Word document processing
- **Cheerio** - HTML parsing and manipulation
- **RSS Parser** - Feed parsing capabilities
- **OpenAI/DeepL** - AI and translation services