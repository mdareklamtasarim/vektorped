#!/bin/bash
# Ön Muhasebe & Stok - Oracle Cloud (Ubuntu) otomatik kurulum betiği.
# Sunucu oluşturulurken "Gelişmiş seçenekler > Yönetim > Başlatma betiği (cloud-init)" alanına
# yapıştırılır; sunucu ilk açıldığında her şeyi kendisi kurar (5-10 dakika).
# Elle de çalıştırılabilir: sudo bash oracle-kurulum.sh
# İlerleme kaydı: /var/log/muhasebe-kurulum.log

# ======================= BU BÖLÜMÜ DOLDURUN =======================
FIRMA='Firma Adı'
YONETICI_ADI='Ad Soyad'
KULLANICI='yonetici'
SIFRE='buraya-en-az-8-karakter'
DUCKDNS_ALAN=''
DUCKDNS_TOKEN=''
# ==================================================================

REPO='https://github.com/mdareklamtasarim/vektorped.git'
DAL='muhasebe-stok'

set -euo pipefail
exec > >(tee -a /var/log/muhasebe-kurulum.log) 2>&1
echo "== Muhasebe kurulumu başladı: $(date) =="
export DEBIAN_FRONTEND=noninteractive

APP_ROOT=/opt/muhasebe
APP=$APP_ROOT/muhasebe
DATA=/var/lib/muhasebe
BACKUPS=/var/backups/muhasebe
NODE=/usr/local/bin/node

if [ "${#SIFRE}" -lt 8 ]; then echo "HATA: SIFRE en az 8 karakter olmalı."; exit 1; fi

# ---- 1. Sistem paketleri ----
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get update -y
apt-get install -y git curl ca-certificates xz-utils gnupg debian-keyring debian-archive-keyring apt-transport-https cron \
  iptables iptables-persistent

# ---- 2. Node.js 22 (nodejs.org resmi paketi, sağlama toplamı kontrol edilir) ----
case "$(uname -m)" in
  aarch64|arm64) NARCH=arm64 ;;
  x86_64|amd64) NARCH=x64 ;;
  *) echo "HATA: desteklenmeyen işlemci $(uname -m)"; exit 1 ;;
esac
NODE_BASE=https://nodejs.org/dist/latest-v22.x
SUMS=$(curl -fsSL "$NODE_BASE/SHASUMS256.txt")
NODE_FILE=$(echo "$SUMS" | grep " node-v22[.0-9]*-linux-$NARCH.tar.xz\$" | awk '{print $2}')
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/$NODE_FILE" "$NODE_BASE/$NODE_FILE"
(cd "$TMP" && echo "$SUMS" | grep " $NODE_FILE\$" | sha256sum -c -)
tar -xJf "$TMP/$NODE_FILE" -C /usr/local --strip-components=1 --wildcards \
  --exclude='*/CHANGELOG.md' --exclude='*/README.md' --exclude='*/LICENSE'
rm -rf "$TMP"
echo "Node.js: $($NODE --version)"

# ---- 3. Program kodu ve kullanıcısı ----
id muhasebe >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin muhasebe
mkdir -p "$DATA" "$BACKUPS"
if [ -d "$APP_ROOT/.git" ]; then
  git -C "$APP_ROOT" fetch --depth 1 origin "$DAL"
  git -C "$APP_ROOT" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$DAL" "$REPO" "$APP_ROOT"
fi
chown -R muhasebe:muhasebe "$DATA" "$BACKUPS"
chmod 750 "$DATA" "$BACKUPS"

# ---- 4. İlk yönetici (kullanıcı zaten varsa dokunmaz) ----
runuser -u muhasebe -- env DB_FILE="$DATA/muhasebe.db" ADMIN_USER="$KULLANICI" ADMIN_NAME="$YONETICI_ADI" \
  ADMIN_PASSWORD="$SIFRE" COMPANY="$FIRMA" "$NODE" --disable-warning=ExperimentalWarning "$APP/src/cli.js" create-admin

# ---- 5. Sürekli çalışan servis ----
cat > /etc/systemd/system/muhasebe.service <<EOF
[Unit]
Description=Ön Muhasebe & Stok
After=network.target

[Service]
User=muhasebe
Group=muhasebe
WorkingDirectory=$APP
Environment=NODE_ENV=production PORT=3000 HOST=127.0.0.1 DB_FILE=$DATA/muhasebe.db COOKIE_SECURE=1 TRUST_PROXY=1
ExecStart=$NODE --disable-warning=ExperimentalWarning src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable muhasebe
systemctl restart muhasebe

# ---- 6. Adres (DuckDNS; boşsa IP tabanlı sslip.io yedeği) ----
if [ -n "$DUCKDNS_ALAN" ]; then
  ALAN="$DUCKDNS_ALAN.duckdns.org"
  cat > /usr/local/bin/duckdns-guncelle <<EOF
#!/bin/sh
# DuckDNS adresini bu sunucunun IP'sine yönlendirir.
curl -fsS -o /var/log/duckdns.log "https://www.duckdns.org/update?domains=$DUCKDNS_ALAN&token=$DUCKDNS_TOKEN&ip="
EOF
  chmod 700 /usr/local/bin/duckdns-guncelle
  /usr/local/bin/duckdns-guncelle || true
  if [ "$(cat /var/log/duckdns.log 2>/dev/null)" != "OK" ]; then
    echo "UYARI: DuckDNS güncellenemedi. Alan adı ve token'ı kontrol edin."
  fi
  echo "*/5 * * * * root /usr/local/bin/duckdns-guncelle" > /etc/cron.d/duckdns
else
  IP=$(curl -fsS https://api.ipify.org)
  ALAN="${IP//./-}.sslip.io"
  echo "UYARI: DuckDNS girilmedi, $ALAN kullanılıyor. Sertifika alınamazsa DuckDNS ile yeniden kurun."
fi

# ---- 7. Güvenlik duvarı: 80 ve 443 portlarını aç (Oracle Ubuntu imajı varsayılan olarak kapatır) ----
for p in 443 80; do
  iptables -C INPUT -p tcp --dport "$p" -m state --state NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp --dport "$p" -m state --state NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi

# ---- 8. Caddy: HTTPS sertifikasını otomatik alır ve yeniler ----
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
$ALAN {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable caddy
systemctl restart caddy

# ---- 9. Günlük yedek (03:20, son 30 gün saklanır) ----
cat > /usr/local/bin/muhasebe-yedek <<EOF
#!/bin/sh
set -e
F=$BACKUPS/muhasebe-\$(date +%Y-%m-%d-%H%M).db
runuser -u muhasebe -- env DB_FILE=$DATA/muhasebe.db $NODE --disable-warning=ExperimentalWarning $APP/src/cli.js backup "\$F"
find $BACKUPS -name 'muhasebe-*.db' -mtime +30 -delete
EOF
chmod 755 /usr/local/bin/muhasebe-yedek
echo "20 3 * * * root /usr/local/bin/muhasebe-yedek >> /var/log/muhasebe-yedek.log 2>&1" > /etc/cron.d/muhasebe-yedek

# ---- 10. Güncelleme komutu: sudo muhasebe-guncelle ----
cat > /usr/local/bin/muhasebe-guncelle <<EOF
#!/bin/sh
set -e
/usr/local/bin/muhasebe-yedek
git -C $APP_ROOT fetch --depth 1 origin $DAL
git -C $APP_ROOT reset --hard FETCH_HEAD
systemctl restart muhasebe
echo "Güncellendi."
EOF
chmod 755 /usr/local/bin/muhasebe-guncelle

# ---- Bitti ----
cat > /root/muhasebe-bilgi.txt <<EOF
Program adresi : https://$ALAN
Yönetici       : $KULLANICI  (ilk girişte Ayarlar > Şifremi değiştir yapın)
Veriler        : $DATA/muhasebe.db
Yedekler       : $BACKUPS (her gece 03:20)
Güncelleme     : sudo muhasebe-guncelle
Servis durumu  : systemctl status muhasebe caddy
EOF
echo "== Kurulum tamamlandı: $(date) =="
cat /root/muhasebe-bilgi.txt
