'use strict';
/* Formulir tugas: tambah/ubah/hapus, sub-tugas, predecessor, alokasi anggota */

const SWATCH_COLORS = ['#dc2626', '#f97316', '#f59e0b', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b', '#0f766e'];

const Tasks = {
  draftId: null,
  editingId: null,
  pendingParent: null,

  bind: function () {
    const form = document.getElementById('taskForm');
    form.addEventListener('submit', function (e) { e.preventDefault(); Tasks.submit(); });
    form.addEventListener('input', function () { Tasks.updatePreview(); });
    form.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'tf_priority') {
        const color = document.getElementById('tf_color').value.toLowerCase();
        const isDefault = Object.keys(PRIORITY_META).some(function (k) { return PRIORITY_META[k].color.toLowerCase() === color; });
        if (isDefault) document.getElementById('tf_color').value = PRIORITY_META[e.target.value].color;
      }
      Tasks.updatePreview();
    });
    document.getElementById('tf_color').addEventListener('input', function () { Tasks.syncSwatches(); });
    document.getElementById('tf_colors').addEventListener('click', function (e) {
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      document.getElementById('tf_color').value = sw.dataset.color;
      Tasks.syncSwatches();
      Tasks.updatePreview();
    });
    document.getElementById('tf_preds').addEventListener('click', function (e) {
      const del = e.target.closest('[data-action="pred-del"]');
      if (!del) return;
      const list = Tasks.readPreds();
      list.splice(parseInt(del.dataset.idx, 10), 1);
      Tasks.renderPreds(list);
      Tasks.updatePreview();
    });
    document.getElementById('tf_preds').addEventListener('change', function () { Tasks.updatePreview(); });
    document.getElementById('tf_resources').addEventListener('change', function () { Tasks.updatePreview(); });
  },

  /* ---------- membuka ---------- */
  openNew: function (parentId) {
    Tasks.editingId = null;
    Tasks.draftId = uid('t');
    Tasks.pendingParent = parentId || null;
    document.getElementById('taskModalTitle').textContent = 'Tambah Tugas';
    document.getElementById('tf_name').value = '';
    document.getElementById('tf_start').value = todayStr();
    document.getElementById('tf_duration').value = 3;
    document.getElementById('tf_priority').value = 'sedang';
    document.getElementById('tf_color').value = PRIORITY_META.sedang.color;
    document.getElementById('tf_note').value = '';
    document.getElementById('tf_parent').value = parentId || '';
    Tasks.renderPreds([]);
    Tasks.renderResourceChecks([]);
    Tasks.openModal();
  },

  openEdit: function (id) {
    const t = Store.taskById(id);
    if (!t) return;
    Tasks.editingId = id;
    Tasks.draftId = id;
    document.getElementById('taskModalTitle').textContent = 'Ubah Tugas';
    document.getElementById('tf_name').value = t.name || '';
    document.getElementById('tf_start').value = t.start || todayStr();
    document.getElementById('tf_duration').value = t.duration || 1;
    document.getElementById('tf_priority').value = t.priority || 'sedang';
    document.getElementById('tf_color').value = t.color || PRIORITY_META[t.priority || 'sedang'].color;
    document.getElementById('tf_note').value = t.note || '';
    document.getElementById('tf_parent').value = t.parent || '';
    Tasks.renderPreds((t.predecessors || []).slice());
    Tasks.renderResourceChecks(t.resources || []);
    Tasks.openModal();
  },

  openModal: function () {
    Tasks.fillParentOptions();
    Tasks.renderSwatches();
    Tasks.syncSwatches();
    document.getElementById('taskModal').hidden = false;
    Tasks.updatePreview();
    setTimeout(function () { document.getElementById('tf_name').focus(); }, 30);
  },

  close: function () {
    document.getElementById('taskModal').hidden = true;
  },

  /* ---------- opsi induk ---------- */
  fillParentOptions: function () {
    const sel = document.getElementById('tf_parent');
    const exclude = {};
    exclude[Tasks.draftId] = true;
    Store.descendants(Tasks.draftId).forEach(function (d) { exclude[d.id] = true; });
    let html = '<option value="">— Tugas utama —</option>';
    Store.state.tasks.forEach(function (t) {
      if (exclude[t.id]) return;
      const depth = Store.depthOf(t);
      const pad = depth ? new Array(depth + 1).join('&nbsp;&nbsp;') : '';
      const suf = Store.isSummary(t) ? ' (ringkasan)' : '';
      html += '<option value="' + t.id + '">' + pad + esc(t.name) + suf + '</option>';
    });
    sel.innerHTML = html;
    const cur = Tasks.editingId ? (Store.taskById(Tasks.editingId) || {}).parent : Tasks.pendingParent;
    sel.value = cur || '';
    Tasks.pendingParent = sel.value || null;
  },

  /* ---------- predecessor ---------- */
  renderPreds: function (preds) {
    const host = document.getElementById('tf_preds');
    if (!preds.length) {
      host.innerHTML = '<p class="hint" style="margin:2px 0 8px">Belum ada predecessor — tugas ini mandiri.</p>';
      return;
    }
    host.innerHTML = preds.map(function (p, i) {
      return '<div class="pred-row">' +
        '<select data-field="taskId" aria-label="Tugas pendahulu">' + Tasks.predTaskOptions(p.taskId) + '</select>' +
        '<select data-field="type" aria-label="Jenis hubungan">' +
          '<option value="FS"' + (p.type !== 'SS' ? ' selected' : '') + '>FS</option>' +
          '<option value="SS"' + (p.type === 'SS' ? ' selected' : '') + '>SS</option>' +
        '</select>' +
        '<input data-field="lag" type="number" min="0" max="365" value="' + (parseInt(p.lag, 10) || 0) + '" title="Jeda (hari kerja)" aria-label="Jeda hari kerja">' +
        '<button type="button" class="icon-btn" data-action="pred-del" data-idx="' + i + '" title="Hapus">&times;</button>' +
        '</div>';
    }).join('');
  },

  predTaskOptions: function (selectedId) {
    const exclude = {};
    exclude[Tasks.draftId] = true;
    Store.descendants(Tasks.draftId).forEach(function (d) { exclude[d.id] = true; });
    let html = '<option value="">— pilih tugas —</option>';
    let found = !selectedId;
    Store.state.tasks.forEach(function (t) {
      if (exclude[t.id]) return;
      const suf = Store.isSummary(t) ? ' (ringkasan)' : '';
      const sel = t.id === selectedId ? ' selected' : '';
      if (sel) found = true;
      html += '<option value="' + t.id + '"' + sel + '>' + esc(t.name) + suf + '</option>';
    });
    if (!found) html += '<option value="' + selectedId + '" selected>(tidak ditemukan)</option>';
    return html;
  },

  addPred: function () {
    const list = Tasks.readPreds();
    let firstAvailable = '';
    const exclude = {};
    exclude[Tasks.draftId] = true;
    Store.descendants(Tasks.draftId).forEach(function (d) { exclude[d.id] = true; });
    Store.state.tasks.some(function (t) {
      if (exclude[t.id]) return false;
      const used = list.some(function (p) { return p.taskId === t.id; });
      if (used) return false;
      firstAvailable = t.id;
      return true;
    });
    if (!firstAvailable) {
      showToast('Semua tugas sudah menjadi predecessor.', 'err');
      return;
    }
    list.push({ taskId: firstAvailable, type: 'FS', lag: 0 });
    Tasks.renderPreds(list);
    Tasks.updatePreview();
  },

  readPreds: function () {
    const out = [];
    document.querySelectorAll('#tf_preds .pred-row').forEach(function (row) {
      const taskId = row.querySelector('[data-field="taskId"]').value;
      const type = row.querySelector('[data-field="type"]').value === 'SS' ? 'SS' : 'FS';
      const lag = Math.max(0, parseInt(row.querySelector('[data-field="lag"]').value, 10) || 0);
      if (taskId) out.push({ taskId: taskId, type: type, lag: lag });
    });
    return out;
  },

  /* ---------- alokasi ---------- */
  renderResourceChecks: function (selected) {
    const host = document.getElementById('tf_resources');
    const list = Store.state.resources;
    if (!list.length) {
      host.innerHTML = '<p class="hint">Belum ada anggota tim. Buka tab <b>Tim &amp; Alokasi</b> untuk mendaftarkan anggota.</p>';
      return;
    }
    host.innerHTML = list.map(function (r) {
      const on = selected.indexOf(r.id) >= 0;
      return '<label class="check"><input type="checkbox" value="' + r.id + '"' + (on ? ' checked' : '') + '>' +
        '<span class="avatar sm">' + initials(r.name) + '</span>' +
        '<span>' + esc(r.name) + '</span><span class="role">' + esc(r.role || '—') + '</span></label>';
    }).join('');
  },

  readResources: function () {
    const out = [];
    document.querySelectorAll('#tf_resources input[type=checkbox]').forEach(function (cb) {
      if (cb.checked) out.push(cb.value);
    });
    return out;
  },

  syncSwatches: function () {
    const cur = (document.getElementById('tf_color').value || '').toLowerCase();
    document.querySelectorAll('#tf_colors .swatch').forEach(function (sw) {
      sw.classList.toggle('on', sw.dataset.color.toLowerCase() === cur);
    });
  },

  renderSwatches: function () {
    const host = document.getElementById('tf_colors');
    host.innerHTML = SWATCH_COLORS.map(function (c) {
      return '<button type="button" class="swatch" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
    }).join('');
  },

  /* ---------- kumpulkan & simpan ---------- */
  collect: function () {
    const name = document.getElementById('tf_name').value.trim();
    const start = document.getElementById('tf_start').value;
    const duration = parseInt(document.getElementById('tf_duration').value, 10);
    if (!name) return { error: 'Nama tugas wajib diisi.' };
    if (!isDateStr(start)) return { error: 'Tanggal mulai tidak valid.' };
    if (!(duration >= 1)) return { error: 'Durasi minimal 1 hari kerja.' };
    const priority = document.getElementById('tf_priority').value;
    return {
      id: Tasks.draftId,
      name: name,
      note: document.getElementById('tf_note').value.trim(),
      priority: PRIORITY_META[priority] ? priority : 'sedang',
      color: document.getElementById('tf_color').value,
      start: start,
      duration: duration,
      parent: document.getElementById('tf_parent').value || null,
      predecessors: Tasks.readPreds(),
      resources: Tasks.readResources()
    };
  },

  submit: function () {
    const task = Tasks.collect();
    if (task.error) { showToast(task.error, 'err'); return; }
    delete task.error;
    Store.upsertTask(task);
    Tasks.close();
    showToast(Tasks.editingId ? 'Tugas diperbarui.' : 'Tugas ditambahkan.');
    App.refresh();
  },

  /* ---------- pratinjau jadwal ---------- */
  updatePreview: function () {
    const box = document.getElementById('tf_preview');
    const hint = document.getElementById('tf_endhint');
    const start = document.getElementById('tf_start').value;
    const dur = parseInt(document.getElementById('tf_duration').value, 10);

    if (isDateStr(start) && dur >= 1) {
      const cal = buildCalendar(Store.state.calendar);
      hint.textContent = 'Selesai ± ' + medD(cal.endDateOf(start, dur)) + ' (' + dur + ' hari kerja)';
    } else {
      hint.textContent = '—';
    }

    const task = Tasks.collect();
    if (task.error) {
      box.innerHTML = '<b>Pratinjau:</b> ' + esc(task.error);
      return;
    }

    const cand = JSON.parse(JSON.stringify(Store.state));
    const idx = cand.tasks.findIndex(function (t) { return t.id === task.id; });
    if (idx >= 0) cand.tasks[idx] = task; else cand.tasks.push(task);
    let s;
    try {
      s = computeSchedule(cand);
    } catch (e) {
      box.innerHTML = '<b>Pratinjau:</b> gagal menghitung jadwal.';
      return;
    }
    const r = s.res.get(task.id);
    if (!r) { box.innerHTML = '<b>Pratinjau:</b> —'; return; }

    const preds = s.usedPreds.get(task.id) || [];
    let basis = '';
    if (preds.length) {
      basis = '<br>Dibatasi oleh: ' + preds.map(function (p) {
        const src = Store.taskById(p.src);
        return esc((src ? src.name : p.src)) + ' · ' + p.type + (p.lag ? '+' + p.lag : '+0');
      }).join(' &middot; ');
    }
    const late = r.startDate > task.start
      ? '<br><span class="late">Geser otomatis:</span> jadwal efektif mundur dari tanggal yang dipilih karena batasan predecessor.'
      : '';
    const crit = r.critical
      ? '<b class="late">Slack 0 — termasuk jalur kritis.</b>'
      : '<b>Slack ' + r.slack + ' hari</b> (di luar jalur kritis).';

    box.innerHTML =
      '<b>Jadwal efektif:</b> ' + humanD(r.startDate) + ' → ' + humanD(r.endDate) +
      ' (' + r.dur + ' hari kerja)<br>' + crit + basis + late;
  },

  remove: function (id) {
    const t = Store.taskById(id);
    if (!t) return;
    const kids = Store.descendants(id);
    const msg = kids.length
      ? 'Hapus "' + t.name + '" beserta ' + kids.length + ' sub-tugas di bawahnya?'
      : 'Hapus tugas "' + t.name + '"?';
    if (!confirm(msg)) return;
    Store.removeTask(id);
    showToast('Tugas dihapus.');
    App.refresh();
  }
};
