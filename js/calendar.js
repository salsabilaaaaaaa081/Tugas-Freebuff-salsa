'use strict';
/* Kalender proyek: akhir pekan, hari libur khusus, pratinjau bulan */

const CalUI = {
  render: function () {
    CalUI.renderWeekend();
    CalUI.renderSummary();
    CalUI.renderHolidays();
    CalUI.renderPreview();
  },

  renderWeekend: function () {
    const host = document.getElementById('weekendPicks');
    const cur = Store.state.calendar.weekendDays;
    host.innerHTML = WD_LONG.map(function (name, i) {
      const on = cur.indexOf(i) >= 0;
      return '<label class="daypick' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-wd="' + i + '"' + (on ? ' checked' : '') + '>' + name + '</label>';
    }).join('');
  },

  renderSummary: function () {
    const cur = Store.state.calendar.weekendDays;
    const kerja = WD_LONG.filter(function (_, i) { return cur.indexOf(i) < 0; });
    const libur = Store.state.calendar.holidays.length;
    document.getElementById('calSummary').innerHTML =
      '<b>' + kerja.length + ' hari kerja/minggu</b> (' + esc(kerja.join(', ') || 'tanpa hari libur mingguan') + ') &middot; ' +
      libur + ' hari libur khusus terdaftar.';
  },

  renderHolidays: function () {
    const host = document.getElementById('holidayList');
    const list = Store.state.calendar.holidays.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!list.length) {
      host.innerHTML = '<p class="hint">Belum ada hari libur khusus.</p>';
      return;
    }
    host.innerHTML = '<table class="tbl"><thead><tr><th>Tanggal</th><th>Hari</th><th>Nama</th><th></th></tr></thead><tbody>' +
      list.map(function (h) {
        return '<tr>' +
          '<td>' + medD(h.date) + '</td>' +
          '<td class="muted">' + WD_LONG[parseD(h.date).getUTCDay()] + '</td>' +
          '<td><b>' + esc(h.name) + '</b></td>' +
          '<td><div class="row-actions"><button class="icon-btn" data-action="hol-del" data-id="' + h.id + '" title="Hapus">&#128465;&#65039;</button></div></td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  },

  renderPreview: function () {
    const host = document.getElementById('calPreview');
    const cur = App.calCursor || todayStr().slice(0, 7);
    const y = parseInt(cur.slice(0, 4), 10);
    const m = parseInt(cur.slice(5, 7), 10) - 1;
    const weekend = Store.state.calendar.weekendDays;
    const holidayMap = {};
    Store.state.calendar.holidays.forEach(function (h) { holidayMap[h.date] = h.name; });
    const today = todayStr();

    const first = new Date(Date.UTC(y, m, 1));
    const offset = (first.getUTCDay() + 6) % 7; /* Senin = kolom pertama */
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    const head = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
      return '<div class="cp-h">' + WD_SHORT[wd] + '</div>';
    }).join('');

    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<div class="cp-cell out"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const wd = new Date(Date.UTC(y, m, d)).getUTCDay();
      const cls = ['cp-cell'];
      if (weekend.indexOf(wd) >= 0) cls.push('we');
      if (holidayMap[ds]) cls.push('hol');
      if (ds === today) cls.push('today');
      cells += '<div class="' + cls.join(' ') + '" title="' + humanD(ds) + '">' +
        '<span class="d">' + d + '</span>' +
        (holidayMap[ds] ? '<span class="hn">' + esc(holidayMap[ds]) + '</span>' : '') +
        '</div>';
    }

    host.innerHTML =
      '<div class="toolbar">' +
        '<button class="btn ghost sm" data-action="cal-prev" title="Bulan sebelumnya">&#8249;</button>' +
        '<b>' + MONTH_LONG[m] + ' ' + y + '</b>' +
        '<button class="btn ghost sm" data-action="cal-next" title="Bulan berikutnya">&#8250;</button>' +
        '<div class="spacer"></div>' +
        '<span class="muted" style="font-size:12px">Abu = akhir pekan &middot; kuning = hari libur</span>' +
      '</div>' +
      '<div class="cp-grid">' + head + cells + '</div>';
  },

  shiftMonth: function (delta) {
    const cur = App.calCursor || todayStr().slice(0, 7);
    const y = parseInt(cur.slice(0, 4), 10);
    const m = parseInt(cur.slice(5, 7), 10) - 1 + delta;
    const d = new Date(Date.UTC(y, m, 1));
    App.calCursor = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    CalUI.renderPreview();
  },

  setWeekend: function (wd, on) {
    const list = Store.state.calendar.weekendDays.slice();
    const i = list.indexOf(wd);
    if (on && i < 0) list.push(wd);
    if (!on && i >= 0) list.splice(i, 1);
    list.sort(function (a, b) { return a - b; });
    Store.state.calendar.weekendDays = list;
    Store.save();
    App.refresh();
  },

  addHoliday: function () {
    const date = document.getElementById('hol_date').value;
    const name = document.getElementById('hol_name').value.trim();
    if (!isDateStr(date)) { showToast('Pilih tanggal hari libur.', 'err'); return; }
    if (!name) { showToast('Nama hari libur wajib diisi.', 'err'); return; }
    const dup = Store.state.calendar.holidays.some(function (h) { return h.date === date; });
    if (dup && !confirm('Tanggal tersebut sudah terdaftar sebagai hari libur. Tambahkan tetap?')) return;
    Store.addHoliday(date, name);
    document.getElementById('hol_date').value = '';
    document.getElementById('hol_name').value = '';
    showToast('Hari libur ditambahkan.');
    App.refresh();
  },

  removeHoliday: function (id) {
    if (!confirm('Hapus hari libur ini?')) return;
    Store.removeHoliday(id);
    showToast('Hari libur dihapus.');
    App.refresh();
  }
};
