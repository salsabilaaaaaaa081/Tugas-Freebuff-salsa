'use strict';
/* utilitas umum — semua perhitungan tanggal memakai UTC agar bebas DST */

const DAY_MS = 86400000;
const WD_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const WD_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WD_PER_MONTH = 22; /* asumsi konversi gaji bulanan -> harian */

/* 'YYYY-MM-DD' -> Date (UTC) */
function parseD(s) {
  const p = String(s).split('-').map(Number);
  return new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
}

/* Date -> 'YYYY-MM-DD' */
function fmtD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function addDaysD(d, n) { return new Date(d.getTime() + n * DAY_MS); }
function addDaysS(s, n) { return fmtD(addDaysD(parseD(s), n)); }

/* selisih hari kalender (b - a) */
function daysBetween(a, b) {
  const da = typeof a === 'string' ? parseD(a) : a;
  const db = typeof b === 'string' ? parseD(b) : b;
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

/* tanggal hari ini (waktu lokal) dalam format ISO */
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dd;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function uid(p) {
  return (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('id-ID'); }
function fmtRp(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }

/* '2026-01-05' -> 'Sen, 5 Jan 2026' */
function humanD(s) {
  if (!s) return '—';
  const d = parseD(s);
  return WD_SHORT[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTH_SHORT[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/* '2026-01-05' -> '05/01/26' */
function shortD(s) {
  if (!s) return '—';
  const d = parseD(s);
  return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCFullYear()).slice(2);
}

/* '12 Jan 2026' (tanpa hari) */
function medD(s) {
  if (!s) return '—';
  const d = parseD(s);
  return d.getUTCDate() + ' ' + MONTH_SHORT[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

function trimStr(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}
