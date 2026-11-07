# Tələblərin izlənmə cədvəli (traceability checklist)

Status: ✅ hazır və test edilib · 🟡 qismən · ⬜ edilməyib (bax open items)

| # | Tələb (Master Prompt bölməsi) | Status | Harada | Test |
|---|---|---|---|---|
| 1 | Üç faylın auditi (§1, Mərhələ 0) | ✅ | `docs/source-audit.md` | — |
| 2 | Axın: Kataloq → İnventar → MR → Təsdiq → PO → GRN → Mədaxil → Məxaric → Qaytarma → Hesabat (§2) | ✅ | `src/server/services/*` | stock-flow 3, 4, PO 100 |
| 3 | MR/PO qalıq artırmır, yalnız GRN POSTED (§2, §6) | ✅ | `procurement.ts postGRN` | test 4 |
| 4 | Qismən qəbul, təkrar GRN ikiqat mədaxil yox (§2, §6) | ✅ | `postGRN` lock + status | test 5, PO 100/60/40/40 |
| 5 | Mühəndis / Fəhlə / Hər ikisi; forma üçün məcburi; Tətbiq edilmir (§3) | ✅ | `rules.validateWorkerGroup`, kateqoriya `isUniform` | test 1, uniform test, e2e |
| 6 | Ölçü variantları ayrı SKU və qalıq (§3) | ✅ | `MaterialVariant` | test 2, e2e |
| 7 | N/A kodlara görə birləşdirmə yox; ad üzrə kor merge yox (§3) | ✅ | `import/service commitBatch` | import PPE test |
| 8 | Kataloq: axtarış, filtr, sıralama, arxiv, export (§3) | ✅ | `/catalog` | e2e |
| 8a | Şəkil, kütləvi əməliyyat, barcode skaneri (§3) | 🟡 | sahələr/servis var, UI yox | — |
| 9 | Import Wizard: vərəq, başlıq, sütun xəritəsi, məlumat növü seçimi, ölçü normallaşdırma, xəbərdarlıqlar, provenance, commit, idempotent, rollback (§4) | ✅ | `/import`, `src/server/import` | import tests |
| 10 | Total/Common ikiqat sayılmır; tarixi import qalığı dəyişmir (§4) | ✅ | HISTORICAL / SUMMARY növləri | test 9, 10 |
| 11 | İlkin inventarlaşdırma sənədi, təsdiqdə jurnala yazılır (§4) | ✅ | `inventory.ts` | idempotent opening test |
| 12 | Append-only ledger, 11 növ, idempotency key (§5) | ✅ | `stock_ledger` + trigger | append-only test |
| 13 | on_hand / available / project_issued (§5) | ✅ | `rules.ts`, `reports.ts` | test 3, 7, 8 |
| 14 | Mənfi available bloklanır; paralel son ədəd (§5) | ✅ | `applyMovements` FOR UPDATE + CHECK | test 6, 13 |
| 15 | Vahidə uyğun tam/kəsr qaydası (§5) | ✅ | `validateQty` | unit, test 13 |
| 16 | Draft → posted; reversal, silmə yox (§5) | ✅ | `reverseStockDoc`, `reverseGRN` | reversal test |
| 17 | Transfer, düzəliş, sayım fərqi, qüsurlu/karantin (§5) | ✅ | StockDocument, CYCLE count, QUARANTINE | transfer, karantin testləri |
| 18 | MR sahələri, kodlar, reviziya, prioritet (§6) | 🟡 | 1–3 bölmə + əsaslandırma; 4–6 bölmə sahələri yox | urgent MR test |
| 19 | Konfiqurasiya olunan təsdiq; təsdiqsiz PO yox, istisna audit (§6) | ✅ | `approval_step_config`, `validatePO` | MR/PO testləri |
| 20 | PO statusları, sətirlər kataloqa bağlı (§6) | ✅ | `PurchaseOrder`, `POLine` | |
| 21 | GRN: keyfiyyət, rədd, artıq/çatışmayan xəbərdarlıq, status tarixçəsi (§6) | ✅ | `grnWarnings`, `StatusHistory` | over-receipt test |
| 22 | Layihə və işçi kartları (§7) | ✅ | `/projects`, `/employees` | e2e |
| 23 | Layihəyə məxaric vs işçiyə PPE ayrı növlər, ikiqat çıxış yox (§7) | ✅ | ISSUE_PROJECT / ISSUE_EMPLOYEE | PPE test |
| 24 | Təyinat uyğunsuzluğu xəbərdarlığı + səlahiyyətli override səbəbi (§7) | ✅ | `checkGroupCompatibility` | PPE test |
| 25 | Layihə görünüşü: tarix, kateqoriya/ölçü, kim, qaytarılan, xalis, export (§7) | ✅ | `/projects/[id]` | e2e |
| 26 | UI: sidebar, topbar, breadcrumbs, global search, chips, dense/comfortable, skeleton, empty, toast, confirm, a11y, light/dark (§8) | ✅ | `src/components` | e2e + screenshot smoke |
| 27 | Rollara görə menyu (§8) | ✅ | `(app)/layout.tsx` | auditor e2e |
| 28 | Dashboard KPI, real rəqəmlər, saxta yox (§8) | ✅ | `/`, `dashboardKpis` | test 3, e2e |
| 29 | Next.js + TS + PostgreSQL + Prisma + Zod + RBAC, migrations, .env.example, seed, docker-compose (§9) | ✅ | kök qovluq | build |
| 30 | Audit izi, created/approved by, soft delete, tranzaksiyalar (§9) | ✅ | `audit_log` (append-only), `isActive` | |
| 31 | XSS, CSRF, injection, IDOR, formula injection, fayl yükləmə (§9) | ✅ | `docs/architecture.md#təhlükəsizlik` | |
| 32 | Backup/restore planı (§9) | ✅ | `docs/deployment.md` | |
| 33 | Excel/CSV hesabatlar, filtr və dövr faylda (§10) | ✅ | `/api/export/*` | |
| 34 | Çap: MR, PO, GRN, Issue Slip (§10) | ✅ | print CSS + `PrintHeader` | |
| 35 | Unit, integration, e2e testlər (§11) | ✅ | `tests/` | 40 + 5 |
| 36 | README (Windows), deployment, admin təlimatı, demo ayrılığı (§12 M5) | ✅ | `README.md`, `docs/` | |
| 37 | i18n hazırlığı (EN) | 🟡 | `src/i18n/az.ts` | |
