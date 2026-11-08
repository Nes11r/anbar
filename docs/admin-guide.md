# Administrator təlimatı

## İlk quraşdırmadan sonra (ardıcıllıq)
1. **Parametrlər → Anbarlar**: real anbarları yoxlayın ("Ofis", "Sahə", "Karantin" ilkin dəyərlərdir).
2. **Parametrlər → İstifadəçilər**: əməkdaşlara hesab açın, rol verin. İlk girişdə parol dəyişdirilməlidir.
3. **Parametrlər → MR təsdiq marşrutu**: hər mərhələni kimin imzalaya biləcəyini və limitləri təsdiqləyin (DoA).
4. **Parametrlər → Tədarükçülər, Kateqoriyalar**.
5. **Layihələr** və **İşçilər** (işçinin Mühəndis/Fəhlə kateqoriyası PPE yoxlaması üçün vacibdir).
6. **Kataloq**: Excel-dən import edin (aşağıda) və ya əl ilə material əlavə edin.
7. **İlkin inventarlaşdırma**: fiziki sayımı daxil edin → anbar müdiri təsdiqləyir. Yalnız bundan sonra qalıq yaranır.

## Excel importu
1. *Excel importu* → faylı yükləyin.
2. Vərəqi seçin, başlıq sətrini təsdiqləyin.
3. **Məlumat növünü özünüz seçin**:
   - *Kataloq* — yalnız material kartları.
   - *İnventar qalığı* — material kartları + **QARALAMA** sayım sənədi (qalıq dəyişmir).
   - *Tarixi məxaric* (məs. `Total`) — işçi kartında "tarixi" kimi görünür, qalığa təsir etmir.
   - *Hesabat xülasəsi* (`March/April/May/Common`) — yalnız arxiv; stok/tarixçə yaratmır.
4. Sütunları uyğunlaşdırın. Enli cədvəldə (ölçülər sütunlarda) "Ölçülər ayrı sütunlardadır" seçin; vərəqdə bir neçə cədvəl varsa "Son sətir" göstərin.
5. Preview: qırmızı (xəta) sətirlər avtomatik atlanır; xəbərdarlıqları oxuyun, lazımsız sətirləri "Atla".
6. **Təsdiq et**. Səhv olarsa — "Geri qaytar" (yaradılan qeydlər hələ istifadə olunmayıbsa).
7. İnventar qalığı importundan sonra *İnventarlaşdırma* → qaralama sayımı fiziki yoxlayın → təsdiqləyin.

Eyni fayl/vərəq eyni növdə ikinci dəfə təsdiqlənmir.

## Gündəlik iş
- **Material lazımdır** → MR yaradılır → marşrut üzrə təsdiq → Satınalma "PO yarat" → PO təsdiq.
- **Mal gəldi** → *Mal qəbulu* → PO seç → faktiki sayılanı yaz (qismən ola bilər) → Təsdiqlə: mal avtomatik anbara düşür.
- **Layihəyə verildi** → *Mədaxil/Məxaric* → "Layihəyə məxaric". **İşçiyə PPE** → "İşçiyə PPE" (layihə avtomatik işçinin layihəsi).
- **Geri qaytarıldı** → "Layihədən qaytarma" / "İşçidən geri alma"; qüsurlu → karantin.
- **Səhv sənəd** → sənəd səhifəsində "Ləğv sənədi yarat" (anbar müdiri). Təsdiqlənmiş sənəd silinmir.
- **Sayım fərqi** → *İnventarlaşdırma* → "Dövri sayım".

## Hesab problemləri
- 5 səhv parol → hesab 15 dəqiqə bloklanır (Parametrlər → İstifadəçilər-də görünür). Admin yeni parol təyin edə bilər — bütün sessiyalar bağlanır.
- Ən azı bir aktiv Super Admin həmişə qalır (sistem buna icazə verir).

## Demo və real məlumat
Demo məlumatlar yalnız development-də, `npm run db:seed:demo -- --i-understand-this-is-demo` ilə yaradılır, hamısı "DEMO" prefiksli olur və production-da işləmir. Real anbar məlumatı yalnız import və ya sayım sənədi ilə daxil olur.

## Sahə anbarları (layihə üzrə)
- Hər layihə yaradılanda onun **sahə anbarı** avtomatik açılır (`SAHE-<layihə kodu>`).
- Axın: **Ofis anbarı → “Ofisdən sahəyə göndər”** (layihə rəhbəri götürür) **→ sahə anbarı → “İşçiyə təhvil”** (sahə anbardarı verir) **→ işçi**.
- *Sahə anbarları* səhifəsində hər layihə üçün: **sahədə cəmi = sahə anbarında stokda + işçilərin üzərində**, material və ölçü üzrə bölgü, kimdə nə var.
- Sahədən material tələb olunanda (MR) MR səhifəsində “**Sahədə: stok / işçilərdə**” sütunu və xəbərdarlıq göstərilir — sahədə artıq varsa, təsdiqləyən bunu görür.

## Gündəlik sahə hesabatı
1. *Sahə anbarları → layihə → “+ Gündəlik hesabat”* (və ya mobil “+” → Sahə hesabatı).
2. Hər material üçün sahə anbardarının bildirdiyi **stokda** və **işçilərdə** rəqəmlərini yazın. Sistemin rəqəmi yanında görünür; fərq qırmızı olur.
3. Hesabat qalığı avtomatik dəyişmir. **Stok fərqi** varsa hesabat səhifəsində “Stok fərqini sayım sənədinə çevir” → anbar müdiri sayımı təsdiqləyir. **İşçilərdəki fərq** qeyd olunmamış təhvil/qaytarma deməkdir — həmin sənədi daxil edin.

## Hesab növləri və qeydiyyat
- Giriş səhifəsində “**Hesab yaradın**”: istifadəçi **İşçi / Şirkət / Sifarişçi** seçir. Hesab **admin təsdiq edənə qədər aktiv olmur**.
- *Parametrlər → İstifadəçilər → Təsdiq gözləyən qeydiyyatlar → Bax və təsdiq et*: rolu seçin (Şirkət rəhbəri üçün “Rəhbər / Direktor”), lazım olsa **layihə ilə məhdudlaşdırın** (sahə anbardarı, layihə rəhbəri, sifarişçi, işçi), işçi üçün **işçi kartını** bağlayın. “Rədd et” sorğunu silir.
- **İşçi**: ümumi anbarı və “Mənim materiallarım”ı görür. **Sifarişçi**: anbarı, layihələri, sahələri və sifarişlərin vəziyyətini görür. Hər ikisi heç nəyi təsdiq və ya dəyişə bilmir.
- Layihə ilə məhdudlaşdırılmış anbardar yalnız öz sahə anbarından öz layihəsinin işçilərinə təhvil verə, qaytarma və sayım apara bilər.

## Sifarişin izlənməsi
- MR və PO səhifələrində kargo izləməsi kimi mərhələ xətti: **Tələb yaradıldı → Təsdiqə göndərildi → Təsdiqləndi → Sifariş verildi → Ödəniş → Yoldadır → Anbarda**. Siyahılarda hər sifarişin önündə cari mərhələ və irəliləmə zolağı görünür.
- Satınalma PO səhifəsində “**Ödəniş və çatdırılma**” blokunda: “Ödəniş gözləyir / Ödənildi” (ödəniş tapşırığı № ilə) və “Yoldadır” (daşıyıcı, izləmə №) qeyd edir. Mal qəbulu (GRN) təsdiqlənəndə mərhələ avtomatik “Anbarda” olur.
