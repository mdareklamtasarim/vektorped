# Ön Muhasebe & Stok

Küçük işletmeler için çok kullanıcılı, Türkçe ön muhasebe ve stok takip programı.
Tarayıcıdan (bilgisayar, iPad, telefon) kullanılır; veriler sunucudaki tek bir SQLite dosyasında tutulur.

## Neler var?

| Bölüm | İçerik |
| --- | --- |
| **Stok** | Ürün kartları (kod, barkod, birim, alış/satış fiyatı, KDV, kritik seviye), stok giriş/çıkış, sayım, hareket geçmişi, ağırlıklı ortalama maliyet |
| **Cariler** | Müşteri/tedarikçi kartları, açılış bakiyesi, anlık borç/alacak bakiyesi, tarih aralıklı cari ekstre (yazdır / CSV) |
| **Faturalar** | Satış, alış, satış iade, alış iade; satır bazında iskonto ve KDV; otomatik numara; stoktan otomatik düşme/ekleme; peşin ödeme; düzenleme, iptal; yazdırma / PDF |
| **Kasa & Banka** | Kasa ve banka hesapları, tahsilat, ödeme, gelir, gider (kategorili), virman, hesap ekstresi |
| **Raporlar** | Dönem özeti (net satış, maliyet, brüt kâr, faaliyet sonucu), KDV özeti, ürün kârlılığı, stok değeri, cari bakiyeler, gelir/gider kategorileri, aylık tablo; hepsi CSV ve yazdırma |
| **Ayarlar** | Firma bilgileri, fatura ön ekleri, kullanıcılar ve yetkiler, veritabanı yedeği, işlem geçmişi |

**Yetkiler:** *Yönetici* her şeyi yapar (kullanıcı, ayar, yedek, kalıcı silme). *Kullanıcı* kayıt girer ve düzenler,
kalıcı silemez. *Sadece görüntüleme* (örneğin mali müşavir) her şeyi görür, değiştiremez.

> **Önemli:** Program ön muhasebe kaydı tutar. Kestiği faturalar **e-Fatura / e-Arşiv yerine geçmez**;
> resmi belge için GİB'e bağlı bir e-belge hizmeti kullanılmalıdır. KDV ve kâr raporları bilgi amaçlıdır.

## Çalıştırma

Gereken tek şey **Node.js 22.13 veya üzeri** (ek paket kurulmaz).

```bash
cd muhasebe
npm start
```

Tarayıcıda `http://localhost:3000` adresini açın. İlk açılışta firma adı ve yönetici hesabı oluşturulur.

### Ayarlar (ortam değişkenleri)

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | `3000` | Dinlenecek port |
| `HOST` | `0.0.0.0` | Dinlenecek adres |
| `DB_FILE` | `muhasebe/data/muhasebe.db` | Veritabanı dosyası |
| `COOKIE_SECURE` | – | HTTPS arkasında `1` yapın (oturum çerezi yalnızca HTTPS ile gönderilir) |
| `TRUST_PROXY` | – | Nginx/Caddy gibi bir ters vekil arkasında `1` yapın (gerçek IP ve host bilgisi için) |
| `BACKUP_DIR` | – | Verilirse program her gün bu klasöre yedek alır, son 30 günü saklar |

### Dükkân bilgisayarına kurulum (Windows) ve telefondan çevrimdışı kullanım

1. Bilgisayara [Node.js](https://nodejs.org/) LTS ve [Tailscale](https://tailscale.com/download) kurun, Tailscale'e giriş yapın.
2. Programı indirip açın, `muhasebe` klasörünü kalıcı bir yere (örn. Belgeler) taşıyın.
3. `muhasebe\windows\KUR.bat` dosyasına çift tıklayın. Bu dosya:
   - programı başlatır ve Windows açılınca kendiliğinden başlatılmasını ayarlar,
   - her gün `yedekler\` klasörüne yedek alınmasını sağlar (son 30 gün),
   - Tailscale ile `https://bilgisayar-adi.xxxx.ts.net` adresini açar (ilk seferde bir onay bağlantısı çıkabilir).
4. Telefona Tailscale'i kurup aynı hesapla girin, bu adresi açın ve **Ana ekrana ekle** deyin.

Telefonda bağlantı yokken program son görülen bilgilerle açılır; eklenen fatura, cari, ürün, tahsilat ve
giderler telefonda saklanır ve bilgisayara ulaşılınca sırayla gönderilir. Üstteki rozet bekleyen değişiklik
sayısını gösterir; dokununca liste açılır. Aynı değişiklik iki kez gönderilse bile sunucu bir kez kaydeder.

Diğer dosyalar: `GUNCELLE.bat` yeni sürümü indirip kurar (veriye dokunmaz), `DURDUR.bat` programı durdurur.

### Docker ile

```bash
cd muhasebe
docker build -t muhasebe .
docker run -d --name muhasebe -p 3000:3000 -v muhasebe-veri:/app/data --restart unless-stopped muhasebe
```

### Oracle Cloud'a ücretsiz kurulum

`deploy/oracle-kurulum.sh` betiği Oracle'ın ücretsiz Ubuntu sunucusuna her şeyi kurar: Node.js, program,
sürekli çalışan servis, DuckDNS adresi, Caddy ile otomatik HTTPS, güvenlik duvarı, gecelik yedek ve
`sudo muhasebe-guncelle` güncelleme komutu. Betiğin en üstündeki bilgileri doldurup sunucu oluştururken
*cloud-init* alanına yapıştırmanız yeterli. Sunucuda elle çalıştırmak için: `sudo bash oracle-kurulum.sh`.

Yönetim komutları (`src/cli.js`):

```bash
ADMIN_USER=ali ADMIN_NAME="Ali Veli" ADMIN_PASSWORD=... COMPANY="Firma" node src/cli.js create-admin
node src/cli.js backup /yedekler/muhasebe.db
```

### İnternete açarken

Birden fazla kişi farklı yerlerden kullanacaksa programı bir sunucuya (VPS) kurun ve önüne HTTPS sağlayan bir
ters vekil koyun. Örnek Caddy ayarı (sertifikayı kendisi alır):

```
muhasebe.firmaniz.com {
    reverse_proxy localhost:3000
}
```

Bu durumda programı `COOKIE_SECURE=1 TRUST_PROXY=1 npm start` ile başlatın.

## Yedekleme

- **Ayarlar → Yedeği indir** tüm verilerin tutarlı bir kopyasını tek dosya olarak indirir.
- Sunucuda otomatik yedek için `data/` klasörünü düzenli kopyalayabilirsiniz (ör. günlük cron ile
  `sqlite3 data/muhasebe.db ".backup yedek.db"`).
- Geri yüklemek için programı durdurup yedek dosyayı `DB_FILE` yoluna koyun ve yeniden başlatın.

## Hesaplama kuralları

- Tutarlar veritabanında kuruş cinsinden tam sayı olarak saklanır; yuvarlama satır bazında yapılır.
- Fiyatlar KDV hariç girilir. Satır: `tutar = miktar × birim fiyat − iskonto`, `KDV = tutar × oran`.
- **Cari bakiye:** artı değer carinin bize borcu, eksi değer bizim cariye borcumuzdur.
  Satış faturası ve yaptığımız ödeme borç; alış faturası ve aldığımız tahsilat alacak yazar.
- **Maliyet:** alış faturalarından ve maliyetli stok girişlerinden hesaplanan ağırlıklı ortalama;
  alış yoksa ürün kartındaki alış fiyatı kullanılır.
- **Fatura iptali** kaydı ve numarasını korur, stok/cari etkisini ve faturayla girilen ödemeyi geri alır.

## Deneme sürümü (sunucusuz)

`demo/` klasörü programın tarayıcıda tek başına çalışan bir deneme sürümünü üretir: sunucu kodu (`src/`)
olduğu gibi sayfanın içinde, SQLite'ın JavaScript sürümü sql.js üzerinde çalışır ve örnek verilerle başlar.
Veriler sadece o tarayıcıda tutulur; senkronizasyon ve yedek yoktur.

```bash
npm i --no-save sql.js@1.10.3
npm run demo          # demo-dist/ klasörüne yazar
```

## Geliştirme

```bash
npm test     # API uçtan uca testleri (geçici bellek içi veritabanıyla)
```

Yapı:

```
src/server.js        HTTP sunucusu, statik dosyalar, yetki kontrolü
src/db.js            Şema ve göçler (SQLite, node:sqlite)
src/api/*.js         Uç noktalar: admin, stock, parties, invoices, finance, reports
public/              Web arayüzü (derleme gerektirmeyen ES modülleri)
test/                Testler
```
