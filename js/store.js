'use strict';

const PRIORITY_META = {
  kritis: { label: 'Kritis', color: '#dc2626' },
  tinggi: { label: 'Tinggi', color: '#f97316' },
  sedang: { label: 'Sedang', color: '#2563eb' },
  rendah: { label: 'Rendah', color: '#16a34a' }
};
const PRIORITY_ORDER = ['kritis', 'tinggi', 'sedang', 'rendah'];

const Store = {
  KEY: 'freebuff.gantt.v1',
  state: null,

  emptyState: function () {
    return {
      project: { name: 'Proyek Baru' },
      calendar: { weekendDays: [0, 6], holidays: [] },
      tasks: [],
      resources: []
    };
  },

  /* ---------- persistensi ---------- */
  load: function () {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.resources)) {
          this.state = this.sanitize(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca data tersimpan:', e);
    }
    this.state = this.seed();
    this.save();
  },

  save: function () {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Gagal menyimpan:', e);
    }
  },

  sanitize: function (s) {
    const base = this.emptyState();
    const out = {
      project: Object.assign(base.project, s.project || {}),
      calendar: {
        weekendDays: Array.isArray(s.calendar && s.calendar.weekendDays) ? s.calendar.weekendDays.slice() : [0, 6],
        holidays: Array.isArray(s.calendar && s.calendar.holidays) ? s.calendar.holidays.filter(function (h) { return h && h.date; }) : []
      },
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      resources: Array.isArray(s.resources) ? s.resources : []
    };
    out.tasks.forEach(function (t) {
      t.predecessors = Array.isArray(t.predecessors) ? t.predecessors : [];
      t.resources = Array.isArray(t.resources) ? t.resources : [];
      if (!PRIORITY_META[t.priority]) t.priority = 'sedang';
      if (!t.color) t.color = PRIORITY_META[t.priority].color;
      t.duration = Math.max(1, parseInt(t.duration, 10) || 1);
      t.start = t.start || todayStr();
    });
    /* induk yang tidak ada -> jadi tugas utama (mencegah pohon rusak) */
    const ids = {};
    out.tasks.forEach(function (t) { ids[t.id] = true; });
    out.tasks.forEach(function (t) { if (t.parent && !ids[t.parent]) t.parent = null; });
    return out;
  },

  reset: function () {
    this.state = this.seed();
    this.save();
  },

  clearAll: function () {
    this.state = this.emptyState();
    this.save();
  },

  importState: function (obj) {
    if (!obj || !Array.isArray(obj.tasks) || !Array.isArray(obj.resources)) {
      throw new Error('Format file tidak dikenali (field tasks/resources hilang).');
    }
    this.state = this.sanitize(obj);
    this.save();
  },

  /* ---------- akses ---------- */
  taskById: function (id) {
    return this.state.tasks.find(function (t) { return t.id === id; }) || null;
  },
  childrenOf: function (pid) {
    return this.state.tasks.filter(function (t) { return (t.parent || null) === (pid || null); });
  },
  isSummary: function (t) {
    return this.state.tasks.some(function (x) { return x.parent === t.id; });
  },
  descendants: function (id) {
    const out = [];
    let stack = this.childrenOf(id).slice();
    const seen = {};
    seen[id] = true;
    while (stack.length) {
      const c = stack.shift();
      if (seen[c.id]) continue;
      seen[c.id] = true;
      out.push(c);
      stack = stack.concat(this.childrenOf(c.id));
    }
    return out;
  },
  depthOf: function (t) {
    let d = 0;
    let cur = t;
    let guard = 0;
    while (cur && cur.parent && guard++ < 100) {
      cur = this.taskById(cur.parent);
      if (!cur) break;
      d++;
    }
    return d;
  },
  setParent: function (task, parentId) {
    task.parent = parentId || null;
  },

  upsertTask: function (task) {
    const idx = this.state.tasks.findIndex(function (t) { return t.id === task.id; });
    if (idx >= 0) this.state.tasks[idx] = task;
    else this.state.tasks.push(task);
    this.save();
  },

  removeTask: function (id) {
    const gone = {};
    gone[id] = true;
    this.descendants(id).forEach(function (d) { gone[d.id] = true; });
    this.state.tasks = this.state.tasks.filter(function (t) { return !gone[t.id]; });
    this.state.tasks.forEach(function (t) {
      t.predecessors = t.predecessors.filter(function (p) { return !gone[p.taskId]; });
    });
    this.save();
  },

  addSubtask: function (parent) {
    const t = {
      id: uid('t'),
      name: 'Sub-tugas baru',
      note: '',
      priority: parent.priority || 'sedang',
      color: parent.color || PRIORITY_META[parent.priority || 'sedang'].color,
      start: parent.start || todayStr(),
      duration: 3,
      parent: parent.id,
      predecessors: [],
      resources: []
    };
    this.state.tasks.push(t);
    this.save();
    return t;
  },

  upsertResource: function (r) {
    const idx = this.state.resources.findIndex(function (x) { return x.id === r.id; });
    if (idx >= 0) this.state.resources[idx] = r;
    else this.state.resources.push(r);
    this.save();
  },

  removeResource: function (id) {
    this.state.resources = this.state.resources.filter(function (r) { return r.id !== id; });
    this.state.tasks.forEach(function (t) {
      t.resources = (t.resources || []).filter(function (x) { return x !== id; });
    });
    this.save();
  },

  addHoliday: function (date, name) {
    this.state.calendar.holidays.push({ id: uid('h'), date: date, name: name });
    this.state.calendar.holidays.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    this.save();
  },
  removeHoliday: function (id) {
    this.state.calendar.holidays = this.state.calendar.holidays.filter(function (h) { return h.id !== id; });
    this.save();
  },

  /* ---------- data contoh ---------- */
  seed: function () {
    const s = this.emptyState();
    s.project = { name: 'Implementasi Sistem ERP' };
    s.calendar.holidays = (function () {
      const y = new Date().getFullYear();
      return [
        { id: uid('h'), date: y + '-01-01', name: 'Tahun Baru' },
        { id: uid('h'), date: y + '-08-17', name: 'HUT Kemerdekaan' },
        { id: uid('h'), date: y + '-12-25', name: 'Natal' }
      ];
    })();

    s.resources = [
      { id: 'r1', name: 'Andi Prasetyo', email: 'andi@contoh.id', role: 'Project Manager', salary: 15000000 },
      { id: 'r2', name: 'Budi Santoso', email: 'budi@contoh.id', role: 'Frontend Developer', salary: 12000000 },
      { id: 'r3', name: 'Citra Lestari', email: 'citra@contoh.id', role: 'Backend Developer', salary: 13000000 },
      { id: 'r4', name: 'Dina Anggraini', email: 'dina@contoh.id', role: 'UI/UX Designer', salary: 10000000 },
      { id: 'r5', name: 'Eka Wijaya', email: 'eka@contoh.id', role: 'QA Engineer', salary: 9000000 }
    ];

    /* mulai Senin minggu depan, agar selalu terlihat "mendatang" */
    const now = new Date();
    let off = (8 - now.getDay()) % 7;
    if (off === 0) off = 7;
    const start = fmtD(addDaysD(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())), off));
    const we = [0, 6];
    function w(n) { /* hari kerja ke-n setelah start */
      let d = parseD(start);
      let c = 0;
      let guard = 0;
      while (c < n && guard++ < 4000) {
        d = addDaysD(d, 1);
        if (we.indexOf(d.getUTCDay()) < 0) c++;
      }
      return fmtD(d);
    }
    function T(o) {
      return {
        id: o.id, name: o.name, note: o.note || '', priority: o.priority,
        color: o.color || PRIORITY_META[o.priority].color,
        start: o.start, duration: o.duration, parent: o.parent || null,
        predecessors: o.predecessors || [], resources: o.resources || []
      };
    }

    s.tasks = [
      T({ id: 'p1', name: 'Analisis & Perancangan', note: 'Tahap awal proyek', priority: 'tinggi', start: w(0), duration: 10 }),
      T({ id: 't1', name: 'Pengumpulan Kebutuhan', note: 'Wawancara stakeholder & inventarisasi kebutuhan bisnis', priority: 'tinggi', start: w(0), duration: 5, parent: 'p1', resources: ['r1', 'r4'] }),
      T({ id: 't2', name: 'Perancangan UI/UX', note: 'Wireframe dan prototipe high-fidelity', priority: 'sedang', start: w(5), duration: 7, parent: 'p1', predecessors: [{ taskId: 't1', type: 'FS', lag: 0 }], resources: ['r4', 'r1'] }),
      T({ id: 't3', name: 'Dokumen Spesifikasi Teknis', note: 'Spesifikasi API, skema data, dan non-fungsional', priority: 'sedang', start: w(5), duration: 4, parent: 'p1', predecessors: [{ taskId: 't2', type: 'SS', lag: 2 }], resources: ['r1', 'r3'] }),

      T({ id: 'p2', name: 'Pengembangan', note: 'Tahap implementasi', priority: 'kritis', start: w(10), duration: 20 }),
      T({ id: 't4', name: 'Setup Environment & Database', note: 'CI/CD, server, migrasi skema dasar', priority: 'tinggi', start: w(10), duration: 4, parent: 'p2', predecessors: [{ taskId: 't2', type: 'FS', lag: 0 }], resources: ['r2', 'r3'] }),
      T({ id: 't5', name: 'Modul Frontend', note: 'Halaman utama, master data, dan dasbor', priority: 'kritis', start: w(14), duration: 10, parent: 'p2', predecessors: [{ taskId: 't4', type: 'FS', lag: 0 }], resources: ['r2'] }),
      T({ id: 't6', name: 'Modul Backend / API', note: 'REST API, otorisasi, dan bisnis logika', priority: 'kritis', start: w(16), duration: 12, parent: 'p2', predecessors: [{ taskId: 't5', type: 'SS', lag: 2 }], resources: ['r3'] }),
      T({ id: 't7', name: 'Integrasi Sistem', note: 'Integrasi modul & sistem eksternal', priority: 'tinggi', start: w(28), duration: 6, parent: 'p2', predecessors: [{ taskId: 't6', type: 'FS', lag: 0 }], resources: ['r2', 'r3'] }),

      T({ id: 'p3', name: 'Pengujian & Peluncuran', note: 'Tahap akhir', priority: 'kritis', start: w(34), duration: 15 }),
      T({ id: 't8', name: 'Pengujian UAT', note: 'Uji penerimaan pengguna', priority: 'kritis', start: w(34), duration: 5, parent: 'p3', predecessors: [{ taskId: 't7', type: 'FS', lag: 0 }], resources: ['r5', 'r1'] }),
      T({ id: 't9', name: 'Perbaikan Bug UAT', note: 'Iterasi perbaikan temuan UAT', priority: 'kritis', start: w(39), duration: 5, parent: 'p3', predecessors: [{ taskId: 't8', type: 'FS', lag: 0 }], resources: ['r2', 'r5'] }),
      T({ id: 't10', name: 'Dokumentasi & Pelatihan', note: 'User guide dan pelatihan pengguna', priority: 'rendah', start: w(24), duration: 6, parent: 'p3', predecessors: [{ taskId: 't5', type: 'FS', lag: 0 }], resources: ['r4', 'r1'] }),
      T({ id: 't11', name: 'Go-Live & Serah Terima', note: 'Rilis produksi dan serah terima ke klien', priority: 'kritis', start: w(44), duration: 3, parent: 'p3', predecessors: [{ taskId: 't9', type: 'FS', lag: 0 }, { taskId: 't10', type: 'FS', lag: 0 }], resources: ['r1', 'r5'] })
    ];

    return this.sanitize(s);
  }
};
