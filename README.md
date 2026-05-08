# notion-auto-status

Auto-update properti `Status` di Notion database berdasarkan `Group` dan `Date`.

## Jalankan lokal (Mac/PC)

1. Install dependencies:

```bash
npm install
```

2. Buat `.env` (jangan di-commit) berisi:

```bash
NOTION_TOKEN=...
NOTION_DATABASE_ID=...
```

3. Jalankan scheduler per jam:

```bash
node index.js
```

## Jalankan via GitHub Actions (tiap jam)

Workflow sudah disiapkan di `.github/workflows/notion-auto-status.yml`.

1. Push project ini ke GitHub (pastikan `.env` tidak ikut ter-push).
2. Buka GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Tambahkan 2 secrets:
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
4. Test manual:
   - Tab **Actions** → workflow **Notion Auto Status** → **Run workflow**.

Scheduler akan jalan otomatis tiap jam (cron GitHub Actions berbasis UTC), dan job menjalankan `node run-once.js` agar proses **selesai** (tidak menggantung).

