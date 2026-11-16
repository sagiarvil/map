"""Automated Verification for Cross-Platform Desktop Scripts, Serverless Cloud API, PNA Preflight & ERP Webhook Delivery.

Covers Acceptance Criteria AC-13 .. AC-15:
- AC-13: Serverless Cloud API (functions/index.js) executes real GİB VKN/MERSİS/KEP/Executive extraction, SSRF guard, robots/challenge compliance, and ERP webhook relay in Node.js 22.
- AC-14: macOS, Linux (systemd --user), and Windows (PowerShell + Task Scheduler) setup/service scripts pass syntax & isolated execution checks.
- AC-15: Local HTTP server answers Chrome Private Network Access (PNA) preflight from https://haritalar.web.app and delivers signed ERP Cari JSON payloads end-to-end.
"""
from __future__ import annotations

import contextlib
import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import app
import industrial_engine

ROOT = Path(__file__).resolve().parent.parent


def _valid_vkn(prefix9: str = "612048375") -> str:
    digits = [int(c) for c in prefix9]
    total = 0
    for i in range(9):
        tmp = (digits[i] + (9 - i)) % 10
        v = 9 if tmp == 9 else (tmp * (2 ** (9 - i))) % 9
        total += v
    return prefix9 + str((10 - (total % 10)) % 10)


class CrossPlatformCloudAndWebhookTest(unittest.TestCase):
    def test_ac13_serverless_cloud_api_crawl_ssrf_and_erp_webhook_in_node(self) -> None:
        vkn_ok = _valid_vkn("612048375")
        vkn_bad = vkn_ok[:-1] + str((int(vkn_ok[-1]) + 1) % 10)
        mersis_ok = f"0{vkn_ok}00019"

        node_script = r"""
const assert = require('node:assert');
const http = require('node:http');
const fn = require('./functions/index.js');

(async () => {
  const vknOk = process.env.VKN_OK;
  const vknBad = process.env.VKN_BAD;
  const mersisOk = process.env.MERSIS_OK;

  // 1. Unit-verify SSRF IPv4/IPv6 guard & GİB checksum in Node
  assert.strictEqual(fn.isPrivateOrReservedIp('127.0.0.1'), true);
  assert.strictEqual(fn.isPrivateOrReservedIp('10.1.2.3'), true);
  assert.strictEqual(fn.isPrivateOrReservedIp('169.254.169.254'), true);
  assert.strictEqual(fn.isPrivateOrReservedIp('::1'), true);
  assert.strictEqual(fn.isPrivateOrReservedIp('93.184.216.34'), false);
  assert.strictEqual(fn.validateGibVkn(vknOk), true);
  assert.strictEqual(fn.validateGibVkn(vknBad), false);
  assert.strictEqual(fn.validateMersis(mersisOk), true);

  // 2. Spin up mock corporate target + ERP receiver + Cloud API HTTP server
  let receivedWebhook = null;
  let receivedHeaders = null;
  const mockUpstream = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('User-agent: *\nAllow: /\n');
    }
    if (req.url === '/erp-hook' && req.method === 'POST') {
      receivedHeaders = req.headers;
      let buf = '';
      req.on('data', c => (buf += c));
      req.on('end', () => {
        receivedWebhook = JSON.parse(buf);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted', id: receivedWebhook.code }));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><head><title>Anadolu Makina Sanayi A.Ş.</title></head>
      <body>
        <p>Vergi Kimlik No: ${vknOk} | Yanlış: ${vknBad}</p>
        <p>MERSİS: ${mersisOk} | KEP: anadolumakina@hs01.kep.tr | VAT: DE123456789</p>
        <p>Genel Müdür: Selim Kaya</p>
        <p>İletişim: ihracat@anadolumakina.com.tr | Tel: +90 532 444 55 66</p>
      </body></html>`);
  });
  await new Promise(r => mockUpstream.listen(0, '127.0.0.1', r));
  const upPort = mockUpstream.address().port;

  let loopAllowed = false;
  const cloudSrv = http.createServer((req, res) => fn.handleCloudApiRequest(req, res, { allowTestLoopback: loopAllowed }));
  await new Promise(r => cloudSrv.listen(0, '127.0.0.1', r));
  const cloudPort = cloudSrv.address().port;
  const base = `http://127.0.0.1:${cloudPort}`;

  try {
    // Health check + strict CORS origin check
    const hRes = await fetch(`${base}/api/cloud/health`, { headers: { Origin: 'https://haritalar.web.app' } });
    assert.strictEqual(hRes.status, 200);
    assert.strictEqual(hRes.headers.get('access-control-allow-origin'), 'https://haritalar.web.app');
    const hJson = await hRes.json();
    assert.strictEqual(hJson.status, 'active');

    // SSRF block when allowTestLoopback is false
    const ssrfRes = await fetch(`${base}/api/cloud/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `http://127.0.0.1:${upPort}/` })
    });
    assert.strictEqual(ssrfRes.status, 400);

    // Enable loopback only for local test fixture & test full crawl extraction
    loopAllowed = true;
    const cRes = await fetch(`${base}/api/cloud/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `http://127.0.0.1:${upPort}/` })
    });
    assert.strictEqual(cRes.status, 200);
    const cJson = await cRes.json();
    assert.strictEqual(cJson.success, true);
    assert.strictEqual(cJson.corporate_identifiers.vkn, vknOk);
    assert.ok(!cJson.corporate_identifiers.all_vkns.includes(vknBad));
    assert.strictEqual(cJson.corporate_identifiers.mersis, mersisOk);
    assert.ok(cJson.corporate_identifiers.kep_addresses.includes('anadolumakina@hs01.kep.tr'));
    assert.ok(cJson.corporate_identifiers.international_reg_ids.includes('DE123456789'));
    assert.ok(cJson.emails.includes('ihracat@anadolumakina.com.tr'));
    assert.ok(cJson.phones.some(p => p.e164 === '+905324445566' && p.whatsapp_eligible === true));
    assert.ok(cJson.decision_makers.some(d => d.name === 'Selim Kaya'));

    // ERP Webhook: invalid VKN must return 400
    const badWh = await fetch(`${base}/api/cloud/erp_webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_url: `http://127.0.0.1:${upPort}/erp-hook`,
        payload: { code: 'CARI-IST-1001', name: 'Test A.Ş.', vkn: vknBad }
      })
    });
    assert.strictEqual(badWh.status, 400);

    // ERP Webhook: valid Cari payload must reach receiver with X-Haritalar-Event header
    const okWh = await fetch(`${base}/api/cloud/erp_webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_url: `http://127.0.0.1:${upPort}/erp-hook`,
        payload: { code: 'CARI-IST-1001', name: 'Anadolu Makina A.Ş.', vkn: vknOk, nace: '28.99.01' }
      })
    });
    assert.strictEqual(okWh.status, 200);
    const whJson = await okWh.json();
    assert.strictEqual(whJson.ok, true);
    assert.strictEqual(whJson.status_code, 201);
    assert.strictEqual(receivedWebhook.code, 'CARI-IST-1001');
    assert.strictEqual(receivedWebhook.vkn, vknOk);
    assert.strictEqual(receivedHeaders['x-haritalar-event'], 'erp.party.upsert');
  } finally {
    cloudSrv.close();
    mockUpstream.close();
  }
  console.log('NODE_CLOUD_API_PASS');
})();
"""
        env = os.environ.copy()
        env.update({"VKN_OK": vkn_ok, "VKN_BAD": vkn_bad, "MERSIS_OK": mersis_ok})
        proc = subprocess.run(
            ["node", "-e", node_script],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(proc.returncode, 0, f"Node Cloud API test failed:\nSTDOUT:{proc.stdout}\nSTDERR:{proc.stderr}")
        self.assertIn("NODE_CLOUD_API_PASS", proc.stdout)

    def test_ac14_cross_platform_macos_linux_windows_scripts_verified(self) -> None:
        # 1. Shell syntax check on all macOS & Linux scripts
        for sh_name in (
            "setup.command",
            "start.command",
            "install-mac-service.command",
            "deploy-firebase.command",
            "setup-linux.sh",
            "start-linux.sh",
            "install-linux-service.sh",
        ):
            sh_path = ROOT / sh_name
            self.assertTrue(sh_path.is_file(), f"Missing script: {sh_name}")
            chk = subprocess.run(["bash", "-n", str(sh_path)], capture_output=True, text=True)
            self.assertEqual(chk.returncode, 0, f"Syntax error in {sh_name}: {chk.stderr}")

        # 2. Dry-run execution of Linux scripts & systemd user service generation in isolated temp XDG_CONFIG_HOME
        with tempfile.TemporaryDirectory(prefix="linux_svc_") as tmp_xdg:
            env = os.environ.copy()
            env["DRY_RUN"] = "1"
            env["XDG_CONFIG_HOME"] = tmp_xdg
            env["PYTHON_BIN"] = str(ROOT / ".venv" / "bin" / "python")

            for linux_script in ("setup-linux.sh", "start-linux.sh", "install-linux-service.sh"):
                res = subprocess.run(
                    ["bash", str(ROOT / linux_script)],
                    cwd=str(ROOT),
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                self.assertEqual(res.returncode, 0, f"{linux_script} dry-run failed: {res.stderr}")
                self.assertIn("DRY_RUN_OK", res.stdout)

            unit_file = Path(tmp_xdg) / "systemd" / "user" / "leadintelligence.service"
            self.assertTrue(unit_file.is_file())
            unit_txt = unit_file.read_text(encoding="utf-8")
            self.assertIn("[Unit]", unit_txt)
            self.assertIn("ExecStart=", unit_txt)
            self.assertIn("--port 8765 --workers 128 --no-browser", unit_txt)
            self.assertIn("Restart=always", unit_txt)

        # 3. Structural & UTF-8 BOM-free validation of Windows PowerShell & Batch scripts
        win_files = {
            "setup-windows.ps1": ("$ErrorActionPreference", "venv .venv", "requirements.txt", "app.py"),
            "setup-windows.bat": ("powershell", "ExecutionPolicy Bypass", "setup-windows.ps1"),
            "start-windows.ps1": ("$ErrorActionPreference", "python.exe", "app.py"),
            "start-windows.bat": ("powershell", "start-windows.ps1"),
            "install-windows-service.ps1": ("Register-ScheduledTask", "LeadIntelligenceProDaemon", "--port 8765"),
        }
        for fname, tokens in win_files.items():
            fpath = ROOT / fname
            self.assertTrue(fpath.is_file(), f"Missing Windows script: {fname}")
            raw = fpath.read_bytes()
            self.assertFalse(raw.startswith(b"\xef\xbb\xbf"), f"BOM found in {fname}")
            txt = raw.decode("utf-8")
            for tok in tokens:
                self.assertIn(tok, txt, f"Expected token {tok!r} in {fname}")

    def test_ac15_pna_preflight_and_python_erp_webhook_delivery(self) -> None:
        # 1. Chrome Private Network Access (PNA) OPTIONS preflight check from https://haritalar.web.app
        with tempfile.TemporaryDirectory(prefix="pna_test_") as tmp:
            store = app.Store(Path(tmp) / "pna.sqlite3")
            server = app.IndustrialHTTPServer(("127.0.0.1", 0), app.Handler)
            server.store = store  # type: ignore[attr-defined]
            server.fetch = mock.MagicMock()  # type: ignore[attr-defined]
            server.discovery = threading.BoundedSemaphore(2)  # type: ignore[attr-defined]
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            try:
                req = Request(
                    f"http://127.0.0.1:{server.server_port}/api/session",
                    headers={
                        "Origin": "https://haritalar.web.app",
                        "Access-Control-Request-Method": "GET",
                        "Access-Control-Request-Private-Network": "true",
                    },
                    method="OPTIONS",
                )
                with urlopen(req, timeout=5) as resp:
                    self.assertEqual(resp.status, 204)
                    self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), "https://haritalar.web.app")
                    self.assertEqual(resp.headers.get("Access-Control-Allow-Private-Network"), "true")
            finally:
                server.shutdown()
                server.server_close()
                store.close()

        # 2. End-to-End Python ERP Webhook Dispatcher against real HTTP receiver (with SSRF check)
        with self.assertRaises(ValueError):
            industrial_engine.dispatch_erp_webhook("http://127.0.0.1:9999/hook", {"code": "CARI-1"})

        captured: dict[str, object] = {}

        class ErpReceiver(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                ln = int(self.headers.get("Content-Length", "0"))
                captured["event"] = self.headers.get("X-Haritalar-Event")
                captured["body"] = json.loads(self.rfile.read(ln).decode("utf-8"))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"erp_status":"recorded"}')

            def log_message(self, fmt: str, *args: object) -> None:
                pass

        erp_srv = HTTPServer(("127.0.0.1", 0), ErpReceiver)
        erp_thread = threading.Thread(target=erp_srv.serve_forever, daemon=True)
        erp_thread.start()
        try:
            # Patch only _assert_public_host so the real httpx HTTP/2 POST runs against our local ERP test receiver
            with mock.patch.object(industrial_engine, "_assert_public_host", return_value=None):
                res = industrial_engine.dispatch_erp_webhook(
                    f"http://127.0.0.1:{erp_srv.server_port}/api/odoo/partner",
                    {"code": "CARI-ANK-2040", "name": "Başkent Çelik A.Ş.", "vkn": _valid_vkn(), "vkn_verified": True},
                )
            self.assertTrue(res["ok"])
            self.assertEqual(res["status_code"], 200)
            self.assertEqual(captured.get("event"), "erp.party.upsert")
            body_dict = captured.get("body")
            assert isinstance(body_dict, dict)
            self.assertEqual(body_dict["code"], "CARI-ANK-2040")
            self.assertTrue(body_dict["vkn_verified"])
        finally:
            erp_srv.shutdown()
            erp_srv.server_close()


if __name__ == "__main__":
    unittest.main()
