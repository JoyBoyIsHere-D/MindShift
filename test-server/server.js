/**
 * MindShift Research Prototype - Mock Cloud Sync Server with CSV Export
 *
 * Run with: node test-server/server.js
 * Default port: 3000
 *
 * Endpoints:
 * - GET  /health                      -> Server status check
 * - POST /api/telemetry/sync          -> Batch ingestion for telemetry events & intervention logs
 * - GET  /api/telemetry/export-csv    -> Download merged dataset as CSV for scikit-learn / pandas ML models
 * - GET  /api/telemetry/logs          -> View raw persisted JSON data
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
    res.end(JSON.stringify({ status: 'ok', server: 'MindShift BTP Mock Cloud (Phase 2)' }));
    return;
  }

  // Raw logs endpoint
  if (req.method === 'GET' && req.url === '/api/telemetry/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (fs.existsSync(LOGS_FILE)) {
      res.end(fs.readFileSync(LOGS_FILE, 'utf8'));
    } else {
      res.end(JSON.stringify({ batches: [] }));
    }
    return;
  }

  // CSV Export endpoint for scikit-learn training
  if (req.method === 'GET' && req.url === '/api/telemetry/export-csv') {
    try {
      let batches = [];
      if (fs.existsSync(LOGS_FILE)) {
        try {
          batches = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        } catch (_) {
          batches = [];
        }
      }

      // Build CSV Header
      const csvHeader = [
        'timestamp',
        'datetime_iso',
        'record_type',
        'package_name',
        'event_or_stage',
        'duration_ms',
        'mindlessness_score',
        'user_action'
      ].join(',');

      const rows = [csvHeader];

      batches.forEach(batch => {
        // Telemetry events
        if (Array.isArray(batch.events)) {
          batch.events.forEach(ev => {
            const iso = new Date(ev.timestamp).toISOString();
            rows.push([
              ev.timestamp,
              iso,
              'USAGE_EVENT',
              `"${ev.packageName || ''}"`,
              ev.eventType || '',
              ev.duration || 0,
              'N/A',
              'N/A'
            ].join(','));
          });
        }

        // Intervention logs
        if (Array.isArray(batch.interventionLogs)) {
          batch.interventionLogs.forEach(log => {
            const iso = new Date(log.timestamp).toISOString();
            rows.push([
              log.timestamp,
              iso,
              'INTERVENTION_LOG',
              `"${log.packageName || ''}"`,
              `STAGE_${log.interventionStage || 0}`,
              0,
              (log.mindlessnessScore != null ? log.mindlessnessScore.toFixed(4) : '0.0000'),
              `"${log.userAction || ''}"`
            ].join(','));
          });
        }
      });

      const csvContent = rows.join('\n');

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mindshift_training_dataset.csv"'
      });
      res.end(csvContent);
      console.log(`\n📊 CSV Exported: ${rows.length - 1} records delivered for ML training.`);
      return;
    } catch (err) {
      console.error('Error generating CSV export:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate CSV export', message: err.message }));
      return;
    }
  }

  // Telemetry & Intervention sync endpoint
  if (req.method === 'POST' && req.url === '/api/telemetry/sync') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const events = payload.events || [];
        const logs = payload.interventionLogs || [];
        const timestamp = new Date().toISOString();

        console.log(`\n======================================================`);
        console.log(`[${timestamp}] 📥 BATCH RECEIVED`);
        console.log(` • Usage Events: ${events.length}`);
        console.log(` • Intervention Logs: ${logs.length}`);
        console.log(`======================================================`);

        events.forEach((ev, idx) => {
          const dateStr = new Date(ev.timestamp).toLocaleTimeString();
          console.log(`  [Event #${idx + 1}] ${ev.eventType} | ${ev.packageName} | ${dateStr}`);
        });

        logs.forEach((lg, idx) => {
          const dateStr = new Date(lg.timestamp).toLocaleTimeString();
          console.log(`  [Intervention #${idx + 1}] STAGE ${lg.interventionStage} | Score: ${(lg.mindlessnessScore || 0).toFixed(2)} | Action: ${lg.userAction} | ${lg.packageName}`);
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
          eventCount: events.length,
          interventionCount: logs.length,
          events: events,
          interventionLogs: logs,
        });
        fs.writeFileSync(LOGS_FILE, JSON.stringify(existingLogs, null, 2), 'utf8');

        // Respond with HTTP 200 OK so SyncModule marks them as synced
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Successfully received and persisted ${events.length} events and ${logs.length} intervention logs.`,
          eventCount: events.length,
          interventionCount: logs.length,
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
  console.log(`\n🚀 MindShift Telemetry & Intervention Test Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   CSV Export:   http://localhost:${PORT}/api/telemetry/export-csv`);
});
