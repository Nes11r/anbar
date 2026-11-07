# Deployment, ehtiyat nüsxə və bərpa

## Variant A — Windows server (Node + Docker PostgreSQL) — tövsiyə edilən başlanğıc

```powershell
# 1. PostgreSQL (Docker Desktop işləməlidir)
docker compose up -d db

# 2. Asılılıqlar, migrasiya, baza konfiqurasiyası
npm ci
npx prisma migrate deploy
npm run db:seed

# 3. İlk Super Admin (parolu kodda saxlamayın)
$env:ADMIN_EMAIL="admin@hecotec.az"; $env:ADMIN_PASSWORD="<güclü parol>"; npm run admin:create
Remove-Item Env:ADMIN_PASSWORD

# 4. Build və start (supervisor ilə — çökərsə avtomatik yenidən başlayır)
npm run build
npm start          # http://localhost:3000
```

### Windows xidməti kimi (kompüter yenidən başlayanda avtomatik)
**NSSM** ilə:
```powershell
nssm install HECOTEC-WMS "C:\Program Files\nodejs\node.exe" "D:\anbar\scripts\start.mjs"
nssm set HECOTEC-WMS AppDirectory D:\anbar
nssm set HECOTEC-WMS AppStdout D:\anbar\logs\out.log
nssm set HECOTEC-WMS AppStderr D:\anbar\logs\err.log
nssm set HECOTEC-WMS Start SERVICE_AUTO_START
nssm start HECOTEC-WMS
```
və ya **pm2**: `npm i -g pm2 pm2-windows-startup; pm2 start scripts/start.mjs --name hecotec; pm2 save; pm2-startup install`.

Docker Desktop-da "Start Docker Desktop when you sign in" aktiv olmalıdır; `db` konteyneri `restart: unless-stopped`-dır.

## Variant B — tam Docker (Linux server)
```bash
cp .env.example .env   # POSTGRES_PASSWORD, APP_URL, COOKIE_SECURE=true (HTTPS arxasında)
docker compose --profile full up -d --build
docker compose exec app node node_modules/prisma/build/index.js db seed   # və ya: npm run db:seed lokal
```
`app` konteyneri hər startda `prisma migrate deploy` edir; healthcheck `/api/health`; `backup` servisi gündəlik dump edir.

HTTPS üçün qarşısına reverse proxy (Caddy / nginx / IIS ARR) qoyun və `COOKIE_SECURE=true`.

## Cloud DB
`DATABASE_URL`-i idarə olunan PostgreSQL 14+ (Azure Database for PostgreSQL, AWS RDS, Neon…) göstərin. `pg_trgm` extension icazəli olmalıdır.

## Ehtiyat nüsxə
- Avtomatik: Docker `backup` servisi — hər 24 saatdan bir `./backups/hecotec_YYYYMMDD_HHMMSS.dump`, 30 gündən köhnələr silinir.
- Əl ilə: `npm run backup` (lokal `pg_dump` yoxdursa docker konteyneri vasitəsilə).
- Tövsiyə: `backups` qovluğunu gündəlik başqa diskə/şəbəkə qovluğuna/bulud yaddaşına köçürün (Windows Task Scheduler + robocopy).
- Yüklənmiş Excel faylları `UPLOAD_DIR`-dədir (provenance üçün) — onu da ehtiyat nüsxəyə daxil edin.

## Bərpa
```powershell
docker compose stop app            # və ya Windows xidmətini dayandırın
docker compose exec -T db pg_restore -U hecotec -d hecotec_wms --clean --if-exists < backups\hecotec_20261107_020000.dump
docker compose start app
```
Bərpadan sonra `http://<server>/api/health?deep=1` → `ledgerMismatches: 0` olmalıdır.

## Monitorinq
- `GET /api/health` — 200 (ok) / 503 (DB əlçatmaz). `?deep=1` ledger ↔ qalıq uyğunluğunu yoxlayır.
- Server logları: konsol (NSSM/pm2/docker logs). Xəta mesajlarında şəxsi məlumat və parol yoxdur.

## Yeniləmə
```powershell
git pull; npm ci; npx prisma migrate deploy; npm run build; nssm restart HECOTEC-WMS
```
Migrasiyalar yalnız irəli gedir; yeniləmədən əvvəl `npm run backup`.
