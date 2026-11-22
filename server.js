'use strict';

/**
 * KuisKilat — server kuis realtime tanpa dependensi eksternal.
 * Membutuhkan Node.js 18+. Komunikasi real-time: Server-Sent Events (SSE).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomInt, randomUUID, timingSafeEqual } = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();
const TTL_MS = 8 * 60 * 60 * 1000;
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : null;
const HOST_ACCESS_CODE = process.env.HOST_ACCESS_CODE || '';

function constantTimeMatch(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

// Jika DATA_FILE disetel ke volume permanen, ruang dan hasil dapat dipulihkan
// setelah proses server dimulai ulang. Jangan simpan file ini di repositori.
function persistRooms() {
  if (!DATA_FILE) return;
  const data = { version: 2, savedAt: Date.now(), rooms: [...rooms.values()].map(room => ({
    pin: room.pin, title: room.title, questions: room.questions,
    hostToken: room.hostToken, players: [...room.players.values()].map(({ connections, ...p }) => p),
    responses: [...room.responses.entries()],
    history: [...room.history.entries()].map(([idx, entries]) => [idx, [...entries.entries()]]),
    phase: room.phase, currentIndex: room.currentIndex, deadline: room.deadline,
    createdAt: room.createdAt, lastActive: room.lastActive
  })) };
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const temp = `${DATA_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(temp, DATA_FILE);
  } catch (err) { console.error('Gagal menyimpan ruang: ', err.message); }
}

function loadRooms() {
  if (!DATA_FILE || !fs.existsSync(DATA_FILE)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (saved.version !== 2 || !Array.isArray(saved.rooms)) throw Error('Format data tidak cocok.');
    for (const item of saved.rooms) {
      if (Date.now() - item.lastActive > TTL_MS) continue;
      const room = { ...item, players: new Map(item.players.map(p => [p.id, { ...p, connections: 0 }])),
        responses: new Map(item.responses),
        history: new Map((item.history || []).map(([idx, entries]) => [Number(idx), new Map(entries)])),
        subscribers: new Set(), timer: null };
      if (room.phase === 'question') {
        const remaining = room.deadline - Date.now();
        if (remaining > 0) room.timer = setTimeout(() => endQuestion(room), remaining);
        else { room.phase = 'results'; room.deadline = null; }
      }
      rooms.set(room.pin, room);
    }
    console.log(`Memulihkan ${rooms.size} ruang dari penyimpanan permanen.`);
  } catch (err) { console.error('Gagal memulihkan data: ', err.message); }
}


const sendJson = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};
const fail = (res, code, message) => sendJson(res, code, { ok: false, error: message });
const clean = (str, max) => String(str || '').trim().slice(0, max);
const asPin = value => /^\d{6}$/.test(String(value || '')) ? String(value) : null;

function validateQuiz(raw) {
  if (!raw || !Array.isArray(raw.questions)) throw Error('Format kuis tidak valid.');
  if (raw.questions.length < 1 || raw.questions.length > 30) throw Error('Jumlah soal harus 1–30.');
  const title = clean(raw.title, 80);
  if (title.length < 3) throw Error('Judul kuis minimal 3 karakter.');
  const questions = raw.questions.map((q, i) => {
    const text = clean(q.text, 250);
    const options = Array.isArray(q.options) ? q.options.map(o => clean(o, 120)) : [];
    const correct = Number(q.correct);
    const seconds = Number(q.seconds);
    if (text.length < 5) throw Error(`Soal ${i + 1}: pertanyaan minimal 5 karakter.`);
    if (options.length !== 4 || options.some(o => o.length === 0)) throw Error(`Soal ${i + 1}: empat pilihan harus diisi.`);
    if (!Number.isInteger(correct) || correct < 0 || correct > 3) throw Error(`Soal ${i + 1}: pilih jawaban benar.`);
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 60) throw Error(`Soal ${i + 1}: waktu harus 10–60 detik.`);
    return { text, options, correct, seconds };
  });
  return { title, questions };
}

function makePin() {
  for (let i = 0; i < 1000; i++) {
    const pin = String(randomInt(100000, 1000000));
    if (!rooms.has(pin)) return pin;
  }
  throw Error('PIN penuh, coba lagi.');
}

function getRoom(body) {
  const pin = asPin(body.pin);
  const room = pin ? rooms.get(pin) : null;
  if (!room) throw Error('PIN ruang tidak ditemukan.');
  room.lastActive = Date.now();
  return room;
}

function authorize(room, role, token) {
  if (role === 'host' && token === room.hostToken) return { role: 'host' };
  if (role === 'player') {
    const p = [...room.players.values()].find(p => p.token === token);
    if (p) return { role: 'player', player: p };
  }
  throw Error('Akses tidak sah atau sesi telah berakhir.');
}

function leaderboard(room) {
  return [...room.players.values()].sort((a, b) => b.score - a.score || a.joined - b.joined)
    .map((p, i) => ({ id: p.id, nickname: p.nickname, score: p.score, streak: p.streak, rank: i + 1 }));
}

function snapshot(room, audience) {
  const base = {
    ok: true,
    pin: room.pin,
    title: room.title,
    phase: room.phase,
    total: room.questions.length,
    currentIndex: room.currentIndex,
    players: [...room.players.values()].sort((a, b) => a.joined - b.joined)
      .map(p => ({ id: p.id, nickname: p.nickname, score: p.score, answered: room.responses.has(p.id), online: p.connections > 0 })),
    leaderboard: leaderboard(room)
  };
  if (room.currentIndex >= 0) {
    const q = room.questions[room.currentIndex];
    base.question = { number: room.currentIndex + 1, text: q.text, options: q.options, seconds: q.seconds };
    if (room.phase === 'question') {
      base.deadline = room.deadline;
      base.answeredCount = room.responses.size;
    }
    if (room.phase === 'results' || room.phase === 'finished') {
      base.question.correct = q.correct;
      base.distribution = q.options.map((_, i) => [...room.responses.values()].filter(r => r.index === i).length);
    }
  }
  if (audience.role === 'player') {
    const p = audience.player;
    const r = room.responses.get(p.id);
    base.me = { id: p.id, nickname: p.nickname, score: p.score, rank: base.leaderboard.find(x => x.id === p.id)?.rank || 0,
      answer: r?.index ?? null, earned: r?.earned ?? 0, correct: r?.correct ?? null };
  }
  return base;
}

function sseWrite(res, payload) {
  try { res.write(`data: ${JSON.stringify(payload)}\n\n`); }
  catch (_) { /* socket gone */ }
}

function broadcast(room) {
  for (const sub of room.subscribers) sseWrite(sub.res, snapshot(room, sub.audience));
}

function endQuestion(room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  room.timer = null;
  room.deadline = null;
  room.phase = 'results';
  persistRooms();
  broadcast(room);
}

function beginQuestion(room, nextIndex) {
  clearTimeout(room.timer);
  room.currentIndex = nextIndex;
  room.phase = 'question';
  room.responses = new Map();
  const q = room.questions[nextIndex];
  room.deadline = Date.now() + q.seconds * 1000;
  room.timer = setTimeout(() => endQuestion(room), q.seconds * 1000);
  persistRooms();
  broadcast(room);
}

function accessibleLinks(pin) {
  const addresses = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const nic of ifaces || []) {
      if (nic.family === 'IPv4' && !nic.internal) addresses.push(`http://${nic.address}:${PORT}/?pin=${pin}`);
    }
  }
  return [...new Set(addresses)];
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let content = '';
    req.on('data', chunk => {
      content += chunk;
      if (content.length > 120000) { reject(Error('Data terlalu besar.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(content || '{}')); }
      catch (_) { reject(Error('Data JSON tidak valid.')); }
    });
    req.on('error', reject);
  });
}

async function postApi(req, res, action) {
  try {
    const body = await readBody(req);
    if (action === 'create') {
      if (process.env.NODE_ENV === 'production' && !HOST_ACCESS_CODE)
        throw Error('Administrator belum mengatur HOST_ACCESS_CODE pada server.');
      if (HOST_ACCESS_CODE && !constantTimeMatch(body.hostCode, HOST_ACCESS_CODE))
        throw Error('Kode akses guru tidak sesuai. Hubungi administrator sekolah.');
      if (rooms.size >= 200) throw Error('Terlalu banyak ruang aktif. Coba beberapa saat lagi.');
      const quiz = validateQuiz(body);
      const pin = makePin();
      const token = randomUUID();
      const room = { pin, title: quiz.title, questions: quiz.questions, hostToken: token, players: new Map(),
        subscribers: new Set(), responses: new Map(), phase: 'lobby', currentIndex: -1,
        deadline: null, timer: null, history: new Map(), createdAt: Date.now(), lastActive: Date.now() };
      rooms.set(pin, room);
      persistRooms();
      return sendJson(res, 200, { ok: true, pin, token, role: 'host', links: accessibleLinks(pin) });
    }
    if (action === 'join') {
      const room = getRoom(body);
      if (room.phase !== 'lobby') throw Error('Permainan sudah dimulai. Bergabung hanya bisa sebelum mulai.');
      if (room.players.size >= 100) throw Error('Ruang sudah penuh (maksimal 100 pemain).');
      const nickname = clean(body.nickname, 24);
      if (nickname.length < 2) throw Error('Nama pemain minimal 2 karakter.');
      if ([...room.players.values()].some(p => p.nickname.toLocaleLowerCase('id') === nickname.toLocaleLowerCase('id')))
        throw Error('Nama sudah dipakai pemain lain.');
      const token = randomUUID();
      const id = randomUUID();
      room.players.set(id, { id, token, nickname, joined: Date.now(), connections: 0, score: 0, streak: 0 });
      persistRooms();
      broadcast(room);
      return sendJson(res, 200, { ok: true, pin: room.pin, token, role: 'player' });
    }
    const room = getRoom(body);
    const audience = authorize(room, body.role, body.token);
    if (action === 'start') {
      if (audience.role !== 'host') throw Error('Hanya guru yang dapat memulai.');
      if (room.phase !== 'lobby') throw Error('Permainan sudah berjalan.');
      if (room.players.size === 0) throw Error('Tunggu setidaknya satu siswa bergabung.');
      beginQuestion(room, 0);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'answer') {
      if (audience.role !== 'player') throw Error('Hanya siswa yang bisa menjawab.');
      if (room.phase !== 'question' || Date.now() > room.deadline) throw Error('Waktu menjawab sudah habis.');
      const idx = Number(body.index);
      if (!Number.isInteger(idx) || idx < 0 || idx > 3) throw Error('Pilihan tidak valid.');
      const p = audience.player;
      if (room.responses.has(p.id)) throw Error('Jawaban sudah terkirim.');
      const q = room.questions[room.currentIndex];
      const isCorrect = idx === q.correct;
      const remaining = Math.max(0, room.deadline - Date.now());
      p.streak = isCorrect ? p.streak + 1 : 0;
      const earned = isCorrect ? 500 + Math.round(500 * remaining / (q.seconds * 1000)) + Math.min(5, p.streak - 1) * 50 : 0;
      p.score += earned;
      const answer = { index: idx, correct: isCorrect, earned };
      room.responses.set(p.id, answer);
      if (!room.history.has(room.currentIndex)) room.history.set(room.currentIndex, new Map());
      room.history.get(room.currentIndex).set(p.id, answer);
      persistRooms();
      broadcast(room);
      if (room.responses.size === room.players.size) endQuestion(room);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'next') {
      if (audience.role !== 'host') throw Error('Hanya guru yang dapat melanjutkan.');
      if (room.phase !== 'results') throw Error('Tunggu hingga pertanyaan selesai.');
      if (room.currentIndex + 1 >= room.questions.length) {
        room.phase = 'finished';
        persistRooms();
        broadcast(room);
      } else beginQuestion(room, room.currentIndex + 1);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'restart') {
      if (audience.role !== 'host') throw Error('Hanya guru yang dapat mengulang.');
      if (room.phase !== 'finished') throw Error('Permainan belum selesai.');
      room.phase = 'lobby';
      room.currentIndex = -1;
      room.responses.clear();
      room.history.clear();
      room.deadline = null;
      for (const p of room.players.values()) { p.score = 0; p.streak = 0; }
      persistRooms();
      broadcast(room);
      return sendJson(res, 200, { ok: true });
    }
    fail(res, 404, 'Tindakan tidak dikenal.');
  } catch (e) {
    fail(res, 400, e.message || 'Terjadi kesalahan.');
  }
}

function getState(req, res, url) {
  try {
    const room = getRoom({ pin: url.searchParams.get('pin') });
    const audience = authorize(room, url.searchParams.get('role'), url.searchParams.get('token'));
    sendJson(res, 200, snapshot(room, audience));
  } catch (e) { fail(res, 401, e.message); }
}

function streamEvents(req, res, url) {
  let room, audience;
  try {
    room = getRoom({ pin: url.searchParams.get('pin') });
    audience = authorize(room, url.searchParams.get('role'), url.searchParams.get('token'));
  } catch (e) { return fail(res, 401, e.message); }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');
  const sub = { res, audience };
  room.subscribers.add(sub);
  if (audience.role === 'player') audience.player.connections++;
  broadcast(room);
  const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 20000);
  req.on('close', () => {
    clearInterval(keepAlive);
    room.subscribers.delete(sub);
    if (audience.role === 'player') audience.player.connections = Math.max(0, audience.player.connections - 1);
    broadcast(room);
  });
}

function csvCell(value) {
  const s = String(value ?? '');
  // Awali formula spreadsheet dengan petik tunggal untuk mencegah CSV injection.
  const safe = /^[\s]*[=+@-]/.test(s) ? `'${s}` : s;
  return `\"${safe.replaceAll('\"', '\"\"')}\"`;
}

function getReport(req, res, url) {
  try {
    const room = getRoom({ pin: url.searchParams.get('pin') });
    authorize(room, 'host', url.searchParams.get('token'));
    const header = ['Peringkat', 'Nama siswa', 'Skor', 'Benar', 'Salah', 'Tidak menjawab',
      ...room.questions.map((_, i) => `Soal ${i + 1}`)];
    const rows = leaderboard(room).map(p => {
      let right = 0, wrong = 0, blank = 0;
      const detailed = room.questions.map((_, index) => {
        // Soal yang belum dimainkan ditandai belum dimainkan, bukan salah.
        if (index > room.currentIndex) return 'Belum dimainkan';
        const answer = room.history.get(index)?.get(p.id);
        if (!answer) { blank++; return 'Tidak menjawab'; }
        if (answer.correct) { right++; return 'Benar'; }
        wrong++; return 'Salah';
      });
      return [p.rank, p.nickname, p.score, right, wrong, blank, ...detailed];
    });
    const csv = '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=hasil-kuiskilat-${room.pin}.csv`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    });
    res.end(csv);
  } catch (err) { fail(res, 401, err.message); }
}

const routes = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
  '/quiz-csv.js': { file: 'quiz-csv.js', type: 'application/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' }
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) return postApi(req, res, url.pathname.slice(5));
  if (req.method === 'GET' && url.pathname === '/api/health')
    return sendJson(res, 200, { ok: true, service: 'KuisKilat Online', version: '3.0' });
  if (req.method === 'GET' && url.pathname === '/api/config')
    return sendJson(res, 200, { ok: true, hostCodeRequired: Boolean(HOST_ACCESS_CODE) });
  if (req.method === 'GET' && url.pathname === '/api/report') return getReport(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/state') return getState(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/events') return streamEvents(req, res, url);
  const route = req.method === 'GET' ? routes[url.pathname] : null;
  if (!route) return fail(res, 404, 'Halaman tidak ditemukan.');
  try {
    const content = fs.readFileSync(path.join(PUBLIC, route.file));
    res.writeHead(200, { 'Content-Type': route.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch (e) { fail(res, 500, 'Gagal membuka berkas.'); }
});

// Bersihkan permainan lama agar memori tidak menumpuk.
const sweeper = setInterval(() => {
  for (const [pin, room] of rooms) {
    if (Date.now() - room.lastActive > TTL_MS && room.subscribers.size === 0) {
      clearTimeout(room.timer);
      rooms.delete(pin);
      persistRooms();
    }
  }
}, 5 * 60 * 1000);
sweeper.unref();

loadRooms();

if (require.main === module) server.listen(PORT, HOST, () => {
  console.log(`\n⚡ KuisKilat aktif di http://localhost:${PORT}`);
  for (const addr of accessibleLinks('------')) console.log('   Jaringan: ' + addr.replace('?pin=------', ''));
  console.log('   Tekan Ctrl+C untuk berhenti.\n');
});

module.exports = { server, rooms, validateQuiz };
