#!/bin/bash
# ==============================================================================
# Oracle Cloud Free Tier — AfterShip Live SMTP Verifier Auto-Installer
# ==============================================================================
# Usage:
#   curl -sSL <raw-url> | bash
#   veya dosyayı sunucuya atıp: sudo bash setup_oracle_free_tier.sh
# ==============================================================================
set -euo pipefail

echo "[1/5] Sistem paketleri ve Go ortamı kuruluyor..."
sudo apt-get update -y
sudo apt-get install -y golang-go git ufw

APP_DIR="/opt/aftership_verifier"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"
cd "$APP_DIR"

echo "[2/5] Go kaynak kodu ve bağımlılıklar hazırlanıyor..."
cat << 'EOF' > main.go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	emailverifier "github.com/AfterShip/email-verifier"
)

func initVerifier() *emailverifier.Verifier {
	v := emailverifier.NewVerifier().
		EnableAutoUpdateDisposable().
		ConnectTimeout(4 * time.Second).
		OperationTimeout(6 * time.Second)

	if proxy := os.Getenv("APEX_SMTP_PROXY"); proxy != "" {
		v.Proxy(proxy)
	}

	if os.Getenv("DISABLE_SMTP_CHECK") != "1" {
		v.EnableSMTPCheck().
			EnableCatchAllCheck()
	}
	return v
}

var verifier = initVerifier()

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/verify", func(w http.ResponseWriter, r *http.Request) {
		email := r.URL.Query().Get("email")
		w.Header().Set("Content-Type", "application/json")
		ret, err := verifier.Verify(email)
		if ret != nil {
			_ = json.NewEncoder(w).Encode(ret)
			return
		}
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(ret)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8089"
	}
	addr := "0.0.0.0:" + port

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
	}
	log.Printf("[AfterShip-MIT] Live SMTP Verifier listening on http://%s\n", addr)
	log.Fatal(srv.ListenAndServe())
}
EOF

if [ ! -f go.mod ]; then
    go mod init aftership_verifier
fi
go get github.com/AfterShip/email-verifier
go build -o aftership_verifier main.go

echo "[3/5] Systemd arka plan servisi yapılandırılıyor..."
sudo tee /etc/systemd/system/aftership-verifier.service > /dev/null << EOF
[Unit]
Description=AfterShip Live SMTP Email Verifier Sidecar
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/aftership_verifier
Restart=always
RestartSec=3
Environment=PORT=8089

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now aftership-verifier

echo "[4/5] Güvenlik duvarı (UFW) portu açılıyor..."
sudo ufw allow 8089/tcp || true

echo "[5/5] Doğrulama testi yapılıyor..."
sleep 2
curl -s "http://127.0.0.1:8089/v1/verify?email=info@google.com" | grep -q "google.com" && echo "BAŞARILI: Servis çalışıyor!" || echo "UYARI: Servis başlatılamadı."

PUBLIC_IP=$(curl -s ifconfig.me || echo "SUNUCU_IP")
echo ""
echo "=============================================================================="
echo "KURULUM TAMAMLANDI!"
echo "Oracle Cloud Güvenlik Listesi'nde (Security List) 8089 Ingress portunu açın."
echo ""
echo "Mac'inizde çalıştırmak için:"
echo "export APEX_AFTERSHIP_URL=\"http://$PUBLIC_IP:8089\""
echo "APEX_LIVE_VERIFY=1 python3 app.py"
echo "=============================================================================="
