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
