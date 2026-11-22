'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const sessionInfo = $('#session-info');
  const letters = ['A', 'B', 'C', 'D'];
  const symbols = ['▲', '◆', '●', '■'];
  const storeDraft = 'kuiskilat.draft.v1';
  const storeSession = 'kuiskilat.session.v1';
  const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sample = () => ({ title: 'Tantangan Matematika Seru', questions: [
    { text: 'Berapakah hasil dari 12 × 8?', options: ['86', '96', '108', '88'], correct: 1, seconds: 20 },
    { text: 'Bilangan prima di bawah ini adalah …', options: ['21', '33', '29', '27'], correct: 2, seconds: 20 },
    { text: 'Jika 3x + 5 = 20, berapakah nilai x?', options: ['3', '4', '6', '5'], correct: 3, seconds: 20 },
    { text: 'Jumlah sudut dalam segitiga adalah …', options: ['180°', '90°', '270°', '360°'], correct: 0, seconds: 20 },
    { text: 'Luas persegi dengan sisi 9 cm adalah …', options: ['18 cm²', '36 cm²', '72 cm²', '81 cm²'], correct: 3, seconds: 20 }
  ] });
  const blankQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, seconds: 20 });
  const loadDraft = () => { try { const d = JSON.parse(localStorage.getItem(storeDraft)); return d && Array.isArray(d.questions) ? d : sample(); } catch (_) { return sample(); } };

  let draft = loadDraft();
  let active = 0;
  let screen = 'home';
  let session = null;
  let state = null;
  let events = null;
  let links = [];
  let inFlight = false;
  let connectionErrorShown = false;
  let statusMessage = '';
  let hostCode = '';
  let hostCodeRequired = false;

  const saveDraft = () => localStorage.setItem(storeDraft, JSON.stringify(draft));
  const saveSession = () => sessionStorage.setItem(storeSession, JSON.stringify({ ...session, links }));
  function alertToast(message, error = false) {
    const div = document.createElement('div'); div.className = `toast ${error ? 'error' : ''}`;
    div.textContent = message; $('#toasts').append(div);
    setTimeout(() => div.remove(), 4200);
  }
  const btn = (id, label, variant = 'ghost', extra = '') => `<button type="button" class="button ${variant}" data-action="${id}" ${extra}>${label}</button>`;

  function render() {
    sessionInfo.innerHTML = session && state ? `<span class="code-chip">PIN <b>${h(session.pin)}</b></span>` : '';
    if (screen === 'editor') return renderEditor();
    if (!session) { app.innerHTML = screen === 'join' ? joinHTML() : homeHTML(); return; }
    if (!state) { app.innerHTML = '<div class="panel centered"><h2>Menghubungkan ke ruang kuis…</h2><p class="muted">Memuat status permainan.</p></div>'; return; }
    const isHost = session.role === 'host';
    switch (state.phase) {
      case 'lobby': return isHost ? renderHostLobby() : renderPlayerLobby();
      case 'question': return isHost ? renderHostQuestion() : renderPlayerQuestion();
      case 'results': return isHost ? renderHostResults() : renderPlayerResults();
      case 'finished': return renderFinished();
      default: app.innerHTML = '<h2>Status ruang tidak dikenal.</h2>';
    }
  }

  function homeHTML() {
    return `<section class="hero"><div class="eyebrow">✦ Belajar · Bermain · Bersaing</div>
        <h1>Kelas lebih hidup.<br><span class="gradient-text">Kuis lebih seru.</span></h1>
        <p class="lead">Buat kuis interaktif dan mainkan langsung lewat internet. Siswa bergabung dari HP, lewat tautan undangan atau PIN permainan.</p></section>
      <section class="home-choices" aria-label="Pilih cara bermain">
        <article class="choice"><div class="choice-icon">🎓</div><h2>Saya Guru / Host</h2><p>Susun pertanyaan, buka ruang kelas, dan kendalikan jalannya permainan.</p>${btn('editor', 'Buat & mulai kuis →', 'violet')}</article>
        <article class="choice join"><div class="choice-icon">🎮</div><h2>Saya Siswa / Pemain</h2><p>Masukkan PIN dari guru, pilih nama panggilan, lalu bersiap menjawab.</p>${btn('join', 'Gabung permainan →', '')}</article>
      </section><div class="features"><span><b>✓</b> Tanpa instalasi</span><span><b>✓</b> Skor otomatis</span><span><b>✓</b> Papan peringkat langsung</span><span><b>✓</b> Bisa dari HP</span></div>`;
  }

  function joinHTML() {
    const preset = new URL(location.href).searchParams.get('pin') || '';
    return `<section class="join-layout">
      <button type="button" class="back-link" data-action="home">← Halaman awal</button>
      <div class="join-emoji">🚀</div><h1 class="page-title">Masuk permainan</h1>
      <p class="page-sub">Minta PIN 6 digit dari guru untuk masuk ke ruang kuis.</p>
      <form class="panel" id="join-form">
        <label class="field"><span class="field-label">PIN permainan</span><input class="input big-pin-input" name="pin" value="${h(preset.replace(/\D/g, '').slice(0, 6))}" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="off" required></label>
        <label class="field"><span class="field-label">Nama panggilan</span><input class="input" name="nickname" maxlength="24" minlength="2" placeholder="Contoh: Budi" autocomplete="nickname" required></label>
        <button class="button block large" type="submit">Gabung sekarang →</button>
      </form><p class="fine">Gunakan nama yang mudah dikenali guru. Maksimal 100 pemain per ruang.</p></section>`;
  }

  function renderEditor() {
    if (!draft.questions.length) draft.questions.push(blankQuestion());
    active = Math.max(0, Math.min(active, draft.questions.length - 1));
    const q = draft.questions[active];
    app.innerHTML = `<button type="button" class="back-link" data-action="home">← Halaman awal</button>
      <div class="split-heading"><div><h1 class="page-title">Studio Kuis <span class="gradient-text">✦</span></h1><p class="page-sub">Atur soal dan jawaban benar sebelum mengundang siswa.</p></div>
      <div class="action-row">${btn('importcsv', '↑ Impor Excel/CSV')}${btn('template', '↓ Template CSV')}${btn('import', '↑ Impor JSON')}${btn('export', '↓ Ekspor JSON')}</div></div>
      <label class="field"><span class="field-label">Judul kuis</span><input class="input" data-field="title" maxlength="80" value="${h(draft.title)}" placeholder="Contoh: Matematika Kelas XI"></label>
      ${hostCodeRequired ? `<label class="field" style="margin:15px 0"><span class="field-label">Kode akses guru</span><input class="input" type="password" data-field="hostCode" autocomplete="off" value="${h(hostCode)}" placeholder="Masukkan kode dari administrator" required><small class="fine">Kode diperlukan agar orang lain tidak bisa membuat ruang kuis tanpa izin.</small></label>` : ''}
      <div class="editor-grid">
        <div class="panel"><div class="split-heading"><h3 class="panel-title" style="margin:0">Daftar soal</h3><span class="tiny-pill">${draft.questions.length}/30</span></div>
        <div class="question-list">${draft.questions.map((x, i) => `<button type="button" data-action="select" data-index="${i}" class="qnav ${i === active ? 'active' : ''}"><span class="qnum">${i + 1}</span><span class="qname">${h(x.text || `Pertanyaan ${i + 1}`)}</span></button>`).join('')}</div>
        <div style="margin-top:16px">${btn('add', '+ Tambah soal', 'ghost', `style="width:100%" ${draft.questions.length >= 30 ? 'disabled' : ''}`)}</div></div>
        <div class="panel">
          <div class="qcard-header"><h2 class="panel-title" style="margin:0">Pertanyaan ${active + 1}</h2><div class="action-row">${btn('duplicate', '⧉ Duplikat', 'ghost', draft.questions.length >= 30 ? 'disabled' : '')}${btn('delete', 'Hapus', 'danger', draft.questions.length === 1 ? 'disabled' : '')}</div></div>
          <label class="field"><span class="field-label">Teks pertanyaan</span><textarea class="input" data-field="text" rows="3" maxlength="250" placeholder="Ketik pertanyaan di sini…">${h(q.text)}</textarea></label>
          <span class="field-label" style="margin-bottom:12px">Pilihan jawaban <span class="muted" style="font-weight:400">(tandai satu yang benar)</span></span>
          <div class="option-editor-grid">${q.options.map((o, i) => `<div class="option-editor ${q.correct === i ? 'correct' : ''}">
              <label><input type="radio" name="correct" data-field="correct" value="${i}" ${q.correct === i ? 'checked' : ''}> <span class="option-marker">${letters[i]}</span> ${q.correct === i ? 'Jawaban benar' : 'Pilih jika benar'}</label>
              <input class="input" data-option="${i}" maxlength="120" value="${h(o)}" placeholder="Opsi ${letters[i]}"></div>`).join('')}</div>
          <div style="margin-top:19px;max-width:240px"><label class="field"><span class="field-label">Waktu menjawab</span>
            <select class="input" data-field="seconds">${[10, 15, 20, 30, 45, 60].map(n => `<option value="${n}" ${q.seconds === n ? 'selected' : ''}>${n} detik</option>`).join('')}</select></label></div>
          <div class="editor-footer"><span class="fine">Perubahan tersimpan otomatis di browser ini.</span>${btn('create', 'Buka ruang kuis →', 'violet')}</div>
        </div></div><input id="file-import" type="file" accept="application/json,.json" hidden><input id="file-import-csv" type="file" accept="text/csv,.csv" hidden>`;
  }

  function roomHeading(label) {
    return `<div class="game-header"><div><span class="eyebrow" style="margin:0 0 4px">${h(label)}</span><h2 style="margin:0;font-size:23px;letter-spacing:-.03em">${h(state.title)}</h2></div><span class="code-chip">PIN <b>${h(state.pin)}</b></span></div>`;
  }

  function renderHostLobby() {
    const playerCount = state.players.length;
    const link = `${location.origin}/?pin=${state.pin}`;
    app.innerHTML = `${roomHeading('RUANG GURU · MENUNGGU PEMAIN')}
      <div class="panel room-banner"><div class="eyebrow">PIN permainan</div><div class="pin-number">${h(state.pin)}</div>
        <p>Bagikan PIN ini. Siswa buka aplikasi dan tekan <b>Gabung permainan</b>.</p>
        <div class="action-row" style="justify-content:center">${btn('copypin', '⧉ Salin PIN')}${btn('copylink', '↗ Salin tautan bergabung')}</div>
        <div class="share-url">${h(link)}</div></div>
      <div class="lobby-grid">
        <div class="panel"><div class="split-heading"><h3 class="panel-title" style="margin:0">Pemain bergabung</h3><span class="tiny-pill">${playerCount} siswa</span></div>
          <div class="students">${playerCount ? state.players.map(p => `<span class="student-pill ${p.online ? '' : 'offline'}">${p.online ? '🟢' : '◯'} ${h(p.nickname)}</span>`).join('') : '<div class="empty-state">👀 Belum ada siswa. Bagikan PIN untuk memulai.</div>'}</div></div>
        <div class="lobby-panel-side"><div class="panel"><h3 style="margin-top:0">Siap dimainkan?</h3><p class="muted" style="line-height:1.6">${state.total} soal · ${playerCount} pemain</p>
          ${btn('start', '▶ Mulai permainan', 'violet block large', playerCount === 0 ? 'disabled' : '')}
          <p class="fine">Setelah dimulai, siswa baru tidak bisa bergabung.</p></div>
          <div class="note">${['localhost','127.0.0.1'].includes(location.hostname) ? 'Aplikasi saat ini dibuka secara lokal. Setelah diterbitkan di hosting, siswa dari jaringan berbeda dapat menggunakan tautan undangan.' : 'Bagikan tautan di atas melalui WhatsApp atau kelas daring. Siswa dapat masuk dari jaringan internet yang berbeda.'}</div></div>
      </div>`;
  }

  function renderPlayerLobby() {
    app.innerHTML = `${roomHeading('RUANG SISWA · BERHASIL BERGABUNG')}
      <div class="panel room-banner"><div class="wait-animation">🙌</div><div class="eyebrow">Kamu sudah masuk!</div>
        <h2>Halo, <span class="gradient-text">${h(state.me.nickname)}</span>!</h2>
        <p>Guru akan memulai permainan. Tetap buka halaman ini, ya.</p>
        <span class="tiny-pill">${state.players.length} pemain sudah siap</span></div>
      <div class="panel" style="margin-top:18px"><h3 class="panel-title">Teman satu ruang</h3>
        <div class="students">${state.players.map(p => `<span class="student-pill">${p.id === state.me.id ? '⭐' : '🎮'} ${h(p.nickname)}</span>`).join('')}</div></div>`;
  }

  function timerHtml() { return `<div class="timer-bubble"><small style="display:block;font-size:11px;color:var(--muted)">WAKTU</small><b id="countdown-num">${state.question.seconds}</b><small> dtk</small></div>`; }
  function questionHead() { return `${roomHeading('PERTANYAAN BERLANGSUNG')}
      <div class="question-top"><span class="question-count">Soal ${state.question.number} / ${state.total}</span>${timerHtml()}</div>
      <div class="progress-track"><div class="progress-fill" id="timer-fill"></div></div>
      <div class="question-card"><div class="eyebrow" style="margin-bottom:2px">PILIH JAWABAN YANG PALING TEPAT</div><h1>${h(state.question.text)}</h1></div>`; }

  function answerGrid(interactive, selected = null) {
    return `<div class="answer-grid">${state.question.options.map((o, i) => `<button type="button" class="answer ${selected === i ? 'selected' : ''} ${selected !== null && selected !== i ? 'inactive' : ''}" data-answer="${i}" data-i="${i}" ${interactive ? '' : 'disabled'}><span class="answer-symbol">${symbols[i]}</span><span>${h(o)}</span></button>`).join('')}</div>`;
  }

  function renderHostQuestion() {
    const count = state.players.length;
    app.innerHTML = `<div class="question-screen">${questionHead()}${answerGrid(false)}<div class="question-bottom">
        <b style="font-size:23px;color:var(--aqua)">${state.answeredCount} / ${count}</b> siswa sudah menjawab
        <div class="mini-progress"><div style="width:${count ? Math.round(state.answeredCount * 100 / count) : 0}%"></div></div>
        <p class="fine">Hasil muncul otomatis setelah waktu habis atau seluruh siswa menjawab.</p></div></div>`;
    refreshTimer();
  }
  function renderPlayerQuestion() {
    const selected = state.me.answer;
    app.innerHTML = `<div class="question-screen">${questionHead()}${answerGrid(selected === null, selected)}
      ${selected !== null ? '<div class="answer-status">✓ Jawaban terkirim!<small>Menunggu pemain lain atau waktu selesai…</small></div>' : '<div class="question-bottom">Pilih satu jawaban sebelum waktu habis!</div>'}</div>`;
    refreshTimer();
  }

  function optionResults() {
    const sum = state.distribution.reduce((a, b) => a + b, 0);
    return `<div class="result-options">${state.question.options.map((o, i) => `<div class="result-option ${i === state.question.correct ? 'winner' : ''}">
      <span class="option-marker">${letters[i]}</span><div><b>${h(o)} ${i === state.question.correct ? '✓' : ''}</b>
      <div class="bar-track"><div style="width:${sum ? Math.round(state.distribution[i] * 100 / sum) : 0}%"></div></div></div>
      <span class="count">${state.distribution[i]}</span></div>`).join('')}</div>`;
  }
  function board(limit = 7) {
    return `<div class="leaderboard">${state.leaderboard.slice(0, limit).map(p => `<div class="leader-row"><span class="rank">#${p.rank}</span><span class="rank-name">${h(p.nickname)}</span><span class="rank-score">${p.score.toLocaleString('id-ID')}</span></div>`).join('') || '<p class="muted">Belum ada nilai.</p>'}</div>`;
  }

  function renderHostResults() {
    app.innerHTML = `${roomHeading('HASIL PERTANYAAN')}
      <div class="split-heading"><h1 class="page-title">Hasil soal ${state.question.number} <span class="gradient-text">✓</span></h1>
       ${btn('next', state.currentIndex + 1 >= state.total ? '🏆 Lihat podium' : 'Pertanyaan berikutnya →', 'violet')}</div>
      <div class="results-layout"><div class="panel"><h3 class="panel-title">${h(state.question.text)}</h3>${optionResults()}
        <p class="fine">Tanda ✓ menandakan jawaban benar. Angka menunjukkan jumlah siswa yang memilih opsi tersebut.</p></div>
      <div class="panel"><h3 class="panel-title">🏅 Papan peringkat</h3>${board()}</div></div>`;
  }
  function renderPlayerResults() {
    const answered = state.me.answer !== null;
    const correct = state.me.correct;
    app.innerHTML = `${roomHeading('HASIL PERTANYAAN')}
      <div class="results-layout"><div class="panel self-result"><div class="result-badge">${answered ? correct ? '🎉' : '💪' : '⏰'}</div>
       <div class="eyebrow">${answered ? correct ? 'JAWABAN TEPAT!' : 'BELUM TEPAT' : 'WAKTU HABIS'}</div>
       <h2>${answered ? correct ? 'Luar biasa!' : 'Tetap semangat!' : 'Belum sempat menjawab'}</h2>
       <div class="big-score">+${state.me.earned.toLocaleString('id-ID')}</div><p class="muted">Total poin: <b>${state.me.score.toLocaleString('id-ID')}</b> · Peringkat #${state.me.rank}</p>
       <p class="fine">Guru akan melanjutkan ke soal berikutnya.</p></div>
      <div class="panel"><h3 class="panel-title">Jawaban soal ini</h3>${optionResults()}</div></div>
      <div class="panel" style="margin-top:17px"><h3 class="panel-title">Papan peringkat sementara</h3>${board(5)}</div>`;
  }

  function renderFinished() {
    const winners = state.leaderboard.slice(0, 3);
    const podiumEntry = (p, position, clazz, emoji) => `<div class="podium-place ${clazz}"><span class="podium-avatar">${emoji}</span>
        <div class="podium-name">${p ? h(p.nickname) : '—'}</div><div class="podium-base">#${position}<small>${p ? p.score.toLocaleString('id-ID') + ' poin' : '—'}</small></div></div>`;
    const me = state.me;
    app.innerHTML = `${roomHeading('PERMAINAN SELESAI')}<h1 class="final-title">🏆 Panggung Juara!</h1>
      <p class="final-sub">Terima kasih sudah bermain. Ini hasil akhir dari ${state.total} pertanyaan.</p>
      <div class="podium">${podiumEntry(winners[1], 2, 'second', '🥈')}${podiumEntry(winners[0], 1, 'first', '🥇')}${podiumEntry(winners[2], 3, 'third', '🥉')}</div>
      ${me ? `<div class="panel centered" style="max-width:620px;margin:14px auto"><h2 style="margin-top:0">Peringkatmu: #${me.rank}</h2><div class="score-num">${me.score.toLocaleString('id-ID')} poin</div><p class="muted">Kerja bagus, ${h(me.nickname)}!</p></div>` : ''}
      <div class="panel" style="max-width:650px;margin:25px auto"><h3 class="panel-title">Hasil keseluruhan</h3>${board(100)}</div>
      <div class="action-row" style="justify-content:center;margin-top:20px">${session.role === 'host' ? btn('report', '↓ Unduh hasil CSV', 'ghost') + btn('restart', '↻ Main lagi', 'violet') : ''}${btn('exit', 'Keluar ke beranda', 'ghost')}</div>`;
  }

  function refreshTimer() {
    if (!state || state.phase !== 'question') return;
    const left = Math.max(0, state.deadline - Date.now());
    const total = state.question.seconds * 1000;
    const num = $('#countdown-num'); const bar = $('#timer-fill');
    if (num) num.textContent = Math.ceil(left / 1000);
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, left / total * 100))}%`;
  }
  setInterval(refreshTimer, 130);

  async function request(action, data = {}, authenticated = true) {
    const payload = authenticated ? { pin: session.pin, role: session.role, token: session.token, ...data } : data;
    const response = await fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!result.ok) throw Error(result.error || 'Permintaan gagal.');
    return result;
  }
  function disconnect() { if (events) { events.close(); events = null; } }
  function attach() {
    disconnect(); state = null; render();
    const params = new URLSearchParams({ pin: session.pin, role: session.role, token: session.token });
    events = new EventSource('/api/events?' + params.toString());
    events.onmessage = e => {
      try { state = JSON.parse(e.data); connectionErrorShown = false; render(); }
      catch (err) { console.error('Data permainan tidak valid', err); }
    };
    events.onerror = () => { if (!connectionErrorShown) { alertToast('Koneksi terputus. Mencoba menyambung kembali…', true); connectionErrorShown = true; } };
  }
  async function resume() {
    try {
      const restored = JSON.parse(sessionStorage.getItem(storeSession));
      if (!restored || !restored.pin || !restored.token || !restored.role) return false;
      session = { pin: restored.pin, token: restored.token, role: restored.role };
      links = Array.isArray(restored.links) ? restored.links : [];
      const query = new URLSearchParams(session);
      const response = await fetch('/api/state?' + query.toString());
      if (!response.ok) throw Error('Sesi telah berakhir.');
      state = await response.json();
      attach(); return true;
    } catch (_) {
      sessionStorage.removeItem(storeSession); session = null; state = null; return false;
    }
  }
  function backHome() {
    if (session && !confirm('Keluar dari tampilan permainan saat ini?')) return;
    disconnect(); sessionStorage.removeItem(storeSession); session = null; state = null; links = [];
    history.replaceState(null, '', location.pathname); screen = 'home'; render();
  }
  function validateDraft() {
    if (draft.title.trim().length < 3) throw Error('Isi judul kuis minimal 3 karakter.');
    if (!draft.questions.length || draft.questions.length > 30) throw Error('Soal harus berjumlah 1–30.');
    for (let i = 0; i < draft.questions.length; i++) {
      const q = draft.questions[i];
      if (q.text.trim().length < 5) { active = i; renderEditor(); throw Error(`Pertanyaan ${i + 1} belum lengkap.`); }
      if (q.options.some(o => !o.trim())) { active = i; renderEditor(); throw Error(`Lengkapi 4 pilihan jawaban soal ${i + 1}.`); }
    }
  }
  async function createRoom() {
    validateDraft();
    const result = await request('create', { ...draft, hostCode }, false);
    session = { pin: result.pin, token: result.token, role: 'host' };
    links = [`${location.origin}/?pin=${result.pin}`];
    saveSession(); attach();
  }
  async function joinRoom(form) {
    const data = Object.fromEntries(new FormData(form));
    const result = await request('join', { pin: data.pin, nickname: data.nickname }, false);
    session = { pin: result.pin, token: result.token, role: 'player' };
    links = [];
    saveSession(); attach();
  }
  async function downloadReport() {
    if (!session || session.role !== 'host') throw Error('Hanya guru yang dapat mengunduh hasil.');
    const params = new URLSearchParams({ pin: session.pin, token: session.token });
    const response = await fetch('/api/report?' + params.toString());
    if (!response.ok) throw Error((await response.json()).error || 'Gagal mengunduh hasil.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `hasil-kuiskilat-${session.pin}.csv`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); alertToast(`${label} tersalin.`); }
    catch (_) { prompt(`Salin ${label.toLowerCase()} di bawah ini:`, text); }
  }
  function exportDraft() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = 'kuis-kuiskilat.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  async function importDraft(file) {
    if (!file) return;
    if (file.size > 100000) throw Error('Berkas JSON terlalu besar.');
    let imported;
    try { imported = JSON.parse(await file.text()); }
    catch (_) { throw Error('Berkas bukan JSON yang valid.'); }
    if (!imported || !Array.isArray(imported.questions) || imported.questions.length < 1 || imported.questions.length > 30)
      throw Error('JSON harus berisi 1–30 pertanyaan.');
    draft = { title: String(imported.title || ''), questions: imported.questions.map(q => ({ text: String(q.text || ''),
      options: Array.isArray(q.options) && q.options.length === 4 ? q.options.map(String) : ['', '', '', ''],
      correct: Number(q.correct ?? 0), seconds: [10, 15, 20, 30, 45, 60].includes(Number(q.seconds)) ? Number(q.seconds) : 20 })) };
    active = 0; saveDraft(); render(); alertToast(`${draft.questions.length} soal berhasil diimpor.`);
  }

  async function importCsv(file) {
    if (!file) return;
    if (file.size > 100000) throw Error('CSV terlalu besar (maksimal 100 KB).');
    const parsed = KuisCSV.parseQuizCsv(await file.text());
    // Konfirmasi sebelum mengganti soal yang sedang disusun.
    if (!confirm(`Ganti draf saat ini dengan ${parsed.questions.length} soal dari CSV?`)) return;
    const title = prompt('Masukkan judul kuis:', parsed.title);
    if (title === null) return;
    parsed.title = String(title).trim().slice(0,80) || parsed.title;
    draft = parsed; active = 0; saveDraft(); render();
    alertToast(`${draft.questions.length} soal dari Excel/CSV berhasil diimpor.`);
  }
  function downloadCsvTemplate() {
    const blob = new Blob([KuisCSV.templateCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'template-soal-kuiskilat.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  document.addEventListener('input', e => {
    const target = e.target;
    if (screen !== 'editor' || !target.dataset) return;
    if (target.dataset.field === 'hostCode') { hostCode = target.value; return; }
    if (target.dataset.field === 'title') draft.title = target.value;
    if (target.dataset.field === 'text') draft.questions[active].text = target.value;
    if (target.dataset.option !== undefined) draft.questions[active].options[Number(target.dataset.option)] = target.value;
    saveDraft();
  });
  document.addEventListener('change', async e => {
    const target = e.target;
    if (target.id === 'file-import-csv') {
      try { await importCsv(target.files[0]); } catch (err) { alertToast(err.message, true); }
      return;
    }
    if (target.id === 'file-import') {
      try { await importDraft(target.files[0]); } catch (err) { alertToast(err.message, true); }
      return;
    }
    if (screen !== 'editor') return;
    if (target.dataset.field === 'correct') { draft.questions[active].correct = Number(target.value); saveDraft(); render(); }
    if (target.dataset.field === 'seconds') { draft.questions[active].seconds = Number(target.value); saveDraft(); }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'join-form') return;
    e.preventDefault(); if (inFlight) return; inFlight = true;
    const submit = e.target.querySelector('[type=submit]'); submit.disabled = true;
    try { await joinRoom(e.target); } catch (err) { alertToast(err.message, true); }
    finally { inFlight = false; if (submit.isConnected) submit.disabled = false; }
  });
  document.addEventListener('click', async e => {
    if (e.target.closest('#brand-home')) { backHome(); return; }
    const answer = e.target.closest('[data-answer]');
    if (answer) {
      if (inFlight || !session || session.role !== 'player' || !state || state.phase !== 'question' || state.me.answer !== null) return;
      inFlight = true;
      const buttons = app.querySelectorAll('[data-answer]'); buttons.forEach(b => b.disabled = true);
      try { await request('answer', { index: Number(answer.dataset.answer) }); }
      catch (err) { alertToast(err.message, true); if (state && state.phase === 'question' && state.me.answer === null) buttons.forEach(b => b.disabled = false); }
      finally { inFlight = false; }
      return;
    }
    const clicked = e.target.closest('[data-action]'); if (!clicked || clicked.disabled) return;
    const action = clicked.dataset.action;
    try {
      if (action === 'home' || action === 'exit') return backHome();
      if (action === 'join') { screen = 'join'; return render(); }
      if (action === 'editor') { screen = 'editor'; return render(); }
      if (action === 'select') { active = Number(clicked.dataset.index); return render(); }
      if (action === 'add') { if (draft.questions.length >= 30) throw Error('Maksimal 30 soal.'); draft.questions.push(blankQuestion()); active = draft.questions.length - 1; saveDraft(); return render(); }
      if (action === 'duplicate') { if (draft.questions.length >= 30) throw Error('Maksimal 30 soal.'); draft.questions.splice(active + 1, 0, structuredClone(draft.questions[active])); active++; saveDraft(); return render(); }
      if (action === 'delete') { if (draft.questions.length <= 1) return; draft.questions.splice(active, 1); active = Math.max(0, active - 1); saveDraft(); return render(); }
      if (action === 'export') return exportDraft();
      if (action === 'import') return $('#file-import').click();
      if (action === 'importcsv') return $('#file-import-csv').click();
      if (action === 'template') return downloadCsvTemplate();
      if (action === 'copypin') return copyText(state.pin, 'PIN');
      if (action === 'copylink') return copyText(`${location.origin}/?pin=${session.pin}`, 'Tautan');
      if (action === 'report') return downloadReport();
      if (inFlight) return;
      if (['create','start','next','restart'].includes(action)) {
        inFlight = true; clicked.disabled = true;
        try { if (action === 'create') await createRoom(); else await request(action); }
        finally { inFlight = false; if (clicked.isConnected) clicked.disabled = false; }
      }
    } catch (err) { alertToast(err.message || 'Terjadi kesalahan.', true); }
  });

  // Muat konfigurasi publik (apakah pembuatan ruang memerlukan kode guru).
  async function readConfig() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) hostCodeRequired = Boolean((await response.json()).hostCodeRequired);
    } catch (_) { /* antarmuka tetap dapat dibuka jika server sementara terputus */ }
  }
  // Memulihkan sesi jika browser memuat ulang selama permainan.
  (async () => {
    await readConfig();
    const resumed = await resume();
    if (!resumed) {
      if (new URL(location.href).searchParams.has('pin')) screen = 'join';
      render();
    }
  })();
})();
