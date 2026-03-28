# Deploying Korrus Ad Manager to Railway

## One-time setup

### 1. Create a Railway project

```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login
railway login

# Link this directory to a new Railway project
railway init
```

Or do it via the Railway dashboard at https://railway.app → New Project → Deploy from GitHub repo.

### 2. Add a Persistent Volume

The app stores its SQLite database (`data.db`) and uploaded files (`uploads/`) on disk.
Railway volumes keep these safe across deploys.

In the Railway dashboard:
1. Click your service → **Volumes** tab
2. Add a volume, mount path: `/app/data`
3. Add another volume, mount path: `/app/uploads`

Then update `server/db.ts` to use the volume path in production (already handled — see below).

### 3. Set environment variables

In Railway dashboard → **Variables** tab, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MANUS_WEBHOOK_URL` | (optional) your MANUS webhook URL |

Railway sets `PORT` automatically — do not add it manually.

### 4. Deploy

```bash
railway up
```

Or push to GitHub and Railway will auto-deploy on every push to `main`.

---

## How it works

The production build is a **single unified server**:

```
npm run build   →  vite builds client/src → dist/public/
npm run start   →  tsx server/index.ts    → serves dist/public/ as static files
                                           + /api/* routes (tRPC, upload, MANUS)
                                           + /uploads/* (local file storage)
```

No separate frontend server. One Railway service, one `PORT`.

---

## Persistent storage paths

| What | Local dev path | Railway volume path |
|---|---|---|
| SQLite DB | `korrus-ads/data.db` | `/app/data/data.db` |
| Uploaded files | `korrus-ads/uploads/` | `/app/uploads/` |

To use the Railway volume paths in production, the `DB_PATH` env var overrides where
Drizzle looks for the database. If not set, it defaults to `./data.db` (works locally).

Set in Railway Variables:
```
DB_PATH=/app/data/data.db
```

### Update `server/db.ts` to respect `DB_PATH`:
```ts
const dbPath = process.env.DB_PATH ?? path.join(__dirname, "..", "data.db");
```
(This change is already applied if you see `DB_PATH` in the code.)

---

## Connecting MANUS

When you have MANUS credits and a webhook URL, add it to Railway Variables:
```
MANUS_WEBHOOK_URL=https://your-manus-instance.com/webhook/korrus-ads
```

The "Send to Meta" button in the dashboard will immediately start posting ad payloads
to MANUS, which uses browser automation to upload them into Meta Ads Manager.

MANUS calls back `POST /api/meta-callback` with `{ adId, metaAdId, metaCreativeId }`
when each upload completes, which marks the row as `uploaded` in the dashboard.
