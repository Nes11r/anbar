# Mərhələ 0 — Mənbə fayllarının auditi

Tarix: 2026-11-07. Fayllar oxunub: `HECOTEC_Anbar_Sistemi.html` (136 KB), `ANBAR 21.07.2026 - Amir.xlsm` (5.2 MB, 12 vərəq), `HECOTEC_Material_Request_Form.xlsx` (5 vərəq). Excel faylları `openpyxl` / `ExcelJS` ilə **yalnız oxunub**, makrolar icra edilməyib.

> Qeyd: tapşırıqda `ANBAR 21.07.2026 - Amir(1).xlsm` adı keçir; qovluqdakı fayl `ANBAR 21.07.2026 - Amir.xlsm` adlanır. Eyni fayl kimi qəbul edilib.

## 1. `HECOTEC_Anbar_Sistemi.html` — mövcud UI

Tək faylda vanil JS tətbiqi. Bütün məlumat `localStorage`-da (`hecotec-anbar-v3`), yalnız həmin brauzerdə.

| Funksiya | Davranış | Yeni sistemdə |
|---|---|---|
| Giriş | E-poçt + parol, SHA-256 hash localStorage-da; ilk girişdə hesab yaradılır; "parolu unutdum" bütün məlumatı silir | **Əvəz edildi**: server-side sessiya, bcrypt, rollar, hesab bloklama. Saxta/lokal login yoxdur |
| Anbar qalığı | Hər material üçün `o` (ofis) və `s` (sahə) redaktə olunan rəqəmləri | **Əvəz edildi**: qalıq yalnız ledger-dən; "Ofis" və "Sahə" anbarları saxlanılıb (seed) |
| Razmerli material | Kateqoriya "Təhlükəsizlik paltarı/ayaqqabısı" seçiləndə 48–58 ölçü sahələri; hər ölçü ayrı kod `KOD-48` | **Saxlanıldı və genişləndirildi**: material ailəsi + variant SKU, ölçü növləri (geyim rəqəm/hərf, ayaqqabı EU) |
| Mədaxil (ofisə) | Rəqəmi birbaşa artırır | **Əvəz edildi**: yalnız GRN (PO əsasında) və ya ilkin inventarlaşdırma |
| Məxaric (layihəyə) | Ofis/sahədən layihəyə, qalıq yoxlaması | **Saxlanıldı**: atomik, row-lock, available yoxlaması |
| Köçürmə | Ofis↔Sahə, layihədən anbara | **Saxlanıldı**: TRANSFER sənədi; layihədən geri — RETURN_FROM_PROJECT |
| Hərəkət jurnalı | Düzəliş/silmə mümkün, qalıq yenidən hesablanır | **Dəyişdirildi**: append-only; səhv → reversal sənədi |
| Layihələr | Ad, kod, qeyd; göndərilən − köçürülən | **Saxlanıldı və genişləndirildi** (sifarişçi, lokasiya, tarixlər, PPE ayrımı) |
| Nümunə məlumat | Saxta materiallar (boru, sement…) | **Çıxarıldı**. Demo yalnız `seed-demo.ts`, "DEMO" prefiksi ilə |
| Brend | `#006381`, `#E28221`, `#EEF4F5`, `#15303A`, Montserrat; base64 PNG logo | Rənglər design token oldu; **real logo HTML-dən çıxarıldı** (`public/hecotec-logo.png`, 241×68) |
| Giriş fonu | hecotec.az slayd şəkilləri (xarici URL) | İstifadə edilmədi (xarici asılılıq və CSP); sadə brend fonu |

## 2. `ANBAR 21.07.2026 - Amir.xlsm` — məlumat xəritəsi

| Vərəq | Ölçü | Məzmun (faktiki) | Semantika | Etibarlılıq | Import növü |
|---|---|---|---|---|---|
| **PPE List Engineers** | 216×62 | 3 ayrı cədvəl: (a) sətir 1–58 enli cədvəl: №, Res. (Engineer/Laborer — yalnız qrupun ilk sətrində), Item, Model, Product Code, Size Type, Comment, total, ölçü sütunları 36…62, Supplayer; (b) sətir 105–148 "FƏHLƏ forması" (Item/Model/Code/Size/Pcs); (c) sətir 156–216 "MÜHƏNDİS forması" | Ehtimalla **cari inventar sayımı** | ORTA — `total` ilə ölçü cəmi bəzi sətirlərdə uyğun gəlmir; mətnli miqdarlar ("1600 paçka"); boş qrup xanaları | Kataloq / İnventar qalığı (sətir aralığı ilə ayrıca) |
| Sheet1 | 4×7 | Botinka 40–46 üzrə rəqəmlər | Kontekstsiz | AŞAĞI | İmport edilməməli |
| Waiting | 29×9 | Bir neçə qeyd ("+2 ədəd sumka DECATLON", "Logo gore gozlemededi"), tarix 2028-01-26 (gələcək!) | Gözləyən sifariş qeydləri | AŞAĞI | Açıq sifariş (arxiv) |
| Order List ArcProtection | 14×4 | Model, Item code, Quantity — bir xanada çoxlu ölçü ("Size: 48-2pcs 50-2pcs 52-10pc") | Sifariş siyahısı | ORTA | Açıq sifariş; multi-size parser preview-da göstərir |
| Order | 31×12 | Ofis ləvazimatı sifarişi (5 sətir), departament | Sifariş | ORTA | Açıq sifariş |
| **Total** | 457×18 | Ad, Item, Model, Product Code, Size, Pcs, Time, Comet; 454 doldurulmuş, 60-ı yalnız nömrəli boş sətir → **394 real sətir**; tarix 24.10.2024–20.06.2025; 1 tarix mətn kimi (" 24.10.2024"); 41 fərqli ad | **Fərdlərə təhvil tarixçəsi** | YÜKSƏK (tarixçə kimi) | Tarixi məxaric (qalığa təsir etmir) |
| March / April / May | 14×10 | Mühəndis/Fəhlə × Socar/Norm/Total matrisi | **Aylıq xülasə** | — | Hesabat xülasəsi (stok/tarixçə yaratmır) |
| Common | 14×11 | Eyni matris; `Total` sətri `=SUM(Socar;Norm)` düsturlarıdır | **Ümumi xülasə** (Mart+Aprel+May cəminə bənzəyir) | — | Hesabat xülasəsi |
| Office Staff | 31×4 | 14 ad, Location (Office/NORM/N/A) | İşçi siyahısı (natamam) | AŞAĞI | İşçi kartları əl ilə |
| ISTIFADE | 11×13 | Item/Model/Code + ölçü sütunları | İstifadədə olan (ehtimal) | AŞAĞI | Hesabat xülasəsi |

### Müşahidə olunan problemlər (import preview-da avtomatik xəbərdarlıq edilir)
- `N/A`, `No Name`, `AFTekstil` kimi kodlar fərqli məhsullarda təkrarlanır → **kodsuz sətirlər avtomatik birləşdirilmir**.
- "Hard Hat / No Name / N/A" 4 ayrı sətirdə — fərqli məhsul ola bilər, ayrı saxlanılır.
- PPE List-də ölçü başlıqları **cüt-cüt təkrarlanır** (37,37,38,38…); sətir 2-də hərf ölçüləri bəzi rəqəm sütunlarının altında (40→M, 44→L, 48→XL, 52→2XL…). Sütunların dəqiq mənası məlum deyil → preview-da xəbərdarlıq, eyni başlıqlı sütunlar toplanır.
- `total` sütunu ≠ ölçü cəmi (məs. sətir 13: total 45, ölçülər 44) → "şübhəli cəm".
- Mətnli miqdar ("1600 paçka", "13 paçka", "15 paçka") → vahid yoxlanmalı.
- Gələcək tarix (Waiting: 2028-01-26), mətn tarix (Total sətir 3).
- `Total` və `Common` eyni hadisələri fərqli səviyyədə əks etdirir → yalnız `Total` tarixçə kimi; `Common` heç vaxt tarixçə/stok olmur (test 9).

## 3. `HECOTEC_Material_Request_Form.xlsx`

| Vərəq | Məzmun | Sistemdə |
|---|---|---|
| MR Form | HEC-PRC-FRM-001 Rev.00; 8 bölmə: identifikasiya, layihə/tələb edən, material cədvəli (15 sətir, 14 sütun), texniki tələblər, çatdırılma, büdcə, 8 mərhələli təsdiq, satınalma/anbar; avtomatik yoxlamalar (MR format, RoS ≥ tarix, ≥1 sətir, UoM+miqdar, əsaslandırma) | `MaterialRequest`, `MRLine`, `MRApproval` sahələri; yoxlamalar Zod + DB CHECK |
| Instructions | Nömrələmə `MR-[Project Code]-[Discipline Code]-[Sequence]`; stok yoxlaması; reviziya; marşrut | Avtomatik nömrə, "Stokda" sütunu avtomatik, reviziya funksiyası |
| Lists | 27 siyahı, label→code ("never change an existing code") | Kodlar dəyişdirilmədən: UOM (PCS, SET, M…), REQUEST_TYPE, PRIORITY, SUPPLY_CATEGORY, PROCUREMENT_ROUTE, DISCIPLINE, PROJECT_PHASE, CURRENCY, MR_STATUS (13), APPROVE … |
| Settings | PM təsdiqi > 50 000, GD təsdiqi > 250 000 — "placeholder, DoA ilə uyğunlaşdırılmalı" | Parametrlər → MR təsdiq marşrutu (redaktə olunur) |
| System Export | data model v1.0.0, 150 field_id (`header.mr_number`, `approvals[n].role`…) + line_items | Sahə adları/kodlar uyğunlaşdırılıb; tam field-by-field export açıq məsələ (bax open items) |

Təsdiq marşrutu (Section 7): 1 Requester, 2 Discipline Lead, 3 QA/QC, 4 Site Manager, 5 Cost Controller, 6 Project Manager (təcili/limit), 7 General Director (limit), 8 Procurement Manager — eyni ardıcıllıqla seed edilib.

## 4. Müəyyən edilməyən məqamlar
Bax `docs/assumptions-and-open-items.md`. Ehtimallar orada **ehtimal** kimi qeyd edilib.
