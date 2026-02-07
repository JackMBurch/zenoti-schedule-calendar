# Zenoti Schedule Calendar

Zenoti schedule screenshots → OCR → review/edit → publish → **subscribable** iCal feed.

## Getting Started

### Local dev

```bash
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`.

### Environment variables

Copy `.env.example` to `.env` and set values:

- `MASTER_PASSWORD`: password for portal login
- `SESSION_SECRET`: secret for signing session cookie
- `FEED_TOKEN`: token embedded in the iCal feed URL
- `DEFAULT_TIMEZONE` (optional): default schedule timezone (IANA name, e.g. `America/New_York`)

### Web portal

- Upload screenshots at `/upload`
- Review/edit OCR at `/review`
- Publish to the stored schedule (file-backed under `data/`)
- Manually edit the published calendar at `/calendar`

### iCal feed

The feed is served from:

- `/api/feed/<FEED_TOKEN>/ics`

Anyone with the feed URL can read it.

### Data storage (no DB)

Published schedule data is stored locally under `data/` (gitignored). This is designed to be mounted as a persistent volume in Docker.

### Docker (production)

Create a `.env` file (for Docker Compose) and set the required env vars:

```bash
cp .env.example .env
```

Then build and run:

```bash
docker compose up --build
```

- Data persists in the `zsc_data` volume mounted at `/app/data`.
- The app is published on `http://localhost:3020` by default (see `docker-compose.yml`).
- Rotating `SESSION_SECRET` invalidates all sessions (forces re-login).
- Rotating `FEED_TOKEN` changes the feed URL (clients must re-subscribe).

## Tech

- Next.js (App Router) + TypeScript
- TailwindCSS
- Zod for validation
- `sharp` + `tesseract.js` for OCR
- Luxon for timezone-safe iCal generation

## Notes

- The portal is protected by a single master password (no user accounts).
- The iCal feed is readonly and accessed via a tokenized URL.
