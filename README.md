# Campus Q&A

This is a small server-rendered Node.js application for learning hosted MySQL
connections and CRUD routes.

## Phase 1: setup and connection

The app reads these values from Replit Secrets:

- `DB_HOST` — the remote MySQL hostname from Hostinger
- `DB_PORT` — usually `3306`
- `DB_USER` — the Hostinger database username
- `DB_PASSWORD` — the Hostinger database password
- `DB_NAME` — the database name
- `SESSION_SECRET` — reserved for the login phase

At startup, `db.js` creates one `mysql2/promise` connection pool and runs:

```sql
SELECT 1
```

The app does not create, alter, or drop any database tables.

Before testing the connection, enable Hostinger's **Remote MySQL** setting and
allow the Replit host as described in the project spec. Never put credentials in
this repository or in a form submitted by the app.

## Run locally

```bash
npm run dev
```

The app listens on port 5000. Visit `/` for the setup status and `/health` for a
small machine-readable health check.