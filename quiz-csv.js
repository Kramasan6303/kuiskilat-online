'use strict';
/* Pustaka ringan impor/ekspor CSV tanpa dependensi eksternal. */
(function(root) {
  const HEADERS = ['pertanyaan','a','b','c','d','jawaban_benar','waktu_detik'];
  function parseRows(input) {
    const source = String(input || '').replace(/^\uFEFF/, '').trim();
    if (!source) throw new Error('Berkas CSV kosong.');
    // Excel Indonesia kadang memakai titik koma sebagai pemisah.
    const firstLine = source.split(/\r?\n/, 1)[0];
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let cells = []; let cell = ''; let quote = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === '"') {
        if (quote && source[i + 1] === '"') { cell += '"'; i++; }
        else quote = !quote;
      } else if (c === delimiter && !quote) { cells.push(cell); cell = ''; }
      else if ((c === '\r' || c === '\n') && !quote) {
        if (c === '\r' && source[i + 1] === '\n') i++;
        cells.push(cell); if (cells.some(x => x.trim())) rows.push(cells);
        cells = []; cell = '';
      } else cell += c;
    }
    if (quote) throw new Error('Tanda kutip CSV tidak ditutup.');
    cells.push(cell); if (cells.some(x => x.trim())) rows.push(cells);
    return rows;
  }
  function parseQuizCsv(source) {
    const rows = parseRows(source);
    if (rows.length < 2) throw new Error('CSV perlu baris judul kolom dan minimal satu soal.');
    const cols = rows[0].map(s => s.trim().toLowerCase().replace(/\s+/g,'_'));
    if (HEADERS.some(k => !cols.includes(k)))
      throw new Error(`Kolom CSV wajib: ${HEADERS.join(', ')}.`);
    if (rows.length > 31) throw new Error('Maksimal 30 soal per kuis.');
    const questions = rows.slice(1).map((r, i) => {
      const get = col => String(r[cols.indexOf(col)] ?? '').trim();
      const text = get('pertanyaan');
      const options = ['a','b','c','d'].map(get);
      const correctRaw = get('jawaban_benar').toUpperCase();
      const correct = /^[A-D]$/.test(correctRaw) ? correctRaw.charCodeAt(0) - 65 : Number(correctRaw) - 1;
      const seconds = Number(get('waktu_detik'));
      if (text.length < 5 || text.length > 250 || options.some(o => !o || o.length > 120))
        throw new Error(`Baris ${i + 2}: pertanyaan minimal 5 karakter dan empat opsi A–D wajib diisi.`);
      if (!Number.isInteger(correct) || correct < 0 || correct > 3)
        throw new Error(`Baris ${i + 2}: jawaban_benar harus A, B, C, D atau 1–4.`);
      if (!Number.isInteger(seconds) || seconds < 10 || seconds > 60)
        throw new Error(`Baris ${i + 2}: waktu_detik harus 10–60.`);
      return { text, options, correct, seconds };
    });
    return { title: 'Kuis Impor dari Excel', questions };
  }
  function templateCsv() {
    const rows = [HEADERS, 
      ['Berapakah hasil dari 12 × 8?', '86','96','108','88','B','20'],
      ['Hasil penjumlahan 15 dan 17 adalah ...','30','31','32','33','C','15']];
    const cell = v => `"${String(v).replace(/"/g,'""')}"`;
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  const api = { parseQuizCsv, templateCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KuisCSV = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
