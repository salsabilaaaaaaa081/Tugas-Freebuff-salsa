'use strict';
/* Mesin jadwal: kalender hari kerja + CPM (forward/backward pass), jalur kritis */

const EPOCH_MS = Date.UTC(2000, 0, 1); /* Senin? -> 1 Jan 2000 = Sabtu; dipakai hanya sebagai titik awal */

function isDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function buildCalendar(calCfg) {
  const cfg = calCfg || {};
  const weekendDays = new Set(Array.isArray(cfg.weekendDays) ? cfg.weekendDays : [0, 6]);
  const holidays = (Array.isArray(cfg.holidays) ? cfg.holidays : [])
    .map(function (h) { return h && h.date; })
    .filter(isDateStr);
  const holidaySet = new Set(holidays);
  const countCache = new Map();

  function isWorkingDate(d) {
    if (weekendDays.has(d.getUTCDay())) return false;
    if (holidaySet.has(fmtD(d))) return false;
    return true;
  }
  function isWorkingStr(s) { return isDateStr(s) && isWorkingDate(parseD(s)); }

  /* jumlah hari kerja dalam [2000-01-01, dateStr) */
  function countBefore(dateStr) {
    const cached = countCache.get(dateStr);
    if (cached !== undefined) return cached;
    let count = 0;
    const t = parseD(dateStr).getTime();
    if (!isNaN(t) && t > EPOCH_MS) {
      const days = Math.floor((t - EPOCH_MS) / DAY_MS);
      const weeks = Math.floor(days / 7);
      const rem = days - weeks * 7;
      count = weeks * (7 - weekendDays.size);
      for (let i = 0; i < rem; i++) {
        const wd = new Date(EPOCH_MS + i * DAY_MS).getUTCDay();
        if (!weekendDays.has(wd)) count++;
      }
      for (let i = 0; i < holidays.length; i++) {
        const ht = parseD(holidays[i]).getTime();
        /* hari libur yang jatuh di akhir pekan sudah tercakup weekend, jangan dikurangi dua kali */
        if (ht >= EPOCH_MS && ht < t && !weekendDays.has(new Date(ht).getUTCDay())) count--;
      }
    }
    countCache.set(dateStr, count);
    return count;
  }

  function nextWorkingDate(d) {
    let x = d;
    let guard = 0;
    while (!isWorkingDate(x) && guard++ < 5000) x = addDaysD(x, 1);
    return x;
  }

  /* indeks hari kerja untuk tanggal (dibulatkan ke hari kerja berikutnya) */
  function toIndex(dateStr) {
    if (!isDateStr(dateStr)) dateStr = todayStr();
    return countBefore(fmtD(nextWorkingDate(parseD(dateStr))));
  }

  /* tanggal hari kerja ke-i (0-based) */
  function fromDate(index) {
    if (!isFinite(index) || index <= 0) return fmtD(nextWorkingDate(new Date(EPOCH_MS)));
    let lo = 0;
    let hi = 365 * 120; /* sampai ~tahun 2120 */
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const ds = fmtD(new Date(EPOCH_MS + mid * DAY_MS));
      if (countBefore(ds) >= index) hi = mid; else lo = mid + 1;
    }
    return fmtD(nextWorkingDate(new Date(EPOCH_MS + lo * DAY_MS)));
  }

  /* tanggal selesai bila mulai pada startStr dan durasi dur hari kerja */
  function endDateOf(startStr, duration) {
    const dur = Math.max(1, parseInt(duration, 10) || 1);
    return fromDate(toIndex(startStr) + dur - 1);
  }

  /* jumlah hari kerja inklusif antara dua tanggal */
  function workdaysInclusive(aStr, bStr) {
    if (!isDateStr(aStr) || !isDateStr(bStr) || bStr < aStr) return 0;
    return toIndex(bStr) - toIndex(aStr) + 1;
  }

  return {
    weekendDays: weekendDays,
    holidaySet: holidaySet,
    isWorkingDate: isWorkingDate,
    isWorkingStr: isWorkingStr,
    countBefore: countBefore,
    toIndex: toIndex,
    fromDate: fromDate,
    endDateOf: endDateOf,
    workdaysInclusive: workdaysInclusive,
    nextWorkingDate: nextWorkingDate
  };
}

/* ---------------- CPM ---------------- */
function computeSchedule(state) {
  const cal = buildCalendar(state.calendar || { weekendDays: [0, 6], holidays: [] });
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const warnings = [];
  const res = new Map();

  const byId = new Map();
  tasks.forEach(function (t) { byId.set(t.id, t); });

  const childMap = new Map();
  tasks.forEach(function (t) {
    if (t.parent && byId.has(t.parent)) {
      if (!childMap.has(t.parent)) childMap.set(t.parent, []);
      childMap.get(t.parent).push(t);
    }
  });
  const isSummary = function (t) { return childMap.has(t.id); };

  function localDepth(t) {
    let d = 0;
    let cur = t;
    let guard = 0;
    while (cur && cur.parent && byId.has(cur.parent) && guard++ < 200) {
      cur = byId.get(cur.parent);
      d++;
    }
    return d;
  }
  function leafDescendants(id) {
    const out = [];
    const seen = {};
    seen[id] = true;
    const stack = (childMap.get(id) || []).slice();
    while (stack.length) {
      const c = stack.pop();
      if (seen[c.id]) continue;
      seen[c.id] = true;
      if (childMap.has(c.id)) {
        const kids = childMap.get(c.id);
        for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
      } else out.push(c);
    }
    return out;
  }
  function isDescendantOf(candidateId, rootId) {
    let cur = byId.get(candidateId);
    let guard = 0;
    while (cur && guard++ < 500) {
      if (cur.id === rootId) return true;
      cur = cur.parent ? byId.get(cur.parent) : null;
    }
    return false;
  }
  function earliestOf(list) {
    let best = null;
    list.forEach(function (t) {
      if (!best) { best = t; return; }
      if ((t.start || '') < (best.start || '')) best = t;
    });
    return best;
  }

  /* ---- resolusi predecessor -> hanya antar aktivitas (daun) ---- */
  const resolved = new Map();     /* taskId -> [{src,type,lag}] */
  const edgeSeen = new Map();     /* taskId -> Set(key) */
  function addEdge(toId, srcId, type, lag) {
    if (!byId.has(toId) || !byId.has(srcId) || toId === srcId) return;
    if (!edgeSeen.has(toId)) edgeSeen.set(toId, new Set());
    const key = srcId + '|' + type;
    if (edgeSeen.get(toId).has(key)) return;
    edgeSeen.get(toId).add(key);
    if (!resolved.has(toId)) resolved.set(toId, []);
    resolved.get(toId).push({ src: srcId, type: type, lag: lag });
  }

  tasks.forEach(function (t) {
    const preds = Array.isArray(t.predecessors) ? t.predecessors : [];
    if (!preds.length) return;

    /* daun yang menerima batasan untuk tugas ini */
    const targets = isSummary(t) ? leafDescendants(t.id) : [t];
    if (isSummary(t) && !targets.length) return;

    preds.forEach(function (p) {
      if (!p || !p.taskId) return;
      const src = byId.get(p.taskId);
      if (!src) return;
      if (src.id === t.id) return;
      if (isDescendantOf(src.id, t.id)) {
        warnings.push('Dependensi "' + src.name + '" → "' + t.name + '" diabaikan (berbentuk hierarki).');
        return;
      }
      const type = p.type === 'SS' ? 'SS' : 'FS';
      const lag = Math.max(0, Math.min(365, parseInt(p.lag, 10) || 0));
      let srcs = isSummary(src) ? leafDescendants(src.id) : [src];
      /* buang daun sumber yang justru ada di dalam sub-tugas target
         (mis. induk yang satu-satunya anak = tugas ini sendiri) */
      const before = srcs.length;
      srcs = srcs.filter(function (x) { return x.id !== t.id; });
      if (srcs.length !== before) {
        warnings.push('Dependensi "' + src.name + '" → "' + t.name + '" diabaikan (berbentuk hierarki).');
      }
      if (!srcs.length) return;

      if (type === 'SS') {
        /* SS: cukup satu pasang "paling awal" agar tidak kebablasan mengikat semua cabang */
        const a = earliestOf(srcs);
        const b = isSummary(t) ? earliestOf(targets) : t;
        addEdge(b.id, a.id, 'SS', lag);
      } else {
        /* FS: setelah selesai -> semua daun sumber harus selesai sebelum semua daun target mulai */
        targets.forEach(function (tt) {
          srcs.forEach(function (ss) { addEdge(tt.id, ss.id, 'FS', lag); });
        });
      }
    });
  });

  /* ---- topological sort (Kahn) + pemutusan siklus ---- */
  const indeg = new Map();
  const adj = new Map();
  tasks.forEach(function (t) { indeg.set(t.id, 0); adj.set(t.id, []); });
  resolved.forEach(function (edges, toId) {
    edges.forEach(function (e) {
      if (!indeg.has(e.src) || !indeg.has(toId)) return;
      adj.get(e.src).push(toId);
      indeg.set(toId, indeg.get(toId) + 1);
    });
  });

  const order = [];
  const processed = new Set();
  const usedPreds = new Map();
  tasks.forEach(function (t) { usedPreds.set(t.id, []); });

  const q = [];
  tasks.forEach(function (t) { if (indeg.get(t.id) === 0) q.push(t.id); });
  let qi = 0;
  while (true) {
    let id;
    if (qi < q.length) {
      id = q[qi++];
    } else {
      let rem = null;
      for (let i = 0; i < tasks.length; i++) {
        if (!processed.has(tasks[i].id)) { rem = tasks[i]; break; }
      }
      if (!rem) break;
      id = rem.id;
      warnings.push('Siklus dependensi terdeteksi — relasi masuk "' + rem.name + '" diabaikan agar jadwal tetap dihitung.');
    }
    if (processed.has(id)) continue;
    processed.add(id);
    order.push(id);
    const edges = resolved.get(id) || [];
    for (let i = 0; i < edges.length; i++) {
      if (processed.has(edges[i].src)) usedPreds.get(id).push(edges[i]);
    }
    const next = adj.get(id) || [];
    for (let i = 0; i < next.length; i++) {
      const s = next[i];
      indeg.set(s, indeg.get(s) - 1);
      if (indeg.get(s) === 0 && !processed.has(s)) q.push(s);
    }
  }

  /* ---- forward pass ---- */
  order.forEach(function (id) {
    const t = byId.get(id);
    const dur = Math.max(1, parseInt(t.duration, 10) || 1);
    let es = cal.toIndex(t.start);
    const preds = usedPreds.get(id) || [];
    for (let i = 0; i < preds.length; i++) {
      const p = preds[i];
      const pr = res.get(p.src);
      if (!pr) continue;
      if (p.type === 'SS') es = Math.max(es, pr.es + p.lag);
      else es = Math.max(es, pr.ef + 1 + p.lag);
    }
    res.set(id, { es: es, ef: es + dur - 1, dur: dur, ls: es, lf: es + dur - 1, slack: 0, critical: false, summary: false });
  });

  /* ---- backward pass (hanya aktivitas daun; ringkasan menyusul dari anak) ---- */
  const succ = new Map();
  order.forEach(function (id) { succ.set(id, []); });
  order.forEach(function (id) {
    const preds = usedPreds.get(id) || [];
    preds.forEach(function (p) { succ.get(p.src).push({ to: id, type: p.type, lag: p.lag }); });
  });

  let finish = -Infinity;
  order.forEach(function (id) {
    const t = byId.get(id);
    if (isSummary(t)) return;
    const r = res.get(id);
    if (r && r.ef > finish) finish = r.ef;
  });
  if (finish === -Infinity) finish = 0;

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const t = byId.get(id);
    if (isSummary(t)) continue;
    const r = res.get(id);
    if (!r) continue;

    const ss = succ.get(id) || [];
    let lf = finish;
    let minLf = Infinity;
    for (let k = 0; k < ss.length; k++) {
      const s = ss[k];
      const sr = res.get(s.to);
      if (!sr) continue;
      if (s.type === 'SS') minLf = Math.min(minLf, sr.ls - s.lag + r.dur - 1);
      else minLf = Math.min(minLf, sr.ls - 1 - s.lag);
    }
    if (minLf !== Infinity) lf = minLf;

    let ls = lf - r.dur + 1;
    const manual = cal.toIndex(t.start);
    if (ls < manual) { ls = manual; lf = ls + r.dur - 1; } /* batas mulai manual ikut ditegakkan */
    r.ls = ls;
    r.lf = lf;
    r.slack = Math.max(0, ls - r.es);
    r.critical = r.slack === 0;
  }

  /* ---- rollup ringkasan (anak -> induk), dalam-dulu ---- */
  tasks.filter(isSummary).sort(function (a, b) { return localDepth(b) - localDepth(a); }).forEach(function (t) {
    const kids = childMap.get(t.id) || [];
    const vals = [];
    kids.forEach(function (k) { const v = res.get(k.id); if (v) vals.push(v); });
    if (!vals.length) return;
    let es = Infinity, ef = -Infinity, slack = Infinity;
    vals.forEach(function (v) {
      if (v.es < es) es = v.es;
      if (v.ef > ef) ef = v.ef;
      const s = typeof v.slack === 'number' ? v.slack : 0;
      if (s < slack) slack = s;
    });
    const r = res.get(t.id) || {};
    r.es = es; r.ef = ef; r.dur = ef - es + 1;
    r.ls = es; r.lf = ef;
    r.slack = slack;
    r.critical = slack === 0;
    r.summary = true;
    res.set(t.id, r);
  });

  /* ---- lampirkan tanggal kalender ---- */
  res.forEach(function (r) {
    if (typeof r.es !== 'number' || typeof r.ef !== 'number') return;
    if (r.ls == null) { r.ls = r.es; r.lf = r.ef; }
    r.startDate = cal.fromDate(r.es);
    r.endDate = cal.fromDate(r.ef);
    r.lateStartDate = cal.fromDate(r.ls);
    r.lateEndDate = cal.fromDate(r.lf);
    r.dur = r.ef - r.es + 1;
  });

  /* ---- statistik ---- */
  let minEs = Infinity, maxEf = -Infinity;
  res.forEach(function (r) {
    if (typeof r.es === 'number' && r.es < minEs) minEs = r.es;
    if (typeof r.ef === 'number' && r.ef > maxEf) maxEf = r.ef;
  });
  if (minEs === Infinity) { minEs = 0; maxEf = 0; }

  let criticalCount = 0;
  tasks.forEach(function (t) {
    const r = res.get(t.id);
    if (!isSummary(t) && r && r.critical) criticalCount++;
  });

  const stats = {
    total: tasks.length,
    leaves: tasks.filter(function (t) { return !isSummary(t); }).length,
    summaries: tasks.filter(isSummary).length,
    critical: criticalCount,
    startDate: cal.fromDate(minEs),
    endDate: cal.fromDate(maxEf),
    workdays: maxEf - minEs + 1,
    cost: estimateCost(state)
  };

  return {
    cal: cal,
    res: res,
    order: order,
    usedPreds: usedPreds,
    warnings: warnings,
    stats: stats,
    isSummary: isSummary
  };
}

/* estimasi biaya = (gaji bulanan / 22) x durasi hari kerja, per alokasi */
function estimateCost(state) {
  let total = 0;
  (state.tasks || []).forEach(function (t) {
    const dur = Math.max(1, parseInt(t.duration, 10) || 1);
    (t.resources || []).forEach(function (rid) {
      const r = (state.resources || []).find(function (x) { return x.id === rid; });
      if (r) total += ((Number(r.salary) || 0) / WD_PER_MONTH) * dur;
    });
  });
  return Math.round(total);
}

/* alokasi per anggota: daftar tugas, total hari kerja, estimasi biaya */
function resourceAllocations(state) {
  const map = new Map();
  (state.resources || []).forEach(function (r) {
    map.set(r.id, { resource: r, tasks: [], days: 0, cost: 0 });
  });
  (state.tasks || []).forEach(function (t) {
    const dur = Math.max(1, parseInt(t.duration, 10) || 1);
    (t.resources || []).forEach(function (rid) {
      const bucket = map.get(rid);
      if (!bucket) return;
      bucket.tasks.push(t);
      bucket.days += dur;
      bucket.cost += ((Number(bucket.resource.salary) || 0) / WD_PER_MONTH) * dur;
    });
  });
  return map;
}
