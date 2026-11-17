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
	srv := &http.Server{
		Addr:         "127.0.0.1:8089",
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
	}
	log.Println("[AfterShip-MIT] Live SMTP Verifier listening on http://127.0.0.1:8089")
	log.Fatal(srv.ListenAndServe())
}
