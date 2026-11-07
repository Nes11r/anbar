# HECOTEC — Anbar, Satınalma və Layihə Materialları Sistemi

Çoxistifadəçili veb-tətbiq: material kataloqu (ölçü variantları ilə), ilkin inventarlaşdırma, MR → təsdiq → PO → GRN (avtomatik mədaxil), layihəyə və işçiyə (PPE) məxaric, qaytarma, köçürmə, hesabatlar, Excel import, audit.

**Stack:** Next.js 15 · React 19 · TypeScript · PostgreSQL 16 · Prisma 6 · Tailwind 4 · Zod · Vitest · Playwright.

## Windows-da lokal işə salma

Tələblər: Node.js 20.11+ (22 tövsiyə), Docker Desktop.

```powershell
cd D:\anbar
npm ci
copy .env.example .env          # sonra .env-də CHANGE_ME_LOCAL_ONLY parolunu dəyişin (hər iki yerdə)
docker compose up -d db         # PostgreSQL 16, port 5433
npx prisma migrate deploy       # cədvəllər + DB qoruyucuları
npm run db:seed                 # ölçü vahidləri, kateqoriyalar, təsdiq marşrutu, anbarlar (inventar YOX)

$env:ADMIN_EMAIL="admin@hecotec.az"; $env:ADMIN_PASSWORD="<ən azı 10 simvol, hərf+rəqəm>"; npm run admin:create
Remove-Item Env:ADMIN_PASSWORD

npm run dev                     # development: http://localhost:3000
# və ya production:
npm run build; npm start        # supervisor: çökərsə avtomatik yenidən başladır
```

İstəyə görə demo məlumat (yalnız development, "DEMO" prefiksi):
`npm run db:seed:demo -- --i-understand-this-is-demo`

## Testlər

```powershell
# Test bazası (bir dəfə): .env-də TEST_DATABASE_URL (…/hecotec_wms_test)
docker compose exec db psql -U hecotec -d hecotec_wms -c "CREATE DATABASE hecotec_wms_test"
$env:DATABASE_URL=(Select-String -Path .env -Pattern '^TEST_DATABASE_URL="(.*)"').Matches.Groups[1].Value; npx prisma migrate deploy; Remove-Item Env:DATABASE_URL

npm test                 # unit + inteqrasiya (real PostgreSQL, yalnız *_test bazası)
npx playwright install chromium
npm run build; npm run test:e2e    # brauzer e2e (test bazası, port 3100)
npm run lint; npm run typecheck
```

Son nəticələr (2026-11-07): **unit 14/14, inteqrasiya 26/26 (o cümlədən real `ANBAR 21.07.2026 - Amir.xlsm` faylı ilə import), e2e 5/5**, lint 0 xəta, typecheck 0 xəta, production build uğurlu. Performans: 12 000 variant / ~36 000 jurnal qeydi ilə əsas sorğular 22–63 ms.

## Sənədlər
- [docs/source-audit.md](docs/source-audit.md) — 3 mənbə faylının auditi
- [docs/architecture.md](docs/architecture.md) — arxitektura, ledger qaydaları, ERD, RBAC, etibarlılıq, təhlükəsizlik
- [docs/traceability.md](docs/traceability.md) — tələblərin izlənmə cədvəli
- [docs/assumptions-and-open-items.md](docs/assumptions-and-open-items.md) — fərziyyələr, açıq məsələlər, suallar
- [docs/deployment.md](docs/deployment.md) — server, Windows xidməti, Docker, backup/restore
- [docs/admin-guide.md](docs/admin-guide.md) — administrator təlimatı

## Əsas qaydalar (qısa)
- Qalıq yalnız **təsdiqlənmiş** sənədlərdən: append-only ledger + eyni tranzaksiyada yenilənən proyeksiya; DB mənfi qalığa icazə vermir.
- MR və PO qalığı artırmır; **GRN təsdiqi** avtomatik mədaxil edir. Təkrar təsdiq heç nə yazmır.
- Səhv sənəd silinmir — **reversal** sənədi yaradılır.
- Excel importu təsdiqsiz heç nə dəyişmir; tarixi və xülasə vərəqləri qalığa təsir etmir.

## Qovluq strukturu
```
prisma/            schema, migrations (+ CHECK/trigger SQL), seed, seed-demo
src/app/           səhifələr (Server Components), server actions, API (health, variants, export)
src/server/        servislər, stock ledger, import, export
src/components/    UI komponentləri
tests/             unit, integration, e2e
scripts/           start (supervisor), backup, create-admin
docs/              sənədlər
```

Real mənbə Excel faylları `.gitignore`-dadır (şəxsi adlar ehtiva edir).

## Mobil və tətbiq (PWA)
- Telefonda və planşetdə avtomatik mobil görünüş: alt naviqasiya, “+” sürətli əməliyyatlar, menyu, cədvəllər kart şəklində.
- **Telefona quraşdırma:** brauzerdə sistemi açın → Android Chrome: menyu → “Tətbiqi quraşdır / Ana ekrana əlavə et”; iPhone Safari: Paylaş → “Ana ekrana əlavə et”. Tətbiq ayrıca pəncərədə HECOTEC ikonu ilə açılır.
- Tam PWA (quraşdırma düyməsi, service worker, offline səhifə) üçün **HTTPS** lazımdır (localhost istisna) — serveri HTTPS reverse proxy arxasında yerləşdirin (`docs/deployment.md`).
- Anbar məlumatları heç vaxt telefonda keşlənmir: qalıqlar hər dəfə serverdən gəlir; bağlantı yoxdursa “Serverlə bağlantı yoxdur” səhifəsi göstərilir.
