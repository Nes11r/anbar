# Fərziyyələr, açıq məsələlər və bloklayan suallar

## Fərziyyələr (təsdiq tələb edir)
1. **PPE List Engineers** cari fiziki sayıma ən yaxın mənbədir, lakin açılış qalığı kimi **avtomatik yazılmır**: import yalnız QARALAMA sayım yaradır; anbar müdiri fiziki yoxlamadan sonra təsdiqləyir.
2. PPE List-də cüt-cüt təkrarlanan ölçü sütunlarının (37,37…) mənası bilinmir. Fərziyyə: eyni ölçü (bəlkə iki fərqli partiya). Import onları toplayır və xəbərdarlıq edir.
3. Sətir 2-dəki hərf ölçüləri (40→M, 44→L, 48→XL …) rəqəm sütunları ilə eyni ölçü sayılmır; geyim üçün ya rəqəm, ya hərf ölçü seçilməlidir.
4. `Total` vərəqi fərdi təhvil tarixçəsidir; "Socar(F)/Norm(M)" şərhləri sifarişçi/qrup işarəsi kimi görünür (F=Fəhlə, M=Mühəndis?) — **ehtimal**; şərh mətni olduğu kimi saxlanılır.
5. `Common` ≈ Mart+Aprel+May cəmi — yoxlanılmayıb; heç bir halda stok və ya tarixçə yaratmır.
6. İki anbar ("Ofis anbarı", "Sahə anbarı") köhnə HTML-dən götürülüb, üstəlik "Karantin". Real anbar siyahısı Parametrlərdə dəyişdirilə bilər.
7. MR təsdiq limitləri (50 000 / 250 000) MR formasında "placeholder" kimi qeyd edilib — DoA ilə təsdiqlənməlidir.
8. MR mərhələlərini hansı sistem rolunun imzalaya biləcəyi ilkin olaraq təxmini təyin edilib (məs. QA/QC → Layihə rəhbəri). Parametrlər → MR təsdiq marşrutu.
9. Bir istifadəçinin bir rolu var (6 rol). Çox rol lazım olarsa `UserRole[]`-ə keçid sadədir.
10. Artıq qəbul toleransı 0% (Parametrlərdən dəyişdirilə bilər, maks. 20%).
11. Mənfi qalıq istisnası **söndürülüb** (DB CHECK ilə tam qadağan). Lazım olarsa ayrıca səlahiyyət + səbəb ilə dizayn edilməlidir.

## Açıq məsələlər / tamamlanmamış hissələr (dürüst siyahı)
- **MR formasının bütün bölmələri** (4. texniki tələblər — standartlar, sertifikatlar; 5. çatdırılma — Incoterm, ünvan; 6. büdcə — cost code) UI-da ayrıca sahə kimi yoxdur. Model `formData` JSON sahəsini (System Export field_id açarları ilə) dəstəkləyir, amma forma hələ yalnız 1–3, əsaslandırma və təsdiq bölmələrini doldurur.
- **System Export formatında MR import/export** (150 field_id) hazır deyil.
- **Attachment** (foto, sənəd əlavələri) cədvəli var, yükləmə UI-ı yoxdur (material şəkli, GRN qaimə faylı).
- **Kataloqda kütləvi əməliyyat**: server funksiyası (`bulkSetActive`) var, cədvəldə seçim checkbox-ları hələ yoxdur.
- **Barcode/QR**: sahə və unikal indeks var, skaner/etiket çapı yoxdur.
- **İngilis dili**: lüğət strukturu (`src/i18n/az.ts`, `t()`) hazırdır; səhifə mətnlərinin bir hissəsi hələ birbaşa komponentlərdədir və `en.ts` yoxdur.
- **Açıq sifariş (OPEN_ORDERS) importu** sətirləri yalnız arxivləyir; PO-ya avtomatik çevrilmir (bilərəkdən: PO kataloq variantı + təsdiq tələb edir).
- **Layihə rəhbərinin yalnız öz layihələrini görməsi** (row-level məhdudiyyət) tətbiq edilməyib — hazırda rol bütün layihələri görür.
- Mobil üçün əsas formalar və cədvəllər yoxlanılıb (390px, üfüqi səhifə sürüşməsi yoxdur); çox sütunlu cədvəllər öz konteynerində üfüqi sürüşür.

## Bloklayan suallar (HECOTEC tərəfindən cavab gözlənilir)
1. Rəsmi ilkin inventar sayımı hansı tarixdə və hansı anbarlar üzrə aparılacaq?
2. PPE List-dəki cüt ölçü sütunlarının mənası nədir?
3. Real anbar/filial siyahısı və anbar müdirləri kimlərdir?
4. Delegation of Authority: MR və PO təsdiq limitləri, PO təsdiqi kimdə olmalıdır?
5. Brend kitabçası və vektor logo (SVG) mövcuddurmu? (Hazırda HTML-dəki PNG logo istifadə olunur.)
6. İşçi siyahısı üçün rəsmi mənbə (HR) varmı? `Office Staff` vərəqi natamamdır.

## Məlum texniki məhdudiyyət
- **Səhifə səviyyəli skeleton (`loading.tsx`) çıxarılıb.** Next.js 15.5 production rejimində layout səviyyəsindəki `loading.tsx` böyük (hissə-hissə gələn) cavablarda client-side keçidi ilişdirirdi: məs. Parametrlər → "MR təsdiq marşrutu", Anbar qalığı filtrləri. Sorğular 100 ms-dən tez cavab verdiyi üçün skeleton praktiki olaraq görünmürdü. Regressiya testi: `tests/e2e/journey.spec.ts` ("client-side tab/filter navigation never hangs"). Gələcəkdə skeleton lazım olarsa, yalnız ayrı-ayrı komponentlər səviyyəsində `<Suspense>` ilə əlavə edilməli və bu test işlədilməlidir.
