'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuiskilat-online-test-'));
process.env.DATA_FILE = path.join(dir, 'rooms.json');
process.env.HOST_ACCESS_CODE = 'KodeUji-9281';
const { server } = require('../server');
let base;
async function post(action, body) {
  const response = await fetch(`${base}/api/${action}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, ...(await response.json()) };
}
async function run() {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.version, '3.0');
    const config = await (await fetch(base + '/api/config')).json();
    assert.equal(config.hostCodeRequired, true);

    const quiz = { title: 'Tes daring KuisKilat', questions: [
      { text: 'Berapa jumlah 7 dan 3?', options: ['9','10','11','12'], correct: 1, seconds: 10 }
    ] };
    assert.equal((await post('create', quiz)).ok, false, 'kode guru wajib');
    assert.equal((await post('create', { ...quiz, hostCode: 'salah' })).ok, false);
    const host = await post('create', { ...quiz, hostCode: process.env.HOST_ACCESS_CODE });
    assert.equal(host.ok, true);
    const player = await post('join', { pin: host.pin, nickname: '=HYPERLINK("http://example.com")' });
    assert.equal(player.ok, true);
    const hs = { pin: host.pin, role: 'host', token: host.token };
    const ps = { pin: host.pin, role: 'player', token: player.token };

    const unauthorized = await fetch(`${base}/api/report?pin=${host.pin}&token=${player.token}`);
    assert.equal(unauthorized.status, 401, 'laporan hanya untuk guru');
    assert.equal((await post('start', hs)).ok, true);
    assert.equal((await post('answer', { ...ps, index: 1 })).ok, true);
    assert.equal((await post('next', hs)).ok, true);
    const report = await fetch(`${base}/api/report?pin=${host.pin}&token=${host.token}`);
    assert.equal(report.status, 200);
    const csv = await report.text();
    assert.match(csv, /Peringkat/);
    assert.match(csv, /'\=HYPERLINK/); // CSV formula injection disanitasi
    assert.match(csv, /Benar/);
    assert.equal(fs.existsSync(process.env.DATA_FILE), true, 'data tersimpan');

    // Uji pemulihan sesudah restart di proses Node terpisah.
    const child = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const { rooms } = require('./server');
      const r = rooms.get(${JSON.stringify(host.pin)});
      assert.ok(r, 'room restored');
      assert.equal(r.phase, 'finished');
      assert.equal(r.players.size, 1);
      assert.equal(r.history.get(0).size, 1);
      console.log('Room and result restored from DATA_FILE');
    `], { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    console.log('✓ Uji online: health, akses guru, CSV, otorisasi, dan pemulihan data berhasil.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
run().catch(err => { console.error(err); process.exitCode = 1; server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
