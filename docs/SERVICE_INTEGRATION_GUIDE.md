# Service Integration Guide – System Monitor

This guide describes how the Trade Show app connects to the system monitor for infrastructure metrics and business telemetry.

## Quick Start: Two Ways We Are Monitored

### 1. **Prometheus Metrics** (Infrastructure & Performance)
- The backend exposes a **`/metrics`** endpoint (unauthenticated) for Prometheus scraping.
- Metrics include: request rate, latency, error rate, and default Node.js process metrics (CPU, memory, etc.).
- Add this backend to your Prometheus scrape config to see it in the system monitor.

### 2. **Business Telemetry API** (Costs & Usage)
- The app sends events to the system monitor **Ingestion API** when external API usage occurs.
- Tracked: OCR (EasyOCR) usage, Zoho API calls, latency, and optional usage units.
- Events are sent only when `SYSTEM_MONITOR_INGESTION_URL` and `SYSTEM_MONITOR_API_KEY` are set; failures are logged and never break requests.

---

## Step 1: Prometheus Scrape (This App)

### Backend metrics endpoint
- **URL:** `http://<BACKEND_HOST>:<PORT>/metrics`
- **Port:** The backend uses **`PORT`** from the environment; if unset it defaults to **3000** (required for app login and existing proxies). For system monitor scraping, either point Prometheus at **:3000** or run the backend with **`PORT=8080`** on the scraped host and use target `:8080`.
- **Example:** `http://192.168.1.201:3000/metrics` (Trade Show Backend on default port).
- No authentication; suitable for scrape from the Prometheus server.
- **Binding:** The server listens on **`0.0.0.0`** so it is reachable from the monitoring LXC.

### Adding this service to Prometheus
Use the port the backend actually listens on (default **3000**):

```yaml
scrape_configs:
  - job_name: 'trade-show-backend'
    static_configs:
      - targets: ['192.168.1.201:3000']  # default port; app login/proxy use 3000
    metrics_path: /metrics
    scrape_interval: 15s
```

### Verify metrics locally
```bash
curl http://localhost:3000/metrics
# or
curl http://<BACKEND_IP>:<PORT>/metrics
```

You should see `http_requests_total`, `http_request_duration_seconds`, `app_build_info`, and default Node.js metrics.

---

## Step 2: Environment Variables (This Repo)

Configure the following for full integration.

| Variable | Required | Description |
|----------|----------|-------------|
| `SYSTEM_MONITOR_INGESTION_URL` | For telemetry | Base URL of the system monitor Ingestion API (e.g. `http://192.168.1.209:5001`) |
| `SYSTEM_MONITOR_API_KEY` | For telemetry | API key for the Ingestion API (from system monitor config) |
| `SYSTEM_MONITOR_SERVICE_NAME` | Optional | Service name in metrics/telemetry (default: `APP_SLUG` or `trade-show-backend`) |
| `APP_SLUG` | Optional | App identifier (e.g. `trade-show`); used as service name fallback |
| `NODE_ENV` | Optional | Environment (e.g. `production`); used in metrics and telemetry |

**Example (.env or environment):**
```bash
SYSTEM_MONITOR_INGESTION_URL=http://192.168.1.209:5001
SYSTEM_MONITOR_API_KEY=your_api_key_here
SYSTEM_MONITOR_SERVICE_NAME=trade-show-backend
APP_SLUG=trade-show
NODE_ENV=production
```

---

## Step 3: What Is Instrumented in This App

### Prometheus (backend)
- **Module:** `backend/src/services/monitoring/prometheus.ts`
- **Middleware:** All HTTP requests (except `/metrics` and PDF binary paths) are counted and timed.
- **Labels:** `method`, `status`, `service`, `environment`, `endpoint_class` (e.g. `api`, `auth`, `health`, `upload`).
- **Endpoint:** `GET /metrics` returns Prometheus text format.

### Business telemetry (backend)
- **Module:** `backend/src/services/monitoring/businessTelemetry.ts`
- **OCR (EasyOCR):** Each image `process()` and PDF `processPDF()` success or failure is reported (provider `easyocr`, endpoints `/process`, `/process-pdf`), with latency and optional metadata (e.g. line count, page count).
- **Zoho:** Every request made by `zohoIntegrationClient` (to the shared Zoho Integration Service) is reported via an axios interceptor (provider `zoho`, endpoint from request path), with status and latency.

Telemetry is fire-and-forget; errors are logged only and do not affect the application.

---

## Step 4: Verify Integration

### Check Prometheus metrics
1. **Backend metrics:**  
   `curl http://<BACKEND_HOST>:<PORT>/metrics`
2. **Prometheus targets:**  
   Check that the target for this backend is up (e.g. `http://<PROMETHEUS>:9090/targets`).
3. **Example query:**  
   `http_requests_total{service="trade-show-backend"}` (or your `SYSTEM_MONITOR_SERVICE_NAME` / `APP_SLUG`).

### Check business telemetry
1. **Ensure env is set:**  
   `SYSTEM_MONITOR_INGESTION_URL` and `SYSTEM_MONITOR_API_KEY` must be set for events to be sent.
2. **Trigger usage:**  
   Use OCR (upload receipt) and/or submit an expense to Zoho so the app sends events.
3. **Dashboard:**  
   In the system monitor (e.g. `https://booute.duckdns.org/apps/system-monitor`), check “API Costs” / “Applications” (or equivalent) for your service name.

### Test telemetry endpoint (optional)
```bash
curl -X POST http://192.168.1.209:5001/v1/telemetry/api-event \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{
    "service": "trade-show-backend",
    "environment": "production",
    "endpoint": "/test",
    "method": "GET",
    "status": 200,
    "latency_ms": 50
  }'
```

---

## Next Steps
- Add this backend’s host:port to your Prometheus config if not already there.
- Set `SYSTEM_MONITOR_INGESTION_URL` and `SYSTEM_MONITOR_API_KEY` in deployment for business telemetry.
- Use the system monitor dashboard to view metrics and API cost/usage for this app.

---

## Verification from monitoring LXC (6420)

From the monitoring LXC you can confirm this backend exposes `/metrics` (default port **3000**):

```bash
# Single check for trade-show-backend (default port 3000)
curl -s -m 5 http://192.168.1.201:3000/metrics | head -5
# Should see Prometheus output starting with # HELP or http_requests

# Or run the full port scan (includes 3000, 5000, 8000, 8080) for this IP
for port in 3000 5000 8000 8080; do
  if curl -s -m 1 http://192.168.1.201:$port/metrics 2>&1 | grep -q "^# HELP\|^http_requests"; then
    echo "✅ Port $port: HAS /metrics"
  elif curl -s -m 1 http://192.168.1.201:$port/metrics 2>&1 | grep -q "Not Found\|404"; then
    echo "❌ Port $port: Service running but NO /metrics"
  fi
done
```

### Quick-fix checklist (trade-show-backend)

- [ ] Backend is running (`ps aux | grep node` or equivalent on 192.168.1.201).
- [ ] Backend is listening on the expected port: `ss -tlnp | grep 3000` (or your `PORT`).
- [ ] Server binds to `0.0.0.0` (this app uses `app.listen(PORT, '0.0.0.0')`).
- [ ] `/metrics` returns Prometheus format: `curl -s http://192.168.1.201:3000/metrics | head -5`.
- [ ] From monitoring LXC (6420): `curl -s -m 5 http://192.168.1.201:3000/metrics` succeeds.
- [ ] Prometheus config has target `192.168.1.201:3000` (or correct host/port).
- [ ] Reload Prometheus if you changed config: `curl -X POST http://192.168.1.209:9090/-/reload`.
- [ ] Target shows UP at http://192.168.1.209:9090/targets and service appears in the dashboard.

---

## Troubleshooting: Service shows as DOWN

If the system monitor shows **trade-show-backend** as DOWN (e.g. `context deadline exceeded` or connection timeout):

1. **Port mismatch**  
   The backend defaults to port **3000** (so app login and proxies work). Point Prometheus at **192.168.1.201:3000**. If you prefer to scrape on 8080, set `PORT=8080` on the backend host and use target `:8080` (do not change the default in code—login must use 3000 where the app is behind a proxy).

2. **Backend not running**  
   On the host (e.g. 192.168.1.201), confirm the Node process is running and listening:  
   `ss -tlnp | grep 3000` or `curl -s -m 5 http://192.168.1.201:3000/health`

3. **Not bound to 0.0.0.0**  
   The app listens on `0.0.0.0` by default so it is reachable from the monitoring LXC. If you run it with a different host binding, scrapes from another host will fail.

4. **Reachability from Prometheus**  
   From the monitoring LXC (6420) or Prometheus host:  
   `curl -s -m 10 http://192.168.1.201:3000/metrics`  
   If this times out, the issue is network/firewall between the monitor and the backend host.

5. **Scrape timeout**  
   If the backend is under heavy load, increase the scrape timeout for this job in Prometheus (e.g. `scrape_timeout: 30s`).

---

## Related Docs
- **Version management:** [docs/VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md)
- **Dev Dashboard (in-app metrics/analytics):** [docs/DEV_DASHBOARD_DOCUMENTATION.md](DEV_DASHBOARD_DOCUMENTATION.md)
- **Master guide:** [docs/MASTER_GUIDE.md](MASTER_GUIDE.md)
