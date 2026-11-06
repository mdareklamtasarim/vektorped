# VektörPad — Claude için çalışma notları

VektörPad, iPad için yazılmış, CorelDRAW 2026'yı (yalnızca CorelDRAW; Technical Suite, PHOTO-PAINT ve bulut/yapay zekâ servisleri hariç) görünüm ve davranış olarak birebir örnek alan Türkçe bir vektör çizim web uygulamasıdır. Kullanıcı Türkçe konuşur; ona Türkçe, kısa ve sade yaz.

Canlı adres: https://mdareklamtasarim.github.io/vektorped/ (bu deponun `main` dalı GitHub Pages ile yayımlanır).

## Yapı
- `index.html`: arayüz iskeleti ve CSS. Modüller `<script src="vp-*.js">` ile **sırayla** yüklenir; sıra önemlidir (sonraki modüller öncekilerin fonksiyonlarını sarar).
- `vp-*.js`: her modül `window.VP` nesnesine bağlanır. Önemli noktalar:
  - Komutlar `VP.actions` (A[id] = {label, icon, run, enabled, checked, kbd}), menüler `VP.ui.MENUS`.
  - Paneller (docker) `VP.ui.panels[anahtar]` + `VP.ui.DOCKERS`; araçlar `VP.tools`, `VP.TOOL_META`.
  - Özellik çubuğu `VP.ui.renderPropbar`; alan ve düğme olayları `VP.tx.propField` / `VP.tx.act` zincirleriyle (ön ek ile) yönlendirilir.
  - Canlı efektler `data.effect` taşıyan gruplardır (`VP.fx`, `FX.TYPES`).
  - Dışa aktarma kancaları `VP.io.exportHooks`; çizim katmanı kancaları `VP.overlayHooks`.
  - Klasik masaüstü görünümü `vp-classic.js`, Corel koyu tema renkleri `vp-skin.js`, Corel tarzı paneller `vp-corel3..7.js`, seçim aracı `vp-pick.js`, birimler `vp-units.js`, kısayollar `vp-keys.js`.
- `sw.js`: çevrimdışı önbellek (service worker). **Yeni dosya eklersen** hem `index.html`'deki script listesine (vp-ctx.js'ten önce) hem `sw.js`'deki `FILES` listesine ekle ve `VERSION` değerini değiştir; yoksa iPad eski sürümü göstermeye devam eder.
- Yerel kütüphaneler: `paper-full.min.js`, `jspdf.umd.min.js`, `svg2pdf.umd.min.js`, `opentype.min.js`, `pdf.min.js`; yazı tipleri `fonts.css` + `f*.woff2`.

## Kurallar
- Corel'in simgelerini, logosunu ve marka öğelerini kopyalama; renk, ölçü, yerleşim ve davranışı eşleştir.
- iPad'de dokunmatik kullanım bozulmasın: ince ölçüler fare için, `@media (pointer: coarse)` altında parmak boyu korunur.
- Kod yorumları kısa ve sade İngilizce; arayüz metinleri Türkçe.
- Her değişiklikten sonra uygulamayı tarayıcıda aç (ör. `python -m http.server` ile bu klasörü sun), konsolda hata olmadığını ve değişikliğin çalıştığını kontrol et; sonra `main` dalına commit edip `git push` yap.

## Görev: Corel'i incele ve VektörPad'i ona göre ayarla
Bilgisayarda CorelDRAW 2026 Türkçe açık. Bilgisayar kontrolünü kullanarak Corel'i aşağıdaki 8 bölüme ayır ve her bölüm için bir alt ajan görevlendir:
1. Dosya ve Mizanpaj menüleri (yeni/aç/kaydet, içe/dışa aktar, PDF olarak yayımla, yazdır, sayfa ayarları)
2. Düzen ve Görünüm menüleri (görünüm modları, yakalama, kılavuzlar, cetveller, yakınlaştırma)
3. Nesne menüsü ve Nesneler paneli (dönüştürme, hizalama, sıralama, şekillendirme, PowerClip, semboller)
4. Araç kutusu: her araç ve açılır grup, her aracın özellik çubuğu (nesne seçiliyken ve değilken)
5. Efektler, dolgular ve anahat kalemi (harmanlama, kontur, gölge, zarf, derinlik, saydamlık, mercek, dolgu türleri)
6. Metin ve Tablo (Metin paneli, OpenType, yola metin, tablo işlemleri)
7. Biteşlemler ve PowerTRACE (dönüştürme, izleme, ayarlamalar, efektler)
8. Arayüz: Araçlar ve Pencere menüleri, paneller, paletler, Seçenekler (Ctrl+J), durum çubuğu

Her ajan kendi bölümündeki her menüyü, alt menüyü, iletişim kutusunu ve paneli Corel'de açıp incelesin. Ekran görüntüleriyle ölçü ve renkleri not alsın, VektörPad kodunda karşılığını bulsun, eksik ya da farklı olanları birebir aynı hale getirsin. Ajanlar aynı anda aynı dosyayı düzenlemesin; çakışma riski varsa değişiklikleri sırayla birleştir. Her bölüm bitince test et, commit edip gönder ve kullanıcıya o bölümde neyin değiştiğini Türkçe ve kısa olarak yaz.

## Daha önce bulunan eksikler (öncelik sırasıyla, kalanlar)
- Dosya ve yazdırma: aynı dosyanın üzerine yazan Kaydet, EPS/TIFF/PSD içe aktarma, ön denetim, çıktı için topla, yazdırmada döşeme ve ölçek, gerçek baskı önizleme.
- Resimler: PowerTRACE'in resmi 900 px'e küçültmesi (tam çözünürlük), renk tablosu, ton eğrisi, resimde geçişli saydamlığın çalışmaması, yarım tonlu siyah-beyaz.
- Damlalığın resimden piksel rengi alması; Nesneler panelinde sürükle-bırak ve yeniden adlandırma; kilitli nesnenin seçilebilmesi.
- Arayüz: Pencere menüsünde tekrarlanan panel maddeleri, aynı anda birden çok palet, çalışma alanı kaydetme, paragraf metninde karakter düzeyi biçim.

## Saga / CutArtist (vp-saga.js, araclar/cutartist-gonder.ps1)
- Corel'deki Saga eklentisi (CutArtist klasöründe `plugin\Corel\CorelDRAW\SagaCdrStandard.cpg`) işi `C:\Users\Public\Documents\SagaCommonPlugin\ABDOPQR.pdf` + `ABDOPQR.plt` olarak yazar.
- CutArtist kapalıysa `CutArtist.exe -f <pdf> <plt>` ile açılır; açıksa dosyalar `C:\Users\Public\Documents\CommonPlugin` klasöründen okunur ve `SAGA_FILE_UPDATE` (RegisterWindowMessage) HWND_BROADCAST ile, wParam=lParam=0 gönderilir.
- PLT: 1/40 mm, `PS<sayfa boyu>,<sayfa eni>,<üst>,<sol>,4,<işaret çapı>;MD0,0,<boy-üst-alt>,<en-sol-sağ>,4;IN;PA;SP1;SP2;` + `PU x,y;PD ...;` + `PU;!PG;`. X sayfanın üstünden aşağı, Y soldan sağa; başlangıç sol üst işaretin merkezi (kenardan 10 mm). Ayarlar `C:\Users\Public\Documents\SagaCdrCam.ini`.
- Masaüstündeki "VektörPad - CutArtist" kısayolu `araclar/cutartist-gonder.ps1` betiğini çalıştırır.
