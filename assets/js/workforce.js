/*! FastProduction V2 — workforce.js
 *  Module: Workforce Studio — Local prototype
 *  Target: pages/workforce.html
 *  Storage: localStorage (prototype lokal, tidak terhubung Supabase)
 *  Pattern: IIFE, konsisten dengan modul lain
 */
(function () {
  'use strict';

  /* =========================================================
   * CONSTANTS
   * ========================================================= */
  const K = {
    emp: 'fp_v2_employees',
    local: 'fp_v2_workforce_workers',
    stock: 'fp_v2_workforce_stock',
    jobs: 'fp_v2_work_monitor',
    pending: 'fp_v2_workforce_pending',
    hist: 'fp_v2_workforce_history'
  };

  const TITLE_MAP = {
    overview: 'Production Overview',
    workers: 'Worker Directory',
    stock: 'Production Stock Control',
    assign: 'Work Assignment',
    flow: 'Production Journey',
    pending: 'Pending & Production Alerts',
    history: 'Work History'
  };

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const read = (key, fallback = []) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('[Workforce] localStorage write failed:', err);
    }
  };

  const id = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const num = (n) => Number(n || 0).toLocaleString('id-ID');

  /* =========================================================
   * DATA ACCESSORS
   * ========================================================= */
  const W = () => {
    const a = [...read(K.emp), ...read(K.local)];
    const seen = new Set();
    return a
      .map((w, i) => ({
        id: String(w.id ?? w.employeeId ?? w.name ?? w.fullName ?? i),
        name: w.name ?? w.fullName ?? w.employeeName ?? 'Pekerja',
        role: w.role ?? w.position ?? 'Operator',
        skills: w.skills ?? w.competencies ?? [],
        status: w.status ?? 'active'
      }))
      .filter((w) => !seen.has(w.id) && seen.add(w.id));
  };

  const S = () => read(K.stock);
  const J = () => read(K.jobs);
  const P = () => read(K.pending);
  const H = () => read(K.hist);
  const A = () =>
    J().filter((j) => !['submitted', 'done', 'transferred'].includes(j.status || 'active'));

  const log = (action, worker, product, qty, note = '') => {
    const h = H();
    h.unshift({
      time: new Date().toISOString(),
      action,
      worker,
      product,
      qty,
      note
    });
    write(K.hist, h.slice(0, 500));
  };

  const avail = (s) =>
    Math.max(
      0,
      Number(s.qty) -
        Number(s.completed || 0) -
        A().filter((j) => j.stockId === s.id).reduce((n, j) => n + Number(j.qty), 0)
    );

  /* =========================================================
   * UI HELPERS
   * ========================================================= */
  const pop = (modalId) => {
    const el = $('#' + modalId);
    if (el) el.classList.add('show');
  };

  const closeM = (modalId) => {
    const el = $('#' + modalId);
    if (el) el.classList.remove('show');
  };

  const say = (message) => {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(window.__wf_toast_timer);
    window.__wf_toast_timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2300);
  };

  /* =========================================================
   * NAVIGATION
   * ========================================================= */
  const go = (view) => {
    $$('.content').forEach((x) =>
      x.classList.toggle('active', x.id === 'v-' + view)
    );
    $$('.nav button').forEach((x) =>
      x.classList.toggle('active', x.dataset.v === view)
    );
    const titleEl = $('#title');
    if (titleEl) titleEl.textContent = TITLE_MAP[view] || 'Production';
    render();
  };

  /* =========================================================
   * MODAL OPENERS
   * ========================================================= */
  const openAssign = () => {
    const busy = new Set(A().map((j) => String(j.workerId)));
    const workerSelect = $('#aWorker');
    const stockSelect = $('#aStock');
    const form = $('#fAssign');

    if (workerSelect) {
      workerSelect.innerHTML =
        '<option value="">Pilih pekerja</option>' +
        W()
          .filter((w) => w.status !== 'inactive')
          .map(
            (w) =>
              `<option value="${esc(w.id)}" ${
                busy.has(w.id) ? 'disabled' : ''
              }>${esc(w.name)}${
                busy.has(w.id) ? ' — masih pegang barang' : ''
              }</option>`
          )
          .join('');
    }

    if (stockSelect) {
      const available = S().filter((s) => avail(s) > 0);
      stockSelect.innerHTML = available.length
        ? available
            .map(
              (s) =>
                `<option value="${s.id}">${esc(s.name)} · ${s.source} · tersedia ${num(
                  avail(s)
                )}</option>`
            )
            .join('')
        : '<option value="">Tidak ada stok tersedia</option>';
    }

    if (form) form.reset();
    pop('mAssign');
  };

  const openPending = () => {
    const stockSelect = $('#pStock');
    const form = $('#fPending');

    if (stockSelect) {
      stockSelect.innerHTML = S()
        .map(
          (s) =>
            `<option value="${s.id}">${esc(s.name)} · ${s.source}</option>`
        )
        .join('');
    }

    if (form) form.reset();
    pop('mPending');
  };

  /* =========================================================
   * RENDER FUNCTIONS
   * ========================================================= */
  const card = (j) => {
    const w = W().find((x) => x.id === String(j.workerId));
    const name = w?.name || j.workerName || '?';
    return `<div class="worker">
      <div class="row">
        <div class="avatar">${esc(name[0])}</div>
        <span class="tag warn">Sedang bekerja</span>
      </div>
      <h3>${esc(w?.name || j.workerName)}</h3>
      <p>${esc(j.product)} · ${esc(j.stage)}</p>
      <div class="workerfoot">
        <b>${num(j.qty)} pcs</b>
        <button class="btn sm" onclick="window.__wf_submitJob('${j.id}')">Setor hasil</button>
      </div>
    </div>`;
  };

  const renderWorkers = () => {
    const q = ($('#wSearch')?.value || '').toLowerCase();
    const f = $('#wFilter')?.value || 'all';
    const target = $('#workers');
    if (!target) return;

    const filtered = W()
      .filter((w) => w.name.toLowerCase().includes(q))
      .filter((w) => {
        if (f === 'all') return true;
        const isBusy = A().some((j) => String(j.workerId) === w.id);
        return f === 'busy' ? isBusy : !isBusy;
      });

    target.innerHTML = filtered
      .map((w) => {
        const j = A().find((x) => String(x.workerId) === w.id);
        return `<div class="worker">
          <div class="row">
            <div class="avatar">${esc(w.name[0])}</div>
            <span class="tag ${j ? 'warn' : ''}">${
          j ? 'Sedang bekerja' : 'Tersedia'
        }</span>
          </div>
          <h3>${esc(w.name)}</h3>
          <p>${esc(w.role)} · ${esc(
          Array.isArray(w.skills) ? w.skills.join(', ') : w.skills
        )}</p>
          ${
            j
              ? `<div class="workerfoot">
              <b>${num(j.qty)} pcs</b>
              <button class="btn sm" onclick="window.__wf_submitJob('${j.id}')">Setor</button>
            </div>`
              : ''
          }
        </div>`;
      })
      .join('') ||
      '<div class="empty">Belum ada pekerja. Tambahkan pekerja untuk memulai.</div>';
  };

  const renderStock = () => {
    const f = $('#sFilter')?.value || 'all';
    const target = $('#stockRows');
    if (!target) return;

    const filtered = S().filter((s) => f === 'all' || s.source === f);

    target.innerHTML = filtered.length
      ? filtered
          .map(
            (s) => `<tr>
          <td><b>${esc(s.name)}</b><div class="sub">${esc(s.orderNo)}</div></td>
          <td>${s.source}</td>
          <td>${num(s.qty)}</td>
          <td>${num(
            A().filter((j) => j.stockId === s.id).reduce((n, j) => n + Number(j.qty), 0)
          )}</td>
          <td>${num(
            A().filter((j) => j.stockId === s.id).reduce((n, j) => n + Number(j.qty), 0)
          )}</td>
          <td><b>${num(avail(s))}</b></td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="empty">Belum ada stok.</td></tr>';
  };

  const renderJobs = () => {
    const target = $('#jobRows');
    if (!target) return;

    target.innerHTML = J().length
      ? J()
          .map(
            (j) => `<tr>
          <td>${esc(j.workerName)}</td>
          <td>${esc(j.product)}<div class="sub">${j.source}</div></td>
          <td>${esc(j.stage)}</td>
          <td>${num(j.qty)} pcs</td>
          <td>${new Date(j.createdAt).toLocaleString('id-ID')}</td>
          <td>${
            A().some((x) => x.id === j.id)
              ? `<button class="btn sm" onclick="window.__wf_submitJob('${j.id}')">Setor hasil</button>`
              : `<span class="tag">Disetor ${num(j.submittedQty)}</span>`
          }</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="empty">Belum ada penugasan.</td></tr>';
  };

  const renderFlow = () => {
    const target = $('#flowRows');
    if (!target) return;

    const flow = H().filter((x) => /setor|handover|teruskan/i.test(x.action));
    target.innerHTML = flow.length
      ? flow
          .map(
            (x) => `<div class="item">
          <div class="row">
            <b>${esc(x.product)}</b>
            <span class="tag blue">${esc(x.action)}</span>
          </div>
          <div class="sub">${esc(x.worker)} · ${num(x.qty)} pcs · ${new Date(
              x.time
            ).toLocaleString('id-ID')}</div>
          <div class="sub">${esc(x.note)}</div>
        </div>`
          )
          .join('')
      : '<div class="empty">Belum ada perpindahan barang.</div>';
  };

  const renderPending = () => {
    const p = P();
    const target = $('#pendingCards');
    const materialTarget = $('#materialRows');

    if (target) {
      target.innerHTML = p.length
        ? p
            .map(
              (x) => `<div class="alert">
            <div class="row">
              <span class="tag ${
                x.status === 'resolved' ? '' : 'warn'
              }">${x.status === 'resolved' ? 'Resolved' : 'Pending'}</span>
              <span class="sub">${esc(x.type)}</span>
            </div>
            <h3>${esc(x.product)}</h3>
            <p>${esc(x.material)} · ${esc(x.note)}</p>
            <strong>${num(Math.max(0, x.required - x.available))} kurang</strong>
            <div class="sub">${num(x.required)} kebutuhan · ${num(
                x.available
              )} tersedia</div>
            <button class="btn sm" style="margin-top:10px" onclick="window.__wf_resolvePending('${x.id}')">Tandai selesai</button>
          </div>`
            )
            .join('')
        : '<div class="empty">Belum ada catatan kendala.</div>';
    }

    if (materialTarget) {
      const materials = p.filter((x) => x.material);
      materialTarget.innerHTML = materials.length
        ? materials
            .map(
              (x) => `<tr>
            <td>${esc(x.product)}</td>
            <td>${esc(x.material)}</td>
            <td>${num(x.required)}</td>
            <td>${num(x.available)}</td>
            <td><b>${num(Math.max(0, x.required - x.available))}</b></td>
            <td>${x.status === 'resolved' ? 'Selesai' : 'Pending'}</td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="6" class="empty">Belum ada material shortage.</td></tr>';
    }
  };

  const renderHistory = () => {
    const target = $('#historyRows');
    if (!target) return;

    target.innerHTML = H().length
      ? H()
          .map(
            (x) => `<tr>
          <td>${new Date(x.time).toLocaleString('id-ID')}</td>
          <td>${esc(x.action)}</td>
          <td>${esc(x.worker)}</td>
          <td>${esc(x.product)}</td>
          <td>${num(x.qty)}</td>
          <td>${esc(x.note)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="empty">Belum ada riwayat.</td></tr>';
  };

  const render = () => {
    const w = W();
    const a = A();
    const ss = S();
    const pp = P().filter((p) => p.status !== 'resolved');

    const nWorkers = $('#nWorkers');
    const nActive = $('#nActive');
    const nWip = $('#nWip');
    const nPending = $('#nPending');

    if (nWorkers) nWorkers.textContent = w.length;
    if (nActive) nActive.textContent = new Set(a.map((j) => j.workerId)).size;
    if (nWip) nWip.textContent = num(a.reduce((n, j) => n + Number(j.qty), 0));
    if (nPending) nPending.textContent = pp.length;

    const queue = $('#queue');
    if (queue) {
      queue.innerHTML = ss.length
        ? ss
            .map(
              (s) => `<div class="item">
            <div class="row">
              <b>${esc(s.name)}</b>
              <span class="tag ${s.source === 'PO' ? '' : 'blue'}">${s.source}</span>
            </div>
            <div class="sub">${esc(s.orderNo || '')} · ${num(s.qty)} pcs masuk · ${num(
                avail(s)
              )} tersedia</div>
            <div class="bar"><i style="width:${Math.min(
              100,
              (Number(s.completed || 0) / Math.max(1, s.qty)) * 100
            )}%"></i></div>
          </div>`
            )
            .join('')
        : '<div class="empty">Belum ada stok produksi.</div>';
    }

    const alerts = $('#alerts');
    if (alerts) {
      alerts.innerHTML = pp.slice(0, 4).length
        ? pp
            .slice(0, 4)
            .map(
              (p) => `<div class="item">
            <b>${esc(p.product)}</b>
            <div class="sub">${esc(p.type)} · ${esc(p.material)}</div>
            <div class="sub">Kurang ${num(Math.max(0, p.required - p.available))}</div>
          </div>`
            )
            .join('')
        : '<div class="empty">Tidak ada kendala aktif.</div>';
    }

    const activeCards = $('#activeCards');
    if (activeCards) {
      activeCards.innerHTML = a.slice(0, 6).length
        ? a.slice(0, 6).map(card).join('')
        : '<div class="empty">Belum ada pekerja yang memegang barang.</div>';
    }

    renderWorkers();
    renderStock();
    renderJobs();
    renderFlow();
    renderPending();
    renderHistory();
  };

  /* =========================================================
   * ACTIONS
   * ========================================================= */
  const submitJob = (jid) => {
    const j = J().find((x) => x.id === jid);
    if (!j) return;
    const form = $('#fSubmit');
    if (!form) return;
    form.jobId.value = jid;
    form.qty.max = j.qty;
    form.qty.value = j.qty;
    const hint = $('#submitHint');
    if (hint) {
      hint.textContent = `${j.workerName} · ${j.product} · ${j.qty} pcs diambil`;
    }
    pop('mSubmit');
  };

  const resolvePending = (pid) => {
    const a = P();
    const p = a.find((x) => x.id === pid);
    if (p) {
      p.status = 'resolved';
      write(K.pending, a);
      log('Pending diselesaikan', '-', p.product, 0, p.material);
      render();
      say('Status diperbarui');
    }
  };

  /* =========================================================
   * FORM HANDLERS
   * ========================================================= */
  const bindForms = () => {
    const fWorker = $('#fWorker');
    if (fWorker) {
      fWorker.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const a = read(K.local);
        a.push({
          id: id(),
          name: d.name,
          phone: d.phone,
          role: d.role,
          skills: d.skills
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          status: 'active'
        });
        write(K.local, a);
        log('Pekerja ditambahkan', d.name, '-', 0, d.role);
        closeM('mWorker');
        render();
        say('Pekerja ditambahkan');
      };
    }

    const fStock = $('#fStock');
    if (fStock) {
      fStock.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const a = S();
        a.unshift({
          id: id(),
          source: d.source,
          name: d.name,
          orderNo: d.orderNo,
          qty: +d.qty,
          completed: 0
        });
        write(K.stock, a);
        log('Stok masuk', '-', d.name, +d.qty, d.source);
        closeM('mStock');
        render();
        say('Stok dicatat');
      };
    }

    const fAssign = $('#fAssign');
    if (fAssign) {
      fAssign.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const w = W().find((x) => x.id === d.workerId);
        const s = S().find((x) => x.id === d.stockId);
        const q = +d.qty;

        if (!w || !s) return say('Pilih pekerja dan stok');
        if (A().some((j) => String(j.workerId) === w.id))
          return say('Pekerja masih punya pekerjaan aktif');
        if (q < 1 || q > avail(s)) return say('Jumlah melebihi stok tersedia');

        const j = {
          id: id(),
          workerId: w.id,
          workerName: w.name,
          stockId: s.id,
          product: s.name,
          source: s.source,
          qty: q,
          stage: d.stage,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        const a = J();
        a.unshift(j);
        write(K.jobs, a);
        log('Ambil barang', w.name, s.name, q, `${s.source} · ${d.stage}`);
        closeM('mAssign');
        render();
        say('Barang berhasil dialokasikan');
      };
    }

    const fSubmit = $('#fSubmit');
    if (fSubmit) {
      fSubmit.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const a = J();
        const j = a.find((x) => x.id === d.jobId);
        const q = +d.qty;
        const def = +d.defect;

        if (!j || q + def > j.qty) return say('Setoran melebihi jumlah diambil');

        j.status = 'submitted';
        j.submittedQty = q;
        j.defectQty = def;
        j.submittedAt = new Date().toISOString();
        write(K.jobs, a);

        const s = S().find((x) => x.id === j.stockId);
        if (s) s.completed = (s.completed || 0) + q;
        write(K.stock, S());

        log(
          'Setor hasil',
          j.workerName,
          j.product,
          q,
          `${j.stage} · cacat ${def} · ${d.note}`
        );
        if (j.qty > q + def)
          log(
            'Selisih belum disetor',
            j.workerName,
            j.product,
            j.qty - q - def,
            'Perlu tindak lanjut'
          );

        closeM('mSubmit');
        render();
        say('Setoran dicatat');
      };
    }

    const fPending = $('#fPending');
    if (fPending) {
      fPending.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const s = S().find((x) => x.id === d.stockId);
        const a = P();
        a.unshift({
          id: id(),
          stockId: d.stockId,
          product: s?.name || 'Order',
          type: d.type,
          material: d.material,
          required: +d.required || 0,
          available: +d.available || 0,
          note: d.note,
          status: 'open'
        });
        write(K.pending, a);
        log(
          'Kendala dicatat',
          '-',
          s?.name || 'Order',
          Math.max(0, (+d.required || 0) - (+d.available || 0)),
          d.type
        );
        closeM('mPending');
        render();
        say('Kendala dicatat');
      };
    }
  };

  /* =========================================================
   * EVENT BINDING
   * ========================================================= */
  const bindEvents = () => {
    const nav = $('#nav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (b) go(b.dataset.v);
      });
    }

    // Modal backdrop click
    $$('.modalback').forEach((m) =>
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('show');
      })
    );
  };

  /* =========================================================
   * INIT
   * ========================================================= */
  const init = () => {
    bindForms();
    bindEvents();
    render();
    console.info('[Workforce] Ready (local prototype).');
  };

  // Expose action functions to window for inline onclick handlers
  window.__wf_submitJob = submitJob;
  window.__wf_resolvePending = resolvePending;
  window.openAssign = openAssign;
  window.openPending = openPending;
  window.closeM = closeM;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
