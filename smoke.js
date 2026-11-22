'use strict';
const assert = require('node:assert/strict');
const { server } = require('../server');

let base;
async function api(action, body) {
  const res = await fetch(`${base}/api/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: res.status, ...(await res.json()) };
}
async function stateFor(session) {
  const url = new URL('/api/state', base);
  url.search = new URLSearchParams(session).toString();
  const res = await fetch(url); return { status: res.status, ...(await res.json()) };
}
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const web = await fetch(base);
    assert.equal(web.status, 200);
    assert.match(await web.text(), /KuisKilat/);

    const invalid = await api('create', { title:'T',questions:[] });
    assert.equal(invalid.ok, false);

    const quiz = { title: 'Uji matematika', questions: [
      { text: 'Berapa hasil 2 + 3?', options: ['4', '5', '6', '7'], correct: 1, seconds: 10 },
      { text: 'Berapa hasil 8 ÷ 2?', options: ['6', '2', '5', '4'], correct: 3, seconds: 10 }
    ] };
    const host = await api('create', quiz);
    assert.equal(host.ok, true);
    assert.match(host.pin, /^\d{6}$/);
    const hs = { pin: host.pin, role: 'host', token: host.token };

    const alice = await api('join', { pin: host.pin, nickname: 'Alya' });
    const bob = await api('join', { pin: host.pin, nickname: 'Bima' });
    assert.equal(alice.ok, true);
    assert.equal(bob.ok, true);
    const ps1 = { pin: alice.pin, role: 'player', token: alice.token };
    const ps2 = { pin: bob.pin, role: 'player', token: bob.token };
    assert.equal((await api('join', { pin: host.pin, nickname: 'ALYA' })).ok, false);

    // SSE client mendapatkan snapshot lobby secara langsung.
    const url = new URL('/api/events', base); url.search = new URLSearchParams(ps1).toString();
    const aborter = new AbortController();
    const stream = await fetch(url, { signal: aborter.signal });
    assert.equal(stream.headers.get('content-type').startsWith('text/event-stream'), true);
    const reader = stream.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /"phase":"lobby"/);
    aborter.abort();

    assert.equal((await api('start', ps1)).ok, false); // siswa tak bisa memulai
    assert.equal((await api('start', hs)).ok, true);
    const q1 = await stateFor(ps1);
    assert.equal(q1.phase, 'question');
    assert.equal(q1.question.options[1], '5');
    assert.equal(q1.question.correct, undefined); // kunci rahasia saat menjawab
    assert.equal((await api('join', { pin: host.pin, nickname:'Cici' })).ok, false);

    assert.equal((await api('answer', { ...ps1, index: 1 })).ok, true);
    assert.equal((await api('answer', { ...ps1, index: 1 })).ok, false); // sekali jawab
    assert.equal((await api('answer', { ...ps2, index: 0 })).ok, true);
    const result1 = await stateFor(ps1);
    assert.equal(result1.phase, 'results');
    assert.equal(result1.question.correct, 1);
    assert.deepEqual(result1.distribution, [1, 1, 0, 0]);
    assert.ok(result1.me.earned >= 500);
    const resultBob = await stateFor(ps2);
    assert.equal(resultBob.me.earned, 0);
    assert.equal(resultBob.me.rank, 2);

    assert.equal((await api('next', ps1)).ok, false); // siswa tak bisa lanjut
    assert.equal((await api('next', hs)).ok, true);
    const q2 = await stateFor(ps1);
    assert.equal(q2.currentIndex, 1);
    assert.equal(q2.phase, 'question');
    assert.equal((await api('answer', { ...ps1, index: 3 })).ok, true);
    assert.equal((await api('answer', { ...ps2, index: 3 })).ok, true);
    assert.equal((await stateFor(hs)).phase, 'results');
    assert.equal((await api('next', hs)).ok, true);
    assert.equal((await stateFor(hs)).phase, 'finished');
    assert.equal((await api('restart', hs)).ok, true);
    const replay = await stateFor(ps1);
    assert.equal(replay.phase, 'lobby');
    assert.equal(replay.me.score, 0);

    console.log('✓ 20 pemeriksaan berhasil: API, PIN, siswa, SSE, soal, kunci, skor, podium, ulang.');
  } finally {
    server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
