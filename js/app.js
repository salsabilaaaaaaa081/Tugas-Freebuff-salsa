'use strict';
/* Orkestrasi aplikasi: init, tab, event delegation, ekspor/impor */

const ZOOM_LEVELS = [22, 28, 30, 34, 44];

const App = {
  sched: null,
  zoom: 30,
  highlightCritical: true,
  filterPrio: 'all',
  search: '',
  collapsed: new Set(),
  activeTab: 'gantt',
  calCursor: null,

  refresh: function () {
    this.sched = computeSchedule(Store.state);

    const pn = document.getElementById('projectName');
    if (document.activeElement !== pn) pn.value = Store.state.project.name || '';

    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === App.activeTab);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.hidden = p.id !== 'tab-' + App.activeTab;
    });

    const ct = document.getElementById('criticalToggle');
    if (ct) ct.checked = !!this.highlightCritical;
    const fp = document.getElementById('filterPrio');
    if (fp && fp.value !== this.filterPrio) fp.value = this.filterPrio;
    const si = document.getElementById('searchInput');
    if (si && document.activeElement !== si && si.value !== this.search) si.value = this.search;

    if (this.activeTab === 'gantt') renderGantt();
    else if (this.activeTab === 'team') Resources.render();
    else if (this.activeTab === 'calendar') CalUI.render();
    else if (this.activeTab === 'analysis') { Analysis.render(); renderPert(); }
  },

  setTab: function (name) {
    this.activeTab = name;
    this.refresh();
  },

  init: function () {
    Store.load();
    Tasks.bind();
    Resources.bind();
    bindGlobalEvents();
    this.refresh();
  }
};

function showToast(msg, kind) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(function () { el.remove(); }, 2800);
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach(function (m) { m.hidden = true; });
}

function bindGlobalEvents() {
  /* ---------- klik ---------- */
  document.addEventListener('click', function (e) {
    const closer = e.target.closest('[data-close]');
    if (closer) {
      const bd = closer.closest('.modal-backdrop');
      if (bd) bd.hidden = true;
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.hidden = true;
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.action;

    switch (act) {
      case 'tab':
        App.setTab(btn.dataset.tab);
        break;

      case 'task-new':
        Tasks.openNew(null);
        break;
      case 'task-sub':
        Tasks.openNew(id);
        break;
      case 'task-edit':
        Tasks.openEdit(id);
        break;
      case 'task-del':
        Tasks.remove(id);
        break;
      case 'toggle-row':
        if (App.collapsed.has(id)) App.collapsed.delete(id); else App.collapsed.add(id);
        App.refresh();
        break;
      case 'pred-add':
        Tasks.addPred();
        break;

      case 'res-new':
        Resources.openNew();
        break;
      case 'res-edit':
        Resources.openEdit(id);
        break;
      case 'res-del':
        Resources.remove(id);
        break;

      case 'hol-del':
        CalUI.removeHoliday(id);
        break;
      case 'cal-prev':
        CalUI.shiftMonth(-1);
        break;
      case 'cal-next':
        CalUI.shiftMonth(1);
        break;

      case 'zoom-in': {
        const i = ZOOM_LEVELS.indexOf(App.zoom);
        App.zoom = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, (i < 0 ? 2 : i) + 1)];
        App.refresh();
        break;
      }
      case 'zoom-out': {
        const j = ZOOM_LEVELS.indexOf(App.zoom);
        App.zoom = ZOOM_LEVELS[Math.max(0, (j < 0 ? 2 : j) - 1)];
        App.refresh();
        break;
      }

      case 'show-gantt-critical':
        App.highlightCritical = true;
        App.filterPrio = 'all';
        App.search = '';
        App.setTab('gantt');
        showToast('Jalur kritis disorot merah pada Gantt.');
        break;

      case 'export': {
        const safe = String(Store.state.project.name || 'proyek').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
        downloadFile('gantt-' + safe + '-' + todayStr() + '.json', JSON.stringify(Store.state, null, 2));
        showToast('Data diekspor ke JSON.');
        break;
      }

      case 'seed':
        if (confirm('Muat data contoh akan menimpa data saat ini. Lanjutkan?')) {
          Store.reset();
          App.collapsed.clear();
          App.refresh();
          showToast('Data contoh dimuat.');
        }
        break;

      case 'reset':
        if (confirm('Hapus SEMUA data proyek (tugas, anggota, kalender)? Tindakan ini tidak bisa dibatalkan.')) {
          Store.clearAll();
          App.collapsed.clear();
          App.refresh();
          showToast('Semua data dihapus.');
        }
        break;
    }
  });

  /* ---------- perubahan ---------- */
  document.addEventListener('change', function (e) {
    const t = e.target;

    if (t.id === 'filterPrio') { App.filterPrio = t.value; App.refresh(); return; }
    if (t.id === 'criticalToggle') { App.highlightCritical = t.checked; App.refresh(); return; }
    if (t.id === 'projectName') {
      Store.state.project.name = t.value.trim() || 'Proyek Tanpa Nama';
      Store.save();
      return;
    }
    if (t.id === 'importFile') {
      const input = t;
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          Store.importState(JSON.parse(reader.result));
          App.collapsed.clear();
          App.refresh();
          showToast('Data berhasil diimpor.');
        } catch (err) {
          showToast('Impor gagal: ' + err.message, 'err');
        }
        input.value = '';
      };
      reader.onerror = function () { showToast('Gagal membaca file.', 'err'); input.value = ''; };
      reader.readAsText(file);
      return;
    }
    if (t.dataset && t.dataset.wd !== undefined && t.closest('#weekendPicks')) {
      CalUI.setWeekend(parseInt(t.dataset.wd, 10), t.checked);
    }
  });

  /* ---------- ketik ---------- */
  document.addEventListener('input', function (e) {
    if (e.target.id === 'searchInput') {
      App.search = e.target.value;
      renderGantt();
    }
  });

  /* ---------- submit form ---------- */
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'holidayForm') {
      e.preventDefault();
      CalUI.addHoliday();
    }
  });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModals();
  });
}

document.addEventListener('DOMContentLoaded', function () { App.init(); });
