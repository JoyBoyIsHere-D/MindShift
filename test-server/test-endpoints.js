const http = require('http');
const assert = require('assert');

// Start server on a test port
process.env.PORT = '3099';
require('./server.js');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing MindShift Backend Endpoints ---');

  // Wait 500ms for server to bind
  await new Promise((r) => setTimeout(r, 500));

  // 1. Health check
  console.log('\n[TEST 1] GET /health');
  const healthRes = await request({
    hostname: '127.0.0.1',
    port: 3099,
    path: '/health',
    method: 'GET',
  });
  assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
  const healthJson = JSON.parse(healthRes.body);
  assert.strictEqual(healthJson.status, 'ok');
  console.log('✓ /health PASSED:', healthJson);

  // 2. Sync Ingestion
  console.log('\n[TEST 2] POST /api/telemetry/sync');
  const samplePayload = {
    events: [
      {
        packageName: 'com.instagram.android',
        eventType: 'ACTIVITY_RESUMED',
        timestamp: 1728654321000,
        duration: 0,
        recordedAt: 1728654325000,
      },
      {
        packageName: 'com.google.android.youtube',
        eventType: 'ACTIVITY_RESUMED',
        timestamp: 1728654330000,
        duration: 0,
        recordedAt: 1728654335000,
      },
    ],
    interventionLogs: [
      {
        packageName: 'com.instagram.android',
        timestamp: 1728654322000,
        interventionStage: 2,
        mindlessnessScore: 0.68,
        userAction: 'COMPLIED_CLOSED_APP',
      },
      {
        packageName: 'com.google.android.youtube',
        timestamp: 1728654331000,
        interventionStage: 3,
        mindlessnessScore: 0.85,
        userAction: 'OVERRIDDEN',
      },
    ],
  };

  const syncRes = await request(
    {
      hostname: '127.0.0.1',
      port: 3099,
      path: '/api/telemetry/sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    samplePayload
  );

  assert.strictEqual(syncRes.status, 200, 'Sync should return 200');
  const syncJson = JSON.parse(syncRes.body);
  assert.strictEqual(syncJson.success, true);
  assert.strictEqual(syncJson.eventCount, 2);
  assert.strictEqual(syncJson.interventionCount, 2);
  console.log('✓ POST /api/telemetry/sync PASSED:', syncJson);

  // 3. Raw Logs Retrieval
  console.log('\n[TEST 3] GET /api/telemetry/logs');
  const logsRes = await request({
    hostname: '127.0.0.1',
    port: 3099,
    path: '/api/telemetry/logs',
    method: 'GET',
  });
  assert.strictEqual(logsRes.status, 200);
  const logsJson = JSON.parse(logsRes.body);
  assert(Array.isArray(logsJson), 'Logs should be an array');
  assert(logsJson.length >= 1, 'Should contain at least 1 batch');
  console.log(`✓ GET /api/telemetry/logs PASSED: Found ${logsJson.length} batch(es)`);

  // 4. CSV Export
  console.log('\n[TEST 4] GET /api/telemetry/export-csv');
  const csvRes = await request({
    hostname: '127.0.0.1',
    port: 3099,
    path: '/api/telemetry/export-csv',
    method: 'GET',
  });
  assert.strictEqual(csvRes.status, 200);
  assert(csvRes.headers['content-type'].includes('text/csv'), 'Content type must be text/csv');
  const csvLines = csvRes.body.trim().split('\n');
  console.log(`✓ GET /api/telemetry/export-csv PASSED: Received ${csvLines.length} lines`);
  console.log('  Header:', csvLines[0]);
  console.log('  Row 1: ', csvLines[1]);
  console.log('  Row 2: ', csvLines[2]);

  assert.strictEqual(
    csvLines[0],
    'timestamp,datetime_iso,record_type,package_name,event_or_stage,duration_ms,mindlessness_score,user_action'
  );
  assert(csvLines.length >= 5, 'Should have header + at least 4 rows');

  console.log('\n=============================================');
  console.log('🎉 ALL BACKEND ENDPOINT TESTS PASSED CLEANLY!');
  console.log('=============================================\n');

  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

