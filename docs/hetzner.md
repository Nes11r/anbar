# Hetzner-ə yerləşdirmə (addım-addım)

Nəticə: `https://anbar.hecotec.az` — HTTPS (avtomatik Let's Encrypt), gündəlik ehtiyat nüsxə, server yenidən başlayanda avtomatik işə düşmə, yalnız 22/80/443 portları açıq.

## 1. Server sifarişi (Hetzner Cloud Console)
- **Location:** Falkenstein / Nürnberg / Helsinki (Avropa — Bakıdan ~60–80 ms).
- **Image:** Ubuntu 24.04.
- **Type:** **CX22** (2 vCPU, 4 GB RAM, 40 GB) — kifayətdir; çox istifadəçi olarsa CX32.
- **SSH key:** öz açarınızı əlavə edin (parolla giriş əvəzinə). Windows-da açar yaratmaq: `ssh-keygen -t ed25519` → `C:\Users\<siz>\.ssh\id_ed25519.pub` məzmununu Hetzner-ə yapışdırın.
- **Backups (Hetzner):** aktiv edin (+20%) — bütün serverin həftəlik şəkli, bizim gündəlik DB dump-larına əlavə.
- Yaradılandan sonra serverin **IPv4** ünvanını qeyd edin.

## 2. DNS
Domen idarəetməsində (hecotec.az DNS) **A record**: `anbar` → `<server IPv4>`. Yayılma adətən 5–30 dəq.

## 3. Kodu serverə köçürmək
Variant A — git (tövsiyə):
```bash
ssh root@<IP>
apt-get update && apt-get install -y git
git clone <sizin-private-repo-url> /opt/hecotec
```
Variant B — birbaşa kopyalama (Windows PowerShell-dən; `node_modules`, `.next`, `.env`, Excel faylları olmadan):
```powershell
cd D:\anbar
tar --exclude=node_modules --exclude=.next --exclude=.env --exclude=test-results --exclude=*.xlsm --exclude=*.xlsx -czf ..\hecotec.tgz .
scp ..\hecotec.tgz root@<IP>:/root/
ssh root@<IP> "mkdir -p /opt/hecotec && tar -xzf /root/hecotec.tgz -C /opt/hecotec"
```

## 4. Quraşdırma (bir əmr)
```bash
ssh root@<IP>
cd /opt/hecotec && bash deploy/server-setup.sh
```
Skript soruşur: domen, sertifikat üçün e-poçt, ilk admin e-poçtu və parolu. Qalanını özü edir:
Docker, firewall (ufw), fail2ban, avtomatik təhlükəsizlik yeniləmələri, swap, təsadüfi DB parolu, build, migrasiya, baza parametrləri, admin, avtomatik start xidməti.

Yoxlama: `https://anbar.hecotec.az/api/health?deep=1` → `{"status":"ok", … "ledgerMismatches":0}`

## 5. Gündəlik idarəetmə
| Nə | Əmr (serverdə, `/opt/hecotec`) |
|---|---|
| Yeniləmə (yeni kod) | `bash deploy/update.sh` (əvvəlcə backup alır) |
| Vəziyyət | `docker compose --profile full ps` |
| Loglar | `docker compose logs --tail=200 app` |
| Əl ilə backup | `docker compose exec -T db pg_dump -U hecotec -d hecotec_wms -Fc > backups/manual.dump` |
| Bərpa | `bash deploy/restore.sh backups/<fayl>.dump` |
| Yeni admin | `docker compose --profile tools run --rm -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… tools npm run admin:create` |
| Backup-ları kompüterə endirmək | `scp root@<IP>:/opt/hecotec/backups/*.dump D:\hecotec-backups\` |

## 6. Lokal məlumatları köçürmək (istəsəniz)
Tövsiyə: production **təmiz** başlasın (demo məlumatsız) — real kataloq Excel importu və ilkin inventarlaşdırma ilə daxil edilir. Lokal bazanı köçürmək lazımdırsa:
```powershell
docker compose exec -T db pg_dump -U hecotec -d hecotec_wms -Fc > local.dump
scp local.dump root@<IP>:/opt/hecotec/backups/
ssh root@<IP> "cd /opt/hecotec && bash deploy/restore.sh backups/local.dump"
```

## Təhlükəsizlik qeydləri
- PostgreSQL yalnız server daxilində (`127.0.0.1`) — internetdən əlçatmazdır.
- `.env` faylı (DB parolu) yalnız root oxuya bilər; git-ə düşmür.
- HTTPS + HSTS; sessiya cookie-si `Secure`.
- Root SSH-ı yalnız açarla saxlayın: `/etc/ssh/sshd_config` → `PasswordAuthentication no`, sonra `systemctl restart ssh`.
