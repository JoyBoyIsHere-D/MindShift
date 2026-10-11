/**
 * MindShift Research Prototype - Mock Cloud Sync Server
 *
 * Run with: node test-server/server.js
 * Default port: 3000
 *
 * For Android Emulator: Access via http://10.0.2.2:3000/api/telemetry/sync
 * For Physical Device: Access via http://<YOUR_LOCAL_IP>:3000/api/telemetry/sync
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const LOGS_FILE = path.join(__dirname, 'received_telemetry.json');

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'MindShift BTP Mock Cloud' }));
    return;
  }

  // Telemetry sync endpoint
  if (req.method === 'POST' && req.url === '/api/telemetry/sync') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const events = payload.events || [];
        const timestamp = new Date().toISOString();

        console.log(`\n======================================================`);
        console.log(`[${timestamp}] 📥 BATCH RECEIVED: ${events.length} events`);
        console.log(`======================================================`);

        events.forEach((ev, idx) => {
          const dateStr = new Date(ev.timestamp).toLocaleTimeString();
          console.log(`  [#${idx + 1}] ${ev.eventType} | ${ev.packageName} | ${dateStr} (raw: ${ev.timestamp})`);
        });

        // Append to local log file
        let existingLogs = [];
        if (fs.existsSync(LOGS_FILE)) {
          try {
            existingLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
          } catch (_) {
            existingLogs = [];
          }
        }
        existingLogs.push({
          receivedAt: timestamp,
          batchCount: events.length,
          events: events,
        });
        fs.writeFileSync(LOGS_FILE, JSON.stringify(existingLogs, null, 2), 'utf8');

        // Respond with HTTP 200 OK so SyncModule marks them as synced
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Successfully received and persisted ${events.length} telemetry events.`,
          batchCount: events.length,
          timestamp: timestamp,
        }));
      } catch (err) {
        console.error('Failed to parse incoming sync JSON:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // Fallback
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 MindShift Telemetry Test Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Sync Endpoint: http://localhost:${PORT}/api/telemetry/sync`);
  console.log(`   -> Android Emulator URL: http://10.0.2.2:${PORT}/api/telemetry/sync`);
  console.log(`   Logs stored in: ${LOGS_FILE}\n`);
});

