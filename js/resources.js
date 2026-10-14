'use strict';
/* Manajemen sumber daya: anggota tim + alokasi ke tugas */

const Resources = {
  editingId: null,

  bind: function () {
    document.getElementById('resForm').addEventListener('submit', function (e) {
      e.preventDefault();
      Resources.submit();
    });
  },

  openNew: function () {
    Resources.editingId = null;
    document.getElementById('resModalTitle').textContent = 'Tambah Anggota';
    document.getElementById('rf_id').value = '';
    document.getElementById('rf_name').value = '';
    document.getElementById('rf_email').value = '';
    document.getElementById('rf_role').value = '';
    document.getElementById('rf_salary').value = '';
    Resources.openModal();
  },

  openEdit: function (id) {
    const r = Store.state.resources.find(function (x) { return x.id === id; });
    if (!r) return;
    Resources.editingId = id;
    document.getElementById('resModalTitle').textContent = 'Ubah Anggota';
    document.getElementById('rf_id').value = r.id;
    document.getElementById('rf_name').value = r.name || '';
    document.getElementById('rf_email').value = r.email || '';
    document.getElementById('rf_role').value = r.role || '';
    document.getElementById('rf_salary').value = r.salary || 0;
    Resources.openModal();
  },

  openModal: function () {
    document.getElementById('resModal').hidden = false;
    setTimeout(function () { document.getElementById('rf_name').focus(); }, 30);
  },

  close: function () {
    document.getElementById('resModal').hidden = true;
  },

  submit: function () {
    const name = document.getElementById('rf_name').value.trim();
    const email = document.getElementById('rf_email').value.trim();
    const role = document.getElementById('rf_role').value.trim();
    const salary = Math.max(0, parseInt(document.getElementById('rf_salary').value, 10) || 0);
    if (!name) { showToast('Nama anggota wajib diisi.', 'err'); return; }
    if (!email || email.indexOf('@') < 0) { showToast('Email tidak valid.', 'err'); return; }

    const id = Resources.editingId || uid('r');
    Store.upsertResource({ id: id, name: name, email: email, role: role, salary: salary });
    Resources.close();
    showToast(Resources.editingId ? 'Anggota diperbarui.' : 'Anggota ditambahkan.');
    App.refresh();
  },

  remove: function (id) {
    const r = Store.state.resources.find(function (x) { return x.id === id; });
    if (!r) return;
    const used = Store.state.tasks.filter(function (t) { return (t.resources || []).indexOf(id) >= 0; }).length;
    const msg = used
      ? 'Hapus "' + r.name + '"? Anggota ini dialokasikan ke ' + used + ' tugas dan akan dilepas dari tugas-tugas tersebut.'
      : 'Hapus anggota "' + r.name + '"?';
    if (!confirm(msg)) return;
    Store.removeResource(id);
    showToast('Anggota dihapus.');
    App.refresh();
  },

  render: function () {
    const state = Store.state;
    const host = document.getElementById('resTable');
    const statsHost = document.getElementById('teamStats');
    const alloc = resourceAllocations(state);
    const sched = App.sched;
    const totalGaji = state.resources.reduce(function (a, r) { return a + (Number(r.salary) || 0); }, 0);
    let totalHari = 0;
    alloc.forEach(function (b) { totalHari += b.days; });

    statsHost.innerHTML =
      ganttStat('Anggota', fmtInt(state.resources.length)) +
      ganttStat('Gaji / bulan', fmtRp(totalGaji)) +
      ganttStat('Total alokasi', fmtInt(totalHari) + ' hr') +
      ganttStat('Estimasi biaya proyek', fmtRp(sched ? sched.stats.cost : estimateCost(state)), 'ok');

    if (!state.resources.length) {
      host.innerHTML = '<div class="empty">Belum ada anggota tim. Klik <b>+ Anggota Tim</b> untuk mendaftarkan ' +
        'nama, email, peran, dan gaji — lalu alokasikan ke tugas lewat form tugas di Gantt.</div>';
      return;
    }

    const rows = state.resources.map(function (r) {
      const b = alloc.get(r.id) || { tasks: [], days: 0, cost: 0 };
      const names = b.tasks.map(function (t) { return t.name; });
      const list = names.length
        ? '<div class="hint" title="' + esc(names.join(', ')) + '">' + esc(trimStr(names.join(', '), 70)) + '</div>'
        : '<div class="hint">Belum dialokasikan</div>';
      return '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:8px">' +
          '<span class="avatar">' + initials(r.name) + '</span>' +
          '<div><div style="font-weight:700">' + esc(r.name) + '</div><div class="hint" style="margin:0">' + esc(r.email) + '</div></div>' +
        '</div></td>' +
        '<td><span class="pill prio-sedang">' + esc(r.role || '—') + '</span></td>' +
        '<td class="num">' + fmtRp(r.salary) + '<div class="hint" style="margin:0">/bulan</div></td>' +
        '<td class="num">' + b.tasks.length + ' tugas<div class="hint" style="margin:0">' + fmtInt(b.days) + ' hari kerja</div></td>' +
        '<td class="num">' + fmtRp(b.cost) + '</td>' +
        '<td>' + list + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" data-action="res-edit" data-id="' + r.id + '" title="Ubah">&#9998;</button>' +
          '<button class="icon-btn" data-action="res-del" data-id="' + r.id + '" title="Hapus">&#128465;&#65039;</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    host.innerHTML =
      '<table class="tbl"><thead><tr>' +
      '<th>Anggota</th><th>Peran</th><th class="num">Gaji</th><th class="num">Alokasi</th>' +
      '<th class="num">Estimasi biaya</th><th>Tugas dialokasikan</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }
};
