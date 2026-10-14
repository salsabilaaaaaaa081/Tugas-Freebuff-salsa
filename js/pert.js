'use strict';
/* Diagram PERT: kotak aktivitas (ES/D/EF, LS/Slack/LF) + panah dependensi */

const PERT_NW = 200;
const PERT_NH = 92;
const PERT_GX = 110;
const PERT_GY = 34;
const PERT_PAD = 24;

function renderPert() {
  const host = document.getElementById('pertContainer');
  const sched = App.sched;
  if (!host || !sched) return;

  const state = Store.state;
  const leaves = state.tasks.filter(function (t) { return !sched.isSummary(t); });
  if (!leaves.length) {
    host.innerHTML = '<div class="empty" style="margin:10px">Belum ada aktivitas untuk ditampilkan.</div>';
    return;
  }

  /* ---- peringkat (kolom) = panjang rantai dependensi terpanjang ---- */
  const rank = new Map();
  sched.order.forEach(function (id) {
    const t = Store.taskById(id);
    if (!t || sched.isSummary(t)) return;
    let r = 0;
    (sched.usedPreds.get(id) || []).forEach(function (p) {
      const pr = rank.get(p.src);
      if (pr !== undefined) r = Math.max(r, pr + 1);
    });
    rank.set(id, r);
  });

  const groups = new Map();
  sched.order.forEach(function (id) {
    const t = Store.taskById(id);
    if (!t || sched.isSummary(t)) return;
    const r = rank.get(id) || 0;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  });

  const ranks = Array.from(groups.keys()).sort(function (a, b) { return a - b; });
  const maxRank = ranks.length ? ranks[ranks.length - 1] : 0;
  let maxRows = 1;
  groups.forEach(function (v) { if (v.length > maxRows) maxRows = v.length; });

  const svgW = (maxRank + 1) * (PERT_NW + PERT_GX) + PERT_PAD * 2;
  const svgH = maxRows * (PERT_NH + PERT_GY) + PERT_PAD * 2;

  const pos = new Map();
  ranks.forEach(function (r) {
    groups.get(r).forEach(function (t, i) {
      pos.set(t.id, { x: PERT_PAD + r * (PERT_NW + PERT_GX), y: PERT_PAD + i * (PERT_NH + PERT_GY) });
    });
  });

  /* ---- panah ---- */
  let edges = '';
  leaves.forEach(function (t) {
    const to = pos.get(t.id);
    const sr = sched.res.get(t.id);
    if (!to || !sr) return;
    (sched.usedPreds.get(t.id) || []).forEach(function (p) {
      const from = pos.get(p.src);
      const pr = sched.res.get(p.src);
      if (!from || !pr) return;
      const x1 = from.x + PERT_NW, y1 = from.y + PERT_NH / 2;
      const x2 = to.x, y2 = to.y + PERT_NH / 2;
      const isCrit = App.highlightCritical && pr.critical && sr.critical;
      const cls = 'pert-edge' + (p.type === 'SS' ? ' ss' : '') + (isCrit ? ' crit' : '');
      const d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 50) + ' ' + y1 + ', ' + (x2 - 50) + ' ' + y2 + ', ' + x2 + ' ' + y2;
      const label = p.type + (p.lag ? '+' + p.lag : '+0');
      edges += '<path class="' + cls + '" d="' + d + '" marker-end="url(#' + (isCrit ? 'parwc' : 'parw') + ')">' +
        '<title>' + esc(t.name + ' ← ' + ((Store.taskById(p.src) || {}).name || p.src) + ' · ' + label) + '</title></path>' +
        '<text class="pert-elabel" x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2 - 7) + '" text-anchor="middle">' + label + '</text>';
    });
  });

  /* ---- kotak aktivitas ---- */
  let nodes = '';
  leaves.forEach(function (t) {
    const p = pos.get(t.id);
    const r = sched.res.get(t.id);
    if (!p || !r) return;
    const crit = r.critical;
    const w = PERT_NW, h = PERT_NH;
    const colW = w / 3;
    const rowsY = [27, 59];
    const cellH = 32;

    let cells = '';
    const defs = [
      { label: 'ES', val: shortD(r.startDate), cls: '' },
      { label: 'Durasi', val: r.dur + ' hr', cls: '' },
      { label: 'EF', val: shortD(r.endDate), cls: '' },
      { label: 'LS', val: shortD(r.lateStartDate), cls: '' },
      { label: 'Slack', val: r.slack + ' hr', cls: 'sl' + (r.slack === 0 ? ' bad' : '') },
      { label: 'LF', val: shortD(r.lateEndDate), cls: '' }
    ];
    defs.forEach(function (c, i) {
      const cx = (i % 3) * colW;
      const cy = rowsY[Math.floor(i / 3)];
      cells += '<rect class="cell" x="' + (cx + 1) + '" y="' + cy + '" width="' + (colW - 2) + '" height="' + (cellH - 1) + '"/>' +
        '<text class="lb" x="' + (cx + colW / 2) + '" y="' + (cy + 12) + '" text-anchor="middle">' + c.label + '</text>' +
        '<text class="vl ' + c.cls + '" x="' + (cx + colW / 2) + '" y="' + (cy + 27) + '" text-anchor="middle">' + c.val + '</text>';
    });

    nodes += '<g class="pert-node' + (crit ? ' crit' : '') + '" transform="translate(' + p.x + ',' + p.y + ')">' +
      '<title>' + esc(t.name + '\n' + humanD(r.startDate) + ' → ' + humanD(r.endDate) + '\n' +
        (crit ? 'JALUR KRITIS (slack 0)' : 'Slack ' + r.slack + ' hari')) + '</title>' +
      '<rect class="box" x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="8"/>' +
      '<rect class="hdr" x="1" y="1" width="' + (w - 2) + '" height="26" rx="8"/>' +
      '<rect class="hdr" x="1" y="15" width="' + (w - 2) + '" height="12"/>' +
      '<text class="nm" x="9" y="18">' + esc(trimStr(t.name, 27)) + '</text>' +
      cells +
      '</g>';
  });

  host.innerHTML =
    '<svg class="pert-svg" width="' + svgW + '" height="' + svgH + '" role="img" aria-label="Diagram PERT">' +
      '<defs>' +
        '<marker id="parw" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#94a3b8"/></marker>' +
        '<marker id="parwc" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker>' +
      '</defs>' +
      edges + nodes +
    '</svg>' +
    '<div class="pert-legend">' +
      '<span><b>ES</b> earliest start &middot; <b>EF</b> earliest finish &middot; <b>LS</b> latest start &middot; <b>LF</b> latest finish</span>' +
      '<span><i></i>FS (Finish-to-Start)</span>' +
      '<span><i style="border-top-style:dashed"></i>SS (Start-to-Start)</span>' +
      '<span style="color:#dc2626">&#9632; jalur kritis / slack 0</span>' +
    '</div>';
}
