import type { UserRole } from "@prisma/client";

/**
 * In-app user guide. One guide per role (plus a common one) so nobody has to read about
 * screens they never see. Wording must match the real menu / button labels.
 */
export interface Task {
  title: string;
  steps: string[];
  note?: string;
}
export interface Guide {
  id: string;
  title: string;
  /** Session roles that open this guide by default */
  roles: UserRole[];
  who: string;
  menu?: string[];
  tasks: Task[];
  cannot?: string[];
  tips?: string[];
}

export const GLOSSARY: [string, string][] = [
  ["Ofis anbarı", "Mərkəzi anbar. Alınan mallar bura qəbul edilir, buradan layihələrə göndərilir."],
  ["Sahə anbarı", "Hər layihənin öz anbarı. Layihə yaradılanda avtomatik açılır. Layihədə olan material burada görünür."],
  ["Sahədə cəmi", "Sahə anbarında stokda olan + işçilərin üzərində olan."],
  ["İşçilərdə", "İşçiyə verilmiş, hələ geri qaytarılmamış əşyalar (geyim, dəbilqə, alət). Sərf materialları bura düşmür."],
  ["Sərf materialı", "İstifadə olunub bitən material (əlcək, elektrod, disk). İşçiyə veriləndə istifadə olunmuş sayılır, geri qaytarılmır."],
  ["Sahədə istifadə (sərf)", "Sahədə işdə istifadə olunan material. Sahə anbarından silinir və layihənin xərcinə yazılır."],
  ["MR (Material tələbi)", "“Bizə bu material lazımdır” sorğusu. Təsdiqdən sonra satınalma ondan sifariş (PO) yaradır."],
  ["PO (Satınalma sifarişi)", "Tədarükçüyə verilən sifariş. Ödəniş və yolda olma vəziyyəti burada izlənir."],
  ["GRN (Mal qəbulu)", "Tədarükçüdən gələn malın anbara qəbulu. Təsdiqlənəndə mal avtomatik anbar qalığına düşür."],
  ["Karantin", "Qüsurlu / yararsız malın saxlandığı ayrıca anbar. Buradakı mal “mövcud” sayılmır."],
  ["Qaralama", "Yadda saxlanılmış, amma hələ təsdiqlənməmiş sənəd. Qalığa təsir etmir."],
  ["Təsdiqləmək", "Sənədi qalığa yazmaq. Təsdiqlənmiş sənəd dəyişdirilmir — səhv olarsa “Ləğv et” ilə əks sənəd yaradılır."],
  ["Minimum ehtiyat", "Materialın anbarda azı nə qədər olmalı olduğu. Qalıq bu həddə enəndə “Aşağı qalıq” xəbərdarlığı çıxır."],
];

export const COMMON: Guide = {
  id: "hami",
  title: "Hamı üçün",
  roles: [],
  who: "Sistemə daxil olmaq, parol, telefonda istifadə və çap — bütün istifadəçilər üçün eynidir.",
  tasks: [
    {
      title: "Sistemə daxil olmaq",
      steps: [
        "warehousehecotec.com ünvanını açın.",
        "E-poçtunuzu və parolunuzu yazıb “Daxil ol” basın.",
        "İlk girişdə sistem parolu dəyişməyi xahiş edə bilər — yuxarıdakı sarı xəbərdarlıqdakı linkə basın və yeni parol təyin edin.",
      ],
    },
    {
      title: "Hesab yaratmaq (qeydiyyat)",
      steps: [
        "Giriş səhifəsində “Hesab yaradın” linkinə basın.",
        "Hesab növünü seçin: Şirkət (rəhbərlik, ofis, anbar, satınalma əməkdaşları) və ya Sifarişçi.",
        "Ad, e-poçt və parolu yazıb “Qeydiyyat sorğusu göndər” basın.",
        "Administrator sorğunuzu təsdiq edib rolunuzu təyin edəndən sonra daxil ola bilərsiniz.",
      ],
      note: "İşçilərin sistemə girişi yoxdur — onlara verilən material anbardar tərəfindən ad-soyadla qeyd olunur.",
    },
    {
      title: "Parolu dəyişmək",
      steps: ["Yuxarı sağda adınıza basın.", "“Parolu dəyiş” bölməsində köhnə və yeni parolu yazıb yadda saxlayın.", "Parol ən azı 10 simvol olmalı, həm hərf, həm rəqəm olmalıdır."],
    },
    {
      title: "Telefonda istifadə (tətbiq kimi)",
      steps: [
        "Telefonda saytı açın.",
        "Android (Chrome): menyu ⋮ → “Ana ekrana əlavə et”. iPhone (Safari): Paylaş → “Ana ekrana əlavə et”.",
        "Ekranda HECOTEC ikonu yaranır — tətbiq kimi açılır. Aşağıdakı panel ən çox lazım olan bölmələrə aparır.",
      ],
    },
    {
      title: "Çap etmək və ya PDF almaq",
      steps: [
        "Data olan istənilən səhifədə “Çap / PDF” düyməsinə basın.",
        "Printer seçin və ya “PDF kimi saxla” seçin.",
        "Çapda yuxarıda HECOTEC başlığı və tarix, aşağıda həmin sənədə uyğun imza yerləri olur. Düymələr və filtrlər kağızda görünmür.",
      ],
    },
    {
      title: "Axtarış, filtrlər və Excel",
      steps: [
        "Yuxarıdakı axtarış sahəsinə material adı, SKU və ya sənəd nömrəsi yazıb Enter basın.",
        "Siyahılarda yuxarıdakı düymələrlə (məs. “Qəbul gözləyən”, “Aşağı qalıq”) süzgəc qoyun.",
        "“Excel” düyməsi ekrandakı siyahını Excel faylı kimi yükləyir.",
      ],
    },
    {
      title: "“Yalnız baxış üçün” yazısı nə deməkdir?",
      steps: [
        "Bəzi bölmələri görə bilərsiniz, amma dəyişə bilməzsiniz. Belə səhifələrin yuxarısında mavi xəbərdarlıq çıxır.",
        "Xəbərdarlıqda həmin işi hansı rolun edə bildiyi yazılır — lazım olsa həmin şəxsə müraciət edin.",
        "Sizə aid olmayan bölmələr isə menyuda ümumiyyətlə görünmür.",
      ],
    },
  ],
  tips: [
    "Gecə / gündüz rejimi və sıx görünüş yuxarı sağdakı düymələrlə dəyişir.",
    "Təsdiqlənmiş sənəd silinmir — səhvi düzəltmək üçün sənəd səhifəsində “Ləğv et” istifadə olunur (anbar müdiri). Beləliklə tarixçə həmişə qalır.",
    "Hər rəqəm təsdiqlənmiş sənədlərdən hesablanır — Excel-də əl ilə düzəliş etməyə ehtiyac yoxdur.",
  ],
};

export const GUIDES: Guide[] = [
  {
    id: "direktor",
    title: "Rəhbər / Direktor",
    roles: ["DIRECTOR"],
    who: "Şirkətin rəhbəri. Bütün bölmələri görür, bütün təsdiqləri verə bilər. Sistem parametrləri (istifadəçilər, ehtiyat nüsxə) Super Admin-dədir.",
    menu: ["İdarə paneli", "Material kataloqu", "Anbar qalığı", "Layihələr və sahələr", "Material tələbləri (MR)", "Satınalma sifarişləri (PO)", "Mal qəbulu (GRN)", "Hesabatlar", "Audit jurnalı"],
    tasks: [
      {
        title: "Günün ümumi vəziyyətinə baxmaq",
        steps: [
          "“İdarə paneli”ni açın: stokdakı materiallar, kritik stok, təsdiq gözləyən MR-lər, gözlənilən sifarişlər.",
          "“Aşağı qalıq xəbərdarlığı” kartında minimuma enmiş materiallar görünür. “MR yarat” düyməsi onları bir MR-a yığır.",
          "“Layihələr və sahələr” bölməsində hər layihə üçün: sahədə cəmi / işçilərdə / stokda.",
        ],
      },
      {
        title: "MR-ı təsdiq etmək",
        steps: [
          "“Material tələbləri (MR)” → təsdiq gözləyən MR-ı açın.",
          "Cədvəldə hər material üçün: tələb, anbarda olan (ofis + həmin layihənin sahəsi), sifariş olunacaq xalis miqdar.",
          "“Sahədə: stok / işçilərdə” sütununa baxın — sahədə artıq varsa, əlavə almağa ehtiyac olmaya bilər.",
          "Aşağıda marşrutda öz mərhələnizdə “Təsdiq”, “Düzəlişə qaytar” və ya “Rədd et” basın (şərh yazmaq olar).",
        ],
        note: "Marşrut: Layihə rəhbəri → Rəhbər (yalnız məbləğ limitdən yuxarıdırsa) → Satınalma. Rəhbər istənilən mərhələni imzalaya bilər.",
      },
      {
        title: "Sifarişin harada olduğunu izləmək",
        steps: [
          "“Satınalma sifarişləri (PO)” siyahısında “Vəziyyət (izləmə)” sütunu: təsdiqləndi → ödəniş gözləyir → ödənildi → yoldadır → anbarda.",
          "PO-nu açın — yuxarıda mərhələlər xətti, tarixlər və kargo məlumatı görünür.",
        ],
      },
      {
        title: "Hesabat və Excel",
        steps: [
          "“Hesabatlar”: layihələr üzrə verilən material, PPE (fəhlə / mühəndis), inventar fərqləri.",
          "Hər hesabatda “Excel” düyməsi var.",
          "Kim nə vaxt nəyi dəyişib — “Audit jurnalı”nda.",
        ],
      },
    ],
    tips: ["Anbar müdirinin edə bildiyi hər şeyi siz də edə bilərsiniz (sənəd təsdiqi, ləğv, layihə və material əlavə etmək) — ayrıca “Anbar müdiri” bölməsinə baxın."],
    cannot: ["İstifadəçi hesablarını təsdiq etmək, rolları dəyişmək və sistem parametrləri — Super Admin edir."],
  },
  {
    id: "admin",
    title: "Super Admin",
    roles: ["SUPER_ADMIN"],
    who: "Sistem administratoru. Rəhbərin bütün imkanlarından əlavə istifadəçiləri, rolları, MR təsdiq marşrutunu və sistem parametrlərini idarə edir.",
    menu: ["Bütün bölmələr", "Parametrlər → Anbarlar, Tədarükçülər, Kateqoriyalar, İstifadəçilər və rollar, MR təsdiq marşrutu, Sistem və ehtiyat nüsxə", "Excel importu"],
    tasks: [
      {
        title: "Yeni qeydiyyatı təsdiq etmək",
        steps: [
          "“Parametrlər” → “İstifadəçilər və rollar”. Yuxarıda “Təsdiq gözləyən qeydiyyatlar” siyahısı var.",
          "“Bax və təsdiq et” basın.",
          "Rolu seçin. Sahə anbardarı, layihə rəhbəri və sifarişçi üçün “Layihə ilə məhdudlaşdır” sahəsində layihəni seçin.",
          "“Yadda saxla” — hesab aktivləşir. Lazım deyilsə “Rədd et”.",
        ],
        note: "Sifarişçi hesabı layihə seçilmədən təsdiq olunmur — sifarişçi yalnız öz layihəsini görür.",
      },
      {
        title: "İşçiyə özünüz hesab açmaq",
        steps: ["“İstifadəçilər və rollar” → “Yeni istifadəçi”.", "E-poçt, ad, rol, lazımsa layihə və ilkin parol yazın.", "İstifadəçi ilk girişdə parolu dəyişməlidir."],
      },
      {
        title: "Hansı rol nə edir?",
        steps: [
          "Rəhbər / Direktor — hər şeyi görür və təsdiq edir (parametrlərdən başqa).",
          "Anbar müdiri — anbar, sayım, düzəliş, ləğv, katalog, layihələr.",
          "Anbardar — mal qəbulu, göndərmə, işçiyə təhvil. Layihəyə bağlanarsa — yalnız həmin sahədə işləyir.",
          "Satınalma — MR-ın son təsdiqi, sifarişlər (PO), ödəniş və yolda olma.",
          "Layihə rəhbəri — MR yazır və təsdiq edir, sahəyə baxır, gündəlik hesabat verir.",
          "Oxucu / Auditor — hər şeyə baxır, heç nəyi dəyişmir.",
          "Sifarişçi — yalnız öz layihəsinin sahəsini və sifarişlərini görür, qiymətləri görmür.",
        ],
      },
      {
        title: "MR təsdiq marşrutu və limitlər",
        steps: [
          "“Parametrlər” → “MR təsdiq marşrutu”: hansı mərhələ aktivdir, kim imzalayır.",
          "Standart: Layihə rəhbəri → Rəhbər (limitdən yuxarı) → Satınalma. Söndürülmüş mərhələləri lazım olsa açmaq olar.",
          "Rəhbərin imzası lazım olan məbləğ limiti də həmin bölmədə (“Təsdiq limitləri”) dəyişir.",
        ],
      },
      {
        title: "Köhnə Excel faylından məlumat köçürmək",
        steps: ["“Excel importu” → faylı seçin → “Yüklə”.", "Sistem sətirləri yoxlayır və nəticəni göstərir. Yoxlayıb təsdiq edin.", "İlkin qalıqlar qaralama sayım kimi yaranır — anbar müdiri “Sayım və ilkin qalıq” bölməsində təsdiqləyir."],
      },
    ],
    tips: ["Sistemin sağlamlığı: “Sistem və ehtiyat nüsxə” bölməsindəki yoxlama linki jurnal ilə qalıqların uyğun olduğunu göstərir."],
  },
  {
    id: "anbar-muduru",
    title: "Anbar müdiri",
    roles: ["WAREHOUSE_MANAGER"],
    who: "Anbarın sahibi. Qalığın düzgünlüyünə cavabdehdir: ilkin qalıq, sayım, düzəliş, ləğv, katalog, layihələr.",
    menu: ["İdarə paneli", "Material kataloqu", "Anbar qalığı", "Sayım və ilkin qalıq", "Layihələr və sahələr", "Mədaxil / Məxaric", "Hərəkət jurnalı", "MR / PO / GRN", "Layihələri idarə et", "Hesabatlar", "Excel importu", "Audit jurnalı", "Parametrlər"],
    tasks: [
      {
        title: "Yeni material əlavə etmək",
        steps: [
          "“Material kataloqu” → “+ Yeni material”.",
          "Material kodunu yazın (boş qalsa sistem verir), adı, kateqoriyanı və ölçü vahidini seçin.",
          "Forma / PPE-dirsə: kimin üçündür (fəhlə / mühəndis / hər ikisi) və ölçüləri seçin — hər ölçü ayrıca qalıq kimi saxlanır.",
          "Əlcək, elektrod kimi istifadə olunub bitən materialdırsa “Sərf materialıdır” işarəsini qoyun.",
          "“Minimum ehtiyat” yazın — qalıq bu həddə enəndə xəbərdarlıq çıxacaq.",
        ],
      },
      {
        title: "Sistemə başlayanda ilkin qalığı yazmaq",
        steps: [
          "“Sayım və ilkin qalıq” → “+ Yeni sayım” → Rejim: “İlkin qalıq”.",
          "Anbarı seçin, sayımı aparanları yazın, hər material və ölçü üçün sayılmış miqdarı yazın.",
          "“Qaralama kimi saxla”, sonra sənəddə “Təsdiqlə və qalığa yaz”.",
        ],
        note: "İlkin qalıq yalnız heç bir hərəkəti olmayan material üçün bir dəfə yazılır. Sonrakı yoxlamalar “Dövri sayım” rejimi ilədir — fərq avtomatik düzəliş kimi yazılır.",
      },
      {
        title: "Yeni layihə açmaq",
        steps: ["“Layihələr və sahələr” → “+ Yeni layihə” (və ya “Layihələri idarə et”).", "Layihə kodu, adı, sifarişçi (müştəri şirkət), layihə rəhbəri, başlama tarixi.", "Yadda saxlayan kimi layihənin sahə anbarı avtomatik açılır."],
      },
      {
        title: "Layihəni bağlamaq",
        steps: ["Layihədə “Aktivdir” işarəsini götürün.", "Sahədə və ya işçilərdə material qalıbsa, sistem bağlamağa icazə vermir və nə qaldığını yazır.", "Əvvəlcə artığı ofisə qaytarın, işçilərdən geri alın və ya işçini başqa layihəyə keçirin."],
      },
      {
        title: "Sahə hesabatındakı fərqi düzəltmək",
        steps: [
          "Sahə səhifəsində son hesabatı açın. Qırmızı “Stok” fərqi varsa “Stok fərqini sayım sənədinə çevir” basın — qaralama sayım yaranır, siz təsdiq edəndə qalıq düzəlir.",
          "“İşçilərdə” fərqi üçün aşağıdakı “İşçilərdəki fərqi düzəlt” kartından həmin işçidən geri alın və ya təhvili qeyd edin.",
        ],
      },
      {
        title: "Qalıq düzəlişi (itki, zədə)",
        steps: ["“Mədaxil / Məxaric” → “Düzəliş”.", "Anbarı, materialı, artır / azalt və səbəbi yazın.", "Düzəlişi yalnız anbar müdiri (və rəhbər) təsdiqləyə bilər."],
      },
      {
        title: "Karantindəki qüsurlu mal",
        steps: [
          "Qüsurlu qaytarılan mal karantin anbarına düşür. “Anbar qalığı” səhifəsində sarı xəbərdarlıq çıxır.",
          "Yararsızdırsa “Yararsızı sil” (düzəliş sənədi), tədarükçüyə gedirsə “Tədarükçüyə qaytar”.",
        ],
      },
      {
        title: "Səhv təsdiqlənmiş sənədi ləğv etmək",
        steps: ["Sənədi açın → “Ləğv et”, səbəbi yazın.", "Sistem əks sənəd yaradır, qalıq əvvəlki vəziyyətə qayıdır. Əsl sənəd və ləğv tarixçədə qalır."],
      },
      {
        title: "İşçini başqa layihəyə keçirmək",
        steps: ["Sahə səhifəsində işçinin adına basın.", "“Başqa layihəyə keçir / Fəhlə–Mühəndis dəyiş” bölməsini açın, yeni layihəni seçin.", "İşçinin üzərindəki əşyalar da yeni layihəyə keçir."],
      },
    ],
    tips: ["Anbardarın etdiyi hər şeyi (qəbul, göndərmə, işçiyə təhvil) siz də edə bilərsiniz — “Anbardar” bölməsinə baxın."],
    cannot: ["İstifadəçi hesabları və MR marşrutu — Super Admin.", "Sifariş (PO) yaratmaq — Satınalma."],
  },
  {
    id: "anbardar",
    title: "Anbardar",
    roles: ["STOREKEEPER"],
    who: "Gündəlik anbar işi: maldan qəbul, sahəyə göndərmə, işçiyə təhvil, sahədə istifadə, geri alma. Əgər hesabınız bir layihəyə bağlıdırsa (sahə anbardarı), yalnız həmin sahənin anbarında işləyirsiniz.",
    menu: ["İdarə paneli", "Material kataloqu", "Anbar qalığı", "Sayım və ilkin qalıq", "Layihələr və sahələr", "Mədaxil / Məxaric", "Hərəkət jurnalı", "MR", "PO (baxış)", "Mal qəbulu (GRN)", "Hesabatlar"],
    tasks: [
      {
        title: "Tədarükçüdən gələn malı qəbul etmək",
        steps: [
          "“Satınalma sifarişləri (PO)” → gələn sifarişi açın → “Mal qəbulu (GRN)”.",
          "Hər sətirdə gələn miqdarı yazın. Zədəli varsa “rədd” miqdarına yazın — anbara düşmür.",
          "Qaimə nömrəsini yazın və “Qəbul et və təsdiqlə” basın. Mal dərhal anbar qalığına düşür.",
        ],
        note: "Sifarişdən artıq qəbul etmək olmur. Mal hissə-hissə gələ bilər — hər gələndə yeni qəbul yazılır.",
      },
      {
        title: "Ofisdən layihəyə (sahəyə) material göndərmək",
        steps: [
          "“Mədaxil / Məxaric” → “+ Sahəyə göndər” (və ya sahə səhifəsində “Ofisdən sahəyə göndər”).",
          "“Hansı layihəyə göndərilir” — layihəni seçin.",
          "“Daşıyan şəxs” — materialı aparanın adı.",
          "Materialları və miqdarı əlavə edin → “Təsdiqlə”. Material sahə anbarına keçir, sahə səhifəsi açılır.",
        ],
      },
      {
        title: "İşçiyə material vermək (geyim, dəbilqə, əlcək…)",
        steps: [
          "Sahə səhifəsində “İşçiyə təhvil” (və ya “Mədaxil / Məxaric” → “+ İşçiyə təhvil”).",
          "Anbarı seçin (adətən sahə anbarı).",
          "İşçinin adını və soyadını yazın — əvvəl material verilmişsə ad siyahıda çıxır, ondan seçin. Yeni addırsa Fəhlə və ya Mühəndis seçin.",
          "Materialları və miqdarı əlavə edin → “Təsdiqlə”.",
        ],
        note: "Ayrıca işçi qeydiyyatı lazım deyil. Adı həmişə eyni yazın (siyahıdan seçin) — fərqli yazılış ayrı işçi sayılır. Mühəndis forması fəhləyə verilərsə sistem xəbərdarlıq edir, amma bloklamır — sənəddə qeyd olunur.",
      },
      {
        title: "Sahədə istifadə olunan materialı yazmaq (sərf)",
        steps: [
          "Sahə səhifəsində “Sahədə istifadə (sərf)”.",
          "Kim istifadə etdi (usta / briqada), materiallar və miqdar → “Təsdiqlə”.",
          "Material sahə anbarından silinir və layihənin xərcinə yazılır.",
        ],
        note: "Layihədə istifadə yalnız həmin layihənin sahə anbarından yazılır. Ofisdəki materialı əvvəlcə sahəyə göndərin.",
      },
      {
        title: "İşçidən geri almaq",
        steps: [
          "“Mədaxil / Məxaric” → “İşçidən geri alma”.",
          "Kimdən geri alındığını və hansı anbara qəbul edildiyini seçin.",
          "Hər sətirdə vəziyyət: yararlı — anbara qayıdır; qüsurlu / itib — karantinə düşür.",
        ],
      },
      {
        title: "Artığı sahədən ofisə qaytarmaq",
        steps: ["Sahə səhifəsində “Artığı ofisə qaytar”.", "Hara — ofis anbarı. Daşıyan şəxsi, materialları yazın → “Təsdiqlə”."],
      },
      {
        title: "Gündəlik sahə hesabatı",
        steps: [
          "Sahə səhifəsində “+ Gündəlik hesabat” (telefonda aşağı paneldə “Sahə hesabatı”).",
          "Hər material üçün sahədə saydığınızı yazın: stokda neçə, işçilərdə neçə.",
          "“Hesabatı saxla”. Sistem sizin saydığınızı sistemdəki rəqəmlə müqayisə edir və fərqi göstərir.",
        ],
        note: "Hesabat qalığı dəyişmir — fərqi anbar müdiri yoxlayıb düzəldir. Gündəlik hesabat ofisə kimin nəyə ehtiyacı olduğunu göstərir.",
      },
      {
        title: "Material azalıbsa — MR yazmaq",
        steps: ["“Material tələbləri (MR)” → “+ Yeni MR” (və ya idarə panelində “MR yarat”).", "Layihə, iş sahəsi, nə vaxt lazımdır, materiallar və miqdar → “Təsdiqə göndər”.", "Ətraflı: “Layihə rəhbəri” bölməsində “MR yazmaq”."],
      },
    ],
    cannot: [
      "Qalıq düzəlişini təsdiqləmək, təsdiqlənmiş sənədi ləğv etmək — anbar müdiri.",
      "Sahə anbardarı: başqa layihənin sahəsində işləmək, sahədən başqa layihəyə göndərmək (yalnız ofisə qaytarmaq olar).",
      "Sifariş (PO) yaratmaq — Satınalma.",
    ],
    tips: ["Bir sənəddə səhv etsəniz, anbar müdirinə deyin — o, “Ləğv et” ilə düzəldir. Təsdiqlənmiş sənəd silinmir."],
  },
  {
    id: "layihe-rehberi",
    title: "Layihə rəhbəri",
    roles: ["PROJECT_MANAGER"],
    who: "Layihənin ehtiyacına cavabdehdir: MR yazır və təsdiq edir, sahədə nə olduğunu izləyir, gündəlik hesabatı görür.",
    menu: ["İdarə paneli", "Material kataloqu", "Anbar qalığı", "Layihələr və sahələr", "Mədaxil / Məxaric (baxış)", "Material tələbləri (MR)", "PO (baxış)", "Layihələri idarə et", "Hesabatlar"],
    tasks: [
      {
        title: "Sahədə nə var — yoxlamaq",
        steps: [
          "“Layihələr və sahələr” → layihənizi açın.",
          "Yuxarıda: sahədə cəmi, işçilərdə, stokda. Aşağıda material üzrə cədvəl və “Kimdə nə var (işçilər üzrə)”.",
          "Yeni tələb gəlməmişdən əvvəl buraya baxın — sahədə artıq varsa, almağa ehtiyac yoxdur.",
        ],
      },
      {
        title: "MR yazmaq (material sifarişi istəmək)",
        steps: [
          "“Material tələbləri (MR)” → “+ Yeni MR”.",
          "Layihə, iş sahəsi (disiplin), nə vaxt lazımdır, təcililik.",
          "Materialları kataloqdan seçin və miqdarı yazın. Kataloqda yoxdursa təsvirini yazın.",
          "Ofisdə və layihənizin sahəsində olan qalıq avtomatik çıxılır — yalnız çatışmayan sifariş olunur.",
          "“Təsdiqə göndər”. Hələ hazır deyilsə “Qaralama kimi saxla”.",
        ],
        note: "Təcili / fövqəladə MR üçün “Niyə təcilidir” yazmaq məcburidir. Əlavə sahələr (tarix, valyuta, istinad sənədləri) “Əlavə məlumat” bölməsindədir — lazım deyilsə toxunmayın.",
      },
      {
        title: "MR-ı təsdiq etmək",
        steps: ["Təsdiq gözləyən MR-ı açın.", "Marşrutda “Layihə rəhbəri” mərhələsində “Təsdiq”, “Düzəlişə qaytar” və ya “Rədd et”.", "Təsdiqdən sonra MR rəhbərə (məbləğ böyükdürsə) və satınalmaya gedir."],
      },
      {
        title: "Sifarişin harada olduğunu izləmək",
        steps: ["MR-ı açın — yuxarıda mərhələ xətti: təsdiq → sifariş → ödəniş → yolda → anbarda.", "Sifariş (PO) linkinə basaraq ətraflı vəziyyətə baxın."],
      },
      {
        title: "Gündəlik hesabatı vermək / baxmaq",
        steps: ["Sahə səhifəsində “+ Gündəlik hesabat”.", "Hər material üçün stokda və işçilərdə sayılanı yazın → “Hesabatı saxla”.", "Keçmiş hesabatlar sahə səhifəsində “Son gündəlik hesabatlar” kartındadır."],
      },
      {
        title: "Layihə yaratmaq / dəyişmək",
        steps: ["“Layihələri idarə et” → “+ Yeni layihə” və ya layihəni açıb “Düzəliş”.", "Sahə anbarı avtomatik açılır."],
      },
    ],
    cannot: ["Anbardan material çıxarmaq, göndərmək, işçiyə vermək — anbardar edir.", "Sifariş (PO) yaratmaq — Satınalma."],
  },
  {
    id: "satinalma",
    title: "Satınalma",
    roles: ["PROCUREMENT"],
    who: "Təsdiqlənmiş MR-lardan sifariş (PO) yaradır, tədarükçü ilə işləyir, ödəniş və çatdırılmanı izləyir.",
    menu: ["İdarə paneli", "Material kataloqu", "Anbar qalığı", "Layihələr və sahələr", "Material tələbləri (MR)", "Satınalma sifarişləri (PO)", "Mal qəbulu (GRN) (baxış)", "Hesabatlar"],
    tasks: [
      {
        title: "MR-ı son təsdiqləmək",
        steps: ["Təsdiq gözləyən MR-ı açın.", "“Satınalma” mərhələsində “Təsdiq” — MR sifarişə hazırdır."],
      },
      {
        title: "MR-dan sifariş (PO) yaratmaq",
        steps: [
          "Təsdiqlənmiş MR-ı açın → “PO yarat”.",
          "Tədarükçünü, gözlənilən tarixi və qiymətləri yazın. Miqdar MR-dakı xalis miqdardan çox ola bilməz.",
          "“Qaralama kimi saxla”, sonra PO səhifəsində “Təsdiqlə”.",
        ],
        note: "Bir MR-dan bir neçə PO (fərqli tədarükçülər) yaratmaq olar. MR-sız PO yalnız rəhbər icazəsi ilə, səbəb yazılaraq.",
      },
      {
        title: "Ödəniş və çatdırılmanı qeyd etmək (kargo kimi izləmə)",
        steps: [
          "PO-nu açın. “Ödəniş” bölməsində: “Ödəniş gözləyir” və ya “Ödənildi” (ödəniş sənədi nömrəsini yazmaq olar).",
          "Mal yola düşəndə: daşıyıcı və izləmə nömrəsini yazıb “Yoldadır kimi qeyd et”.",
          "Mal anbara çatıb qəbul olunanda vəziyyət avtomatik “Anbarda” olur.",
        ],
      },
      {
        title: "Tədarükçü əlavə etmək",
        steps: ["Tədarükçü siyahısı “Parametrlər → Tədarükçülər” bölməsindədir — yeni tədarükçünü anbar müdiri və ya rəhbər əlavə edir."],
      },
    ],
    cannot: ["Malı anbara qəbul etmək (GRN) — anbardar.", "Anbardan material çıxarmaq."],
  },
  {
    id: "auditor",
    title: "Oxucu / Auditor",
    roles: ["AUDITOR", "EMPLOYEE"],
    who: "Hər şeyə baxır, heç nəyi dəyişmir. Yoxlama, hesabat və nəzarət üçün.",
    menu: ["İdarə paneli", "Material kataloqu", "Anbar qalığı", "Sayım və ilkin qalıq", "Layihələr və sahələr", "Mədaxil / Məxaric", "Hərəkət jurnalı", "MR / PO / GRN", "Hesabatlar", "Audit jurnalı"],
    tasks: [
      {
        title: "Bir materialın tarixçəsini yoxlamaq",
        steps: ["“Anbar qalığı” → materialı açın.", "Anbarlar üzrə qalıq və bütün hərəkətlər (kim, nə vaxt, hansı sənədlə).", "“Hərəkətlər (Excel)” ilə yükləyin."],
      },
      {
        title: "Kim nəyi dəyişib",
        steps: ["“Audit jurnalı”: hər yaradılma, dəyişiklik, təsdiq və ləğv — istifadəçi və vaxtla.", "“Hərəkət jurnalı”: anbar qalığına təsir edən bütün yazılar."],
      },
      {
        title: "Hesabatlar",
        steps: ["“Hesabatlar”: layihələr üzrə, PPE (fəhlə / mühəndis), inventar fərqləri.", "Hər birini Excel və ya “Çap / PDF” ilə çıxarın."],
      },
    ],
    cannot: ["Heç bir sənəd yaratmaq, təsdiqləmək və ya dəyişmək."],
  },
  {
    id: "sifarisci",
    title: "Sifarişçi",
    roles: ["CLIENT"],
    who: "Müştəri şirkət. Yalnız öz layihəsini görür: sahəyə nə gəlib, sifarişlər hansı mərhələdədir.",
    menu: ["Layihələr və sahələr (yalnız sizin layihə)", "Material tələbləri (MR)", "Satınalma sifarişləri (PO)"],
    tasks: [
      {
        title: "Layihəmdə nə var",
        steps: ["Daxil olan kimi layihənizin sahə səhifəsi açılır.", "Material üzrə: sahədə cəmi, stokda və işdə olan."],
      },
      {
        title: "Sifariş hansı mərhələdədir",
        steps: [
          "“Material tələbləri (MR)” → tələbi açın: təsdiq → sifariş → ödəniş → yolda → anbarda.",
          "“Satınalma sifarişləri (PO)” → sifarişi açın: tədarükçü, gözlənilən tarix, nə qədəri qəbul olunub.",
        ],
      },
    ],
    cannot: ["Heç nəyi təsdiq və ya dəyişmək.", "Başqa layihələri, şirkətin ümumi anbarını, qiymətləri və daxili hesabatları görmək."],
    tips: ["Hesabınız hələ layihəyə bağlanmayıbsa, heç bir məlumat görünmür — administratora müraciət edin."],
  },
];

export const ALL: Guide[] = [COMMON, ...GUIDES];

export function guideForRole(role: UserRole): Guide {
  return GUIDES.find((g) => g.roles.includes(role)) ?? COMMON;
}
