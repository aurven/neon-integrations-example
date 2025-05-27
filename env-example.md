# ENV File (.env)

The project needs the following entries to work:

## Project's ApiKey

This key protects the service from incoming calls, which is checked with a dedicated header:

```
NEON_EXT_APIKEY=xxx
```

## Neon keys

Service credentials and desired Neon endpoints.

```
NEON_BO_URL=xxx
NEON_BO_APIKEY=xxx
NEON_FO_APIKEY=xxx
NEON_USERNAME=xxx
NEON_PASSWORD=xxx
```

## Méthode specific keys

Service credentials and desired Méthode endpoints.

```
SERVER_EDAPI=xxx
EDAPI_REST_ENDPOINT=xxx
EDAPI_USERNAME=xxx
EDAPI_PASSWORD=xxx
CONNECTIONID=xxx
DATABASEID=xxx
```

## Third-party Services Keys

API keys for external connectors (e.g., The Guardian's Dev keys) or other services (e.g., OpenAI)

```
GUARDIAN_APIKEY=xxx
OPENAI_APIKEY=xxx
```