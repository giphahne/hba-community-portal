# Deploying the portal for free

The portal is one container (sign-in page, member app and API) plus a Supabase project for data and sign-in.
Both fit free plans comfortably for a few hundred residents. Free-plan terms change, so check each provider's
current limits when you sign up. Dashboard labels below may also have moved; the settings are what matter.

What to expect on free plans:
- **The app sleeps when unused.** The first visit after a quiet spell can take up to a minute; later visits are quick.
- **Supabase pauses a project after about a week with no activity.** The daily health check (step 6) prevents that.
- **File storage is about 1 GB on Supabase's free plan**, used by uploaded newsletters, minutes, photos and
  documents. The record scans are not stored there; they ship inside the container image.

## 1. Database (Supabase)

1. Create a Supabase project. Under Authentication → Providers enable **Email** sign-in with email
   confirmation on.
2. Open `supabase/schema.sql`, replace `admin@example.com` (two places inside `hba_sync_member`) with the
   administrator's e-mail address. That address becomes `admin` automatically when it confirms its account.
3. In the SQL editor run `schema.sql` (as the `postgres` role), then `seed-reference.sql`.
4. Edit the public settings rows for the association (`hba_settings`: payee and mailing address for checks,
   dues amount and due date, meeting rule, supper defaults, community links).
5. Create the private Storage bucket `hba-archive` if `schema.sql` did not (Storage → New bucket, not public).
6. Note the project URL and the **anon / publishable** key (Project Settings → API). Never use the
   service-role key.

## 2. Secrets

```sh
pip install -r server/requirements.txt
python tools/generate-secrets.py
```

It prints `HBA_SESSION_KEY` and `HBA_VAPID_PRIVATE_KEY`. Keep them somewhere safe (a password manager) and never
commit them.

**Moving from the Perplexity-hosted copy:** if you can download its `community-private-data/` folder, run
`python tools/generate-secrets.py --from-dir path/to/community-private-data` instead. That keeps existing payer
keys matching in dues receipts and keeps administrators' devices subscribed to alerts. Without it everything
still works; payer keys are simply entered again and administrators turn alerts on again.

## 3. Build the image (GitHub Actions)

The workflow `.github/workflows/image.yml` builds the container on every push to `main` and stores it in the
repository's GitHub Container Registry (`ghcr.io/<owner>/<repo>`).

1. Upload `hba-portal-record-scans.zip` somewhere private that gives a direct download link, and add that link
   as the repository secret **`SCANS_ZIP_URL`** (Settings → Secrets and variables → Actions). Optional: without
   it the image builds without scans.
2. Push to `main` (or run the workflow by hand from the Actions tab).
3. Under your GitHub profile → Packages, open the new package and confirm its visibility is **Private**. It
   contains the record scans and the app code.
4. Create a GitHub personal access token with only the `read:packages` permission, for the host to pull the image.

## 4. Host the container

Any host that runs a container image works. Render's free web service is the first choice here; Koyeb or
Google Cloud Run are alternatives with the same settings.

- New web service → deploy an **existing image**: `ghcr.io/<owner>/<repo>:latest`, with the registry credential
  from step 3.4 (username: your GitHub user; password: the token).
- Instance type: **Free**. Port: **3003** (or leave the host's `PORT`; the container uses it).
- Health check path: `/api/health`.
- Environment variables:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | the project URL from step 1.6 |
| `SUPABASE_ANON_KEY` | the anon / publishable key from step 1.6 |
| `HBA_SESSION_KEY` | from step 2 |
| `HBA_VAPID_PRIVATE_KEY` | from step 2 |
| `HBA_PUBLIC_URL` | the address residents will use, e.g. `https://hamiltonbeach.onrender.com` |
| `HBA_PUSH_SUBJECT` | `mailto:` plus the administrator's address |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | optional: turn on "Ask our documents" and AI document intake |

The container refuses to start if `HBA_SESSION_KEY` or `HBA_VAPID_PRIVATE_KEY` is missing, rather than inventing
keys that would vanish on the next restart.

Optional: copy the service's **deploy hook** URL into the repository secret **`DEPLOY_HOOK_URL`**, so every push
to `main` redeploys automatically.

## 5. Point Supabase sign-in links at the portal

In Supabase → Authentication → URL Configuration set the **Site URL** to `HBA_PUBLIC_URL`, and add it to the
redirect URLs. Confirmation and password-reset e-mails link there.

## 6. Daily health check

Add the repository **variable** `PORTAL_URL` (Settings → Secrets and variables → Actions → Variables) with the
same address. `.github/workflows/keepalive.yml` then calls `/api/health?probe=1` once a day, which also touches
the database. GitHub pauses scheduled workflows in repositories with no activity for 60 days; re-enable it
from the Actions tab if that happens.

## Checking a deployment

- `https://<address>/api/health?probe=1` shows `auth` and `rest` as `200 ok`.
- Sign in, open the dashboard, Sand School and a research scan; switch Board ↔ Resident view; sign out.
- Restart the service from the host dashboard: you stay signed in.
