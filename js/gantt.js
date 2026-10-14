'use strict';
/* Renderer Gantt Chart */

const G_ROW_H = 38; /* harus sama dengan --row-h di CSS */

function ganttStat(k, v, cls) {
  return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
}

function ganttVisibleRows() {
  const q = (App.search || '').trim().toLowerCase();
  const prio = App.filterPrio || 'all';
  const filtering = !!q || prio !== 'all';
  let match = null;

  if (filtering) {
    match = new Set();
    Store.state.tasks.forEach(function (t) {
      const okP = prio === 'all' || t.priority === prio;
      const okQ = !q || String(t.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(t.note || '').toLowerCase().indexOf(q) >= 0;
      if (okP && okQ) match.add(t.id);
    });
    /* selipkan nenek moyang agar hierarki tetap terlihat */
    Array.from(match).forEach(function (id) {
      let t = Store.taskById(id);
      let guard = 0;
      while (t && t.parent && guard++ < 200) {
        match.add(t.parent);
        t = Store.taskById(t.parent);
      }
    });
  }

  const rows = [];
  const walk = function (pid, depth) {
    Store.childrenOf(pid).forEach(function (t) {
      if (match && !match.has(t.id)) return; /* tak ada keturunan yang cocok */
      rows.push({ task: t, depth: depth });
      const kids = Store.childrenOf(t.id);
      if (kids.length && (!App.collapsed.has(t.id) || filtering)) walk(t.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

function ganttLinkPath(x1, y1, x2, y2) {
  const dx = 12;
  if (x2 >= x1 + dx) return 'M ' + x1 + ' ' + y1 + ' H ' + (x1 + dx) + ' V ' + y2 + ' H ' + x2;
  return 'M ' + x1 + ' ' + y1 + ' H ' + (x1 + dx + 10) + ' V ' + y2 + ' H ' + x2;
}

function renderGantt() {
  const host = document.getElementById('ganttContainer');
  const statsHost = document.getElementById('ganttStats');
  if (!host) return;
  const sched = App.sched;
  const state = Store.state;
  if (!sched) return;

  const st = sched.stats;
  statsHost.innerHTML = st.total
    ? ganttStat('Total tugas', fmtInt(st.total)) +
      ganttStat('Jalur kritis', fmtInt(st.critical), 'crit') +
      ganttStat('Durasi proyek', fmtInt(st.workdays) + ' hr') +
      ganttStat('Rentang', shortD(st.startDate) + ' → ' + shortD(st.endDate)) +
      ganttStat('Estimasi biaya', fmtRp(st.cost))
    : ganttStat('Total tugas', '0');

  const zoomLabel = document.getElementById('zoomLabel');
  if (zoomLabel) zoomLabel.textContent = App.zoom + ' px/hari';

  if (!state.tasks.length) {
    host.innerHTML = '<div class="empty" style="margin:14px">Belum ada tugas. Klik <b>+ Tugas Baru</b> untuk memulai, ' +
      'atau <b>Muat Contoh</b> di pojok kanan atas untuk memuat proyek demo.</div>';
    return;
  }

  const rows = ganttVisibleRows();
  if (!rows.length) {
    host.innerHTML = '<div class="empty" style="margin:14px">Tidak ada tugas yang cocok dengan filter/pencarian.</div>';
    return;
  }

  const cw = App.zoom;
  const res = sched.res;
  const today = todayStr();
  const weekendDays = state.calendar.weekendDays;
  const holidaySet = new Set(state.calendar.holidays.map(function (h) { return h.date; }));

  /* ---- rentang tanggal ---- */
  let minD = null, maxD = null;
  state.tasks.forEach(function (t) {
    const r = res.get(t.id);
    if (!r) return;
    if (!minD || r.startDate < minD) minD = r.startDate;
    if (!maxD || r.endDate > maxD) maxD = r.endDate;
  });
  if (!minD) { minD = today; maxD = today; }
  const rangeStart = addDaysS(minD, -3);
  const rangeEnd = addDaysS(maxD, 8);
  const nDays = daysBetween(rangeStart, rangeEnd) + 1;
  const tw = nDays * cw;
  const rh = rows.length * G_ROW_H;

  /* ---- header ---- */
  const months = [];
  for (let i = 0; i < nDays; i++) {
    const ds = addDaysS(rangeStart, i);
    const d = parseD(ds);
    const key = d.getUTCFullYear() + '-' + d.getUTCMonth();
    const last = months[months.length - 1];
    if (last && last.key === key) {
      last.n++;
    } else {
      months.push({
        key: key, n: 1,
        label: MONTH_SHORT[d.getUTCMonth()] + ((months.length === 0 || d.getUTCMonth() === 0) ? ' ' + d.getUTCFullYear() : '')
      });
    }
  }
  const monthsHtml = months.map(function (m) {
    return '<div class="g-month" style="width:' + (m.n * cw) + 'px;flex:none">' + esc(m.label) + '</div>';
  }).join('');

  let daysHtml = '';
  for (let i = 0; i < nDays; i++) {
    const ds = addDaysS(rangeStart, i);
    const d = parseD(ds);
    const wd = d.getUTCDay();
    const cls = ['g-day'];
    if (weekendDays.indexOf(wd) >= 0) cls.push('we');
    if (holidaySet.has(ds)) cls.push('hol');
    if (ds === today) cls.push('today');
    daysHtml += '<div class="' + cls.join(' ') + '" style="width:' + cw + 'px;flex:none" title="' + humanD(ds) + '">' +
      '<b>' + d.getUTCDate() + '</b>' + (cw >= 26 ? '<span>' + WD_SHORT[wd] + '</span>' : '') + '</div>';
  }

  const headerLeft =
    '<div class="g-cell">Tugas</div>' +
    '<div class="g-cell num">Mulai</div>' +
    '<div class="g-cell num">Selesai</div>' +
    '<div class="g-cell num">Dur</div>' +
    '<div class="g-cell">Prioritas</div>' +
    '<div class="g-cell num">Aksi</div>';

  /* ---- kolom latar (akhir pekan & libur) ---- */
  let shades = '';
  for (let i = 0; i < nDays; i++) {
    const ds = addDaysS(rangeStart, i);
    const wd = parseD(ds).getUTCDay();
    const isHol = holidaySet.has(ds);
    const isWe = weekendDays.indexOf(wd) >= 0;
    if (isHol) shades += '<div class="g-shade hol" style="left:' + (i * cw) + 'px;width:' + cw + 'px"></div>';
    else if (isWe) shades += '<div class="g-shade" style="left:' + (i * cw) + 'px;width:' + cw + 'px"></div>';
  }

  /* ---- baris kiri ---- */
  const rowIndex = new Map();
  const leftRows = rows.map(function (row, i) {
    const t = row.task;
    const r = res.get(t.id);
    rowIndex.set(t.id, i);
    const kids = Store.childrenOf(t.id);
    const summary = kids.length > 0;
    const collapsed = App.collapsed.has(t.id);
    const color = t.color || (PRIORITY_META[t.priority] || PRIORITY_META.sedang).color;
    const prio = PRIORITY_META[t.priority] || PRIORITY_META.sedang;
    const onCritical = r && r.critical && App.highlightCritical;
    const avatars = (function () {
      const list = (t.resources || []).map(function (rid) {
        return state.resources.find(function (x) { return x.id === rid; });
      }).filter(Boolean);
      let h = list.slice(0, 2).map(function (rr) {
        return '<span class="avatar sm" title="' + esc(rr.name) + '">' + initials(rr.name) + '</span>';
      }).join('');
      if (list.length > 2) h += '<span class="avatar sm more" title="' + list.length + ' anggota">+' + (list.length - 2) + '</span>';
      return h;
    })();

    return '<div class="g-row g-leftgrid' + (summary ? ' summary' : '') + '"' +
      (onCritical ? ' style="box-shadow:inset 3px 0 0 #dc2626"' : '') + '>' +
      '<div class="g-cell name" style="padding-left:' + (8 + row.depth * 16) + 'px">' +
      (summary
        ? '<button class="caret' + (collapsed ? '' : ' open') + '" data-action="toggle-row" data-id="' + t.id + '" title="Buka/tutup">&#9654;</button>'
        : '<span class="caret-space"></span>') +
      '<span class="dot" style="background:' + color + '"></span>' +
      '<span class="g-title" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' +
      '<span class="avatars">' + avatars + '</span>' +
      '</div>' +
      '<div class="g-cell num">' + (r ? shortD(r.startDate) : '—') + '</div>' +
      '<div class="g-cell num">' + (r ? shortD(r.endDate) : '—') + '</div>' +
      '<div class="g-cell num">' + (r ? r.dur : t.duration) + '</div>' +
      '<div class="g-cell"><span class="pill prio-' + t.priority + '">' + prio.label + '</span></div>' +
      '<div class="g-cell g-actions">' +
      '<button class="icon-btn" data-action="task-edit" data-id="' + t.id + '" title="Ubah tugas">&#9998;</button>' +
      '<button class="icon-btn" data-action="task-sub" data-id="' + t.id + '" title="Tambah sub-tugas">+</button>' +
      '<button class="icon-btn" data-action="task-del" data-id="' + t.id + '" title="Hapus tugas">&#128465;&#65039;</button>' +
      '</div></div>';
  }).join('');

  /* ---- panah dependensi ---- */
  const xOf = function (dateStr) { return daysBetween(rangeStart, dateStr) * cw; };
  let paths = '';
  rows.forEach(function (row, i) {
    const t = row.task;
    const sr = res.get(t.id);
    if (!sr) return;
    const preds = sched.usedPreds.get(t.id) || [];
    preds.forEach(function (p) {
      const ri = rowIndex.get(p.src);
      const pr = res.get(p.src);
      if (ri === undefined || !pr) return;
      const pLeft = xOf(pr.startDate);
      const pW = (daysBetween(pr.startDate, pr.endDate) + 1) * cw;
      const sLeft = xOf(sr.startDate);
      const x1 = p.type === 'SS' ? pLeft : pLeft + pW;
      const y1 = ri * G_ROW_H + G_ROW_H / 2;
      const x2 = sLeft - 4;
      const y2 = i * G_ROW_H + G_ROW_H / 2;
      const isSS = p.type === 'SS';
      const isCrit = App.highlightCritical && pr.critical && sr.critical;
      const cls = 'lnk' + (isSS ? ' ss' : '') + (isCrit ? ' crit' : '');
      const label = (isSS ? 'SS' : 'FS') + (p.lag ? ' +' + p.lag : ' +0') + ' hari kerja';
      paths += '<path class="' + cls + '" d="' + ganttLinkPath(x1, y1, x2, y2) +
        '" marker-end="url(#' + (isCrit ? 'arwc' : 'arw') + ')"><title>' + esc(t.name + ' ← ' + (Store.taskById(p.src) || {}).name + ' · ' + label) + '</title></path>';
    });
  });

  /* ---- bar ---- */
  let bars = '';
  rows.forEach(function (row, i) {
    const t = row.task;
    const r = res.get(t.id);
    if (!r) return;
    const kids = Store.childrenOf(t.id);
    const summary = kids.length > 0;
    const color = t.color || (PRIORITY_META[t.priority] || PRIORITY_META.sedang).color;
    const left = xOf(r.startDate);
    const width = Math.max(8, (daysBetween(r.startDate, r.endDate) + 1) * cw);
    const top = i * G_ROW_H + (summary ? 12 : 7);
    const cls = 'g-bar' + (summary ? ' summary' : '') + (r.critical && App.highlightCritical && !summary ? ' crit' : '');
    const title = t.name + '\n' + humanD(r.startDate) + ' → ' + humanD(r.endDate) +
      ' (' + r.dur + ' hari kerja)\nSlack: ' + r.slack + ' hari' + (r.critical ? ' — JALUR KRITIS' : '');
    bars += '<div class="' + cls + '" data-action="task-edit" data-id="' + t.id + '" title="' + esc(title) +
      '" style="left:' + left + 'px;width:' + width + 'px;top:' + top + 'px;--bc:' + color + ';cursor:pointer">' +
      '<span class="g-bar-label">' + esc(t.name) + '</span></div>';
  });

  let todayLine = '';
  if (today >= rangeStart && today <= rangeEnd) {
    todayLine = '<div class="g-todayline" style="left:' + (daysBetween(rangeStart, today) * cw) + 'px"></div>';
  }

  host.innerHTML =
    '<div class="gantt-grid" style="--tw:' + tw + 'px">' +
      '<div class="g-corner g-leftgrid">' + headerLeft + '</div>' +
      '<div class="g-head-right" style="width:' + tw + 'px">' +
        '<div class="g-monthrow">' + monthsHtml + '</div>' +
        '<div class="g-dayrow">' + daysHtml + '</div>' +
      '</div>' +
      '<div class="g-left">' + leftRows + '</div>' +
      '<div class="g-right" style="width:' + tw + 'px;height:' + rh + 'px">' +
        shades +
        '<div class="g-rowsbg" style="--cw:' + cw + 'px"></div>' +
        todayLine +
        '<svg class="g-links" width="' + tw + '" height="' + rh + '">' +
          '<defs>' +
            '<marker id="arw" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#94a3b8"/></marker>' +
            '<marker id="arwc" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker>' +
          '</defs>' + paths +
        '</svg>' +
        bars +
      '</div>' +
    '</div>';
}
