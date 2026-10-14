'use strict';
/* Analisis proyek: statistik, peringatan, tabel jalur kritis */

const Analysis = {
  render: function () {
    const sched = App.sched;
    const state = Store.state;
    if (!sched) return;
    const st = sched.stats;

    document.getElementById('analysisStats').innerHTML = st.total
      ? ganttStat('Total tugas', fmtInt(st.total)) +
        ganttStat('Aktivitas', fmtInt(st.leaves)) +
        ganttStat('Tugas kritis', fmtInt(st.critical), 'crit') +
        ganttStat('Durasi proyek', fmtInt(st.workdays) + ' hari kerja') +
        ganttStat('Mulai', medD(st.startDate)) +
        ganttStat('Selesai', medD(st.endDate)) +
        ganttStat('Estimasi biaya', fmtRp(st.cost), 'ok')
      : ganttStat('Total tugas', '0');

    document.getElementById('analysisWarn').innerHTML = sched.warnings.length
      ? '<div class="warn"><b>Peringatan perhitungan jadwal</b>' +
        sched.warnings.map(function (w) { return '&#8226; ' + esc(w); }).join('<br>') + '</div>'
      : '';

    /* ---- tabel jalur kritis ---- */
    const crit = state.tasks
      .filter(function (t) { return !sched.isSummary(t); })
      .map(function (t) { return { t: t, r: sched.res.get(t.id) }; })
      .filter(function (x) { return x.r && x.r.critical; })
      .sort(function (a, b) { return a.r.es - b.r.es || a.t.name.localeCompare(b.t.name); });

    const host = document.getElementById('criticalTable');
    if (!crit.length) {
      host.innerHTML = '<p class="hint">Tidak ada tugas dengan slack 0. ' +
        'Semua tugas masih punya kelonggaran terhadap tanggal penyelesaian proyek — ' +
        'periksa apakah seluruh tugas sudah dihubungkan lewat predecessor.</p>';
      return;
    }

    let totalDur = 0;
    crit.forEach(function (x) { totalDur += x.r.dur; });

    const rows = crit.map(function (x, i) {
      const t = x.t, r = x.r;
      const prio = PRIORITY_META[t.priority] || PRIORITY_META.sedang;
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><span class="dot" style="background:' + (t.color || prio.color) + ';display:inline-block;margin-right:6px"></span><b>' + esc(t.name) + '</b></td>' +
        '<td class="num">' + r.dur + '</td>' +
        '<td>' + medD(r.startDate) + '</td>' +
        '<td>' + medD(r.endDate) + '</td>' +
        '<td class="num">' + shortD(r.lateStartDate) + '</td>' +
        '<td class="num">' + shortD(r.lateEndDate) + '</td>' +
        '<td class="num"><b style="color:#dc2626">' + r.slack + '</b></td>' +
        '<td><span class="pill prio-' + t.priority + '">' + prio.label + '</span></td>' +
      '</tr>';
    }).join('');

    host.innerHTML =
      '<p class="hint" style="margin-bottom:6px">' + crit.length + ' tugas berada pada jalur kritis ' +
      '(slack 0) dengan total durasi ' + totalDur + ' hari kerja. ' +
      'Keterlambatan satu tugas ini akan menunda seluruh proyek.</p>' +
      '<table class="tbl"><thead><tr>' +
      '<th class="num">No</th><th>Tugas</th><th class="num">Dur</th><th>Mulai</th><th>Selesai</th>' +
      '<th class="num">LS</th><th class="num">LF</th><th class="num">Slack</th><th>Prioritas</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }
};
