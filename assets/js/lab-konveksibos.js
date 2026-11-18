/*! FastProduction V2 — lab-konveksibos.js
 *  Module: Lab Konveksibos — Production control center
 *  Target: pages/lab-konveksibos.html
 *  Storage: localStorage (prototype lokal)
 */
(function () {
  'use strict';

  /* =========================================================
   * CONSTANTS
   * ========================================================= */
  const ORDERS_KEY = 'fp_v2_lab_orders';
  const WORK_KEY = 'fp_v2_work_monitor';
  const EMPLOYEES_KEY = 'fp_v2_employees';

  /* =========================================================
   * STATE
   * ========================================================= */
  let orders = [];
  let workItems = [];
  let pendingWorkerId = null;
  let handoverItemId = null;

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function notify(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window.__lab_toast_timer);
    window.__lab_toast_timer = setTimeout(() => {
      t.style.display = 'none';
    }, 2600);
  }

  function workId() {
    return 'W' + Date.now() + Math.random().toString(16).slice(2, 6);
  }

  /* =========================================================
   * DATA PERSISTENCE
   * ========================================================= */
  function loadOrders() {
    try {
      orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    } catch {
      orders = [];
    }
  }

  function saveOrders() {
    try {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    } catch (err) {
      console.warn('[Lab] save orders:', err);
    }
  }

  function loadWorkItems() {
    try {
      workItems = JSON.parse(localStorage.getItem(WORK_KEY) || '[]');
    } catch {
      workItems = [];
    }
  }

  function saveWork() {
    try {
      localStorage.setItem(WORK_KEY, JSON.stringify(workItems));
    } catch (err) {
      console.warn('[Lab] save work:', err);
    }
  }

  /* =========================================================
   * WORKER NAMES
   * ========================================================= */
  function workerNames() {
    let names = ['Andi Ramadhan', 'Dewi Sari', 'Rudi Nugraha', 'Siti Lestari'];
    try {
      const raw = JSON.parse(localStorage.getItem(EMPLOYEES_KEY) || '[]');
      raw.forEach((x) => {
        const n = x.name || x.fullName || x.employeeName;
        if (n && !names.includes(n)) names.push(n);
      });
    } catch {}
    return names;
  }

  function fillWorkerSelects() {
    const names = workerNames();
    ['workWorker', 'handoverWorker'].forEach((id) => {
      const el = $('#' + id);
      if (!el) return;
      const old = el.value;
      el.innerHTML = names
        .map((n) => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`)
        .join('');
      if (names.includes(old)) el.value = old;
    });
  }

  /* =========================================================
   * ORDER MODAL
   * ========================================================= */
  function openModal() {
    const modal = $('#orderModal');
    if (modal) modal.classList.add('show');
  }

  function closeModal() {
    const modal = $('#orderModal');
    if (modal) modal.classList.remove('show');
  }

  function addOrder() {
    const name = $('#orderName')?.value.trim();
    const client = $('#orderClient')?.value.trim();
    const qty = parseInt($('#orderQty')?.value, 10);
    const type = $('#orderType')?.value;

    if (!name || !client || !qty || qty < 1) {
      notify('Lengkapi nama, client, dan jumlah pesanan.');
      return;
    }

    orders.unshift({
      name,
      client,
      qty,
      type,
      created: new Date().toISOString()
    });
    saveOrders();
    closeModal();

    $('#orderName').value = '';
    $('#orderClient').value = '';
    $('#orderQty').value = '';

    renderOrders();
    notify('Pesanan berhasil ditambahkan.');
  }

  function renderOrders() {
    const root = $('#orders');
    if (!root) return;

    const saved = orders
      .map(
        (o, i) => `
      <div class="order">
        <div class="order-top">
          <div>
            <div class="order-name">${escapeHTML(o.name)}</div>
            <div class="order-meta">FP-LOCAL-${String(i + 1).padStart(3, '0')} · ${escapeHTML(
          o.client
        )} · ${o.qty} pcs</div>
          </div>
          <span class="tag blue">${escapeHTML(o.type)}</span>
        </div>
        <div class="progress-row"><span>Overall production</span><span>0%</span></div>
        <div class="progress"><i style="width:0%"></i></div>
      </div>`
      )
      .join('');

    root.insertAdjacentHTML('afterbegin', saved);
    const activeCount = $('#activeCount');
    if (activeCount) {
      activeCount.textContent = String(8 + orders.length).padStart(2, '0');
    }
  }

  /* =========================================================
   * WORK MODAL
   * ========================================================= */
  function openWorkModal() {
    fillWorkerSelects();
    const modal = $('#workModal');
    if (modal) modal.classList.add('show');

    $('#previousWorkNotice').style.display = 'none';
    $('#previousWorkForm').style.display = 'none';
    $('#handoverForm').style.display = 'none';
    $('#newWorkForm').style.display = 'block';
    $('#workModalTitle').textContent = 'Pekerja Ambil Barang';
    $('#workModalDesc').textContent = 'Pilih pekerja dan pekerjaan yang akan ditangani.';

    refreshJobOptions();
    checkWorkerPrevious();
  }

  function closeWorkModal() {
    const modal = $('#workModal');
    if (modal) modal.classList.remove('show');
  }

  function refreshJobOptions() {
    const source = $('#workSource')?.value;
    const jobWrap = $('#jobSelectWrap');
    const indepFields = $('#independentFields');

    if (jobWrap) jobWrap.style.display = source === 'order' ? 'block' : 'none';
    if (indepFields) indepFields.style.display = source === 'independent' ? 'block' : 'none';

    const select = $('#workJob');
    if (!select) return;

    const saved = orders.map((o, i) => ({
      name: o.name,
      client: o.client,
      qty: o.qty,
      id: 'order-' + i
    }));

    select.innerHTML = saved.length
      ? saved
          .map(
            (o) =>
              `<option value="${escapeHTML(o.id)}">${escapeHTML(o.name)} — ${escapeHTML(
                o.client
              )}</option>`
          )
          .join('')
      : '<option value="">Belum ada produk order</option>';
  }

  function checkWorkerPrevious() {
    const worker = $('#workWorker')?.value;
    const previous = workItems.find((x) => x.worker === worker && x.status === 'active');
    const notice = $('#previousWorkNotice');
    const form = $('#previousWorkForm');
    const newForm = $('#newWorkForm');

    if (previous) {
      pendingWorkerId = previous.id;
      if (notice) notice.style.display = 'block';
      if (form) form.style.display = 'block';
      if (newForm) newForm.style.display = 'none';

      if (notice) {
        notice.innerHTML = `<b>PEKERJA MASIH MEMILIKI PEKERJAAN!</b><br>${escapeHTML(
          worker
        )} sedang mengerjakan <b>${escapeHTML(previous.product)}</b> (${escapeHTML(
          previous.stage
        )}).<br>Jumlah yang diambil: <b>${previous.qty} pcs</b>. Setorkan hasil pekerjaan ini sebelum mengambil barang baru.`;
      }

      const prevQty = $('#previousQty');
      if (prevQty) prevQty.value = previous.qty;
    } else {
      pendingWorkerId = null;
      if (notice) notice.style.display = 'none';
      if (form) form.style.display = 'none';
      if (newForm) newForm.style.display = 'block';
    }
  }

  function submitPreviousWork() {
    const item = workItems.find((x) => x.id === pendingWorkerId);
    if (!item) return;

    const qty = Number($('#previousQty')?.value);
    if (!Number.isInteger(qty) || qty < 0 || qty > item.qty) {
      notify('Jumlah setoran harus antara 0 dan jumlah barang yang diambil.');
      return;
    }

    item.doneQty = qty;
    item.status = 'completed';
    item.note = $('#previousNote')?.value.trim();
    item.completedAt = new Date().toISOString();
    saveWork();
    renderWorkMonitor();

    $('#previousWorkNotice').style.display = 'none';
    $('#previousWorkForm').style.display = 'none';
    $('#newWorkForm').style.display = 'block';
    pendingWorkerId = null;

    notify('Setoran pekerjaan sebelumnya tercatat. Silakan buat pekerjaan baru.');
  }

  function assignWork() {
    const worker = $('#workWorker')?.value;
    if (workItems.some((x) => x.worker === worker && x.status === 'active')) {
      notify('Pekerja masih punya pekerjaan aktif. Setorkan dulu.');
      checkWorkerPrevious();
      return;
    }

    const source = $('#workSource')?.value;
    let product = '';
    let client = '';

    if (source === 'order') {
      const index = Number(($('#workJob')?.value || '').replace('order-', ''));
      const o = orders[index];
      if (!o) {
        notify('Belum ada order. Pilih pekerjaan independen atau buat order.');
        return;
      }
      product = o.name;
      client = o.client;
    } else {
      product = $('#independentName')?.value.trim();
      client = $('#independentClient')?.value.trim();
    }

    const qty = Number($('#workQty')?.value);
    if (!product || !qty || qty < 1) {
      notify('Lengkapi barang dan jumlahnya.');
      return;
    }

    workItems.unshift({
      id: workId(),
      worker,
      product,
      client,
      source,
      stage: $('#workStage')?.value,
      qty,
      doneQty: 0,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    saveWork();
    renderWorkMonitor();
    closeWorkModal();
    notify('Barang berhasil diberikan kepada pekerja.');
  }

  function finishWork(id) {
    const item = workItems.find((x) => x.id === id);
    if (!item) return;

    const qty = prompt(
      `Jumlah hasil yang disetor untuk ${item.product} (maksimal ${item.qty}):`,
      String(item.qty)
    );
    if (qty === null) return;

    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0 || n > item.qty) {
      notify('Jumlah setoran tidak valid.');
      return;
    }

    item.doneQty = n;
    item.status = 'completed';
    item.completedAt = new Date().toISOString();
    saveWork();
    renderWorkMonitor();
    notify('Hasil pekerjaan berhasil disetor.');
  }

  function openHandover(id) {
    const item = workItems.find((x) => x.id === id && x.status === 'completed');
    if (!item) return;

    handoverItemId = id;
    fillWorkerSelects();

    const modal = $('#workModal');
    if (modal) modal.classList.add('show');

    $('#workModalTitle').textContent = 'Teruskan Barang ke Bagian Berikutnya';
    $('#workModalDesc').textContent = 'Pilih bagian dan operator yang akan menerima barang.';
    $('#newWorkForm').style.display = 'none';
    $('#previousWorkNotice').style.display = 'none';
    $('#previousWorkForm').style.display = 'none';
    $('#handoverForm').style.display = 'block';

    const handoverProduct = $('#handoverProduct');
    const handoverQty = $('#handoverQty');
    if (handoverProduct) handoverProduct.value = item.product;
    if (handoverQty) handoverQty.value = item.doneQty + ' pcs';

    const stages = ['Obras', 'KAM', 'Jahit', 'Setrika', 'Packaging', 'Siap Kirim'];
    const next = stages.indexOf(item.stage);
    const handoverStage = $('#handoverStage');
    if (handoverStage) {
      handoverStage.value =
        next >= 0 && next < stages.length - 1 ? stages[next + 1] : 'Siap Kirim';
    }
  }

  function handoverWork() {
    const item = workItems.find((x) => x.id === handoverItemId);
    if (!item) return;

    const stage = $('#handoverStage')?.value;
    const worker = $('#handoverWorker')?.value;

    if (stage !== 'Siap Kirim' && workItems.some((x) => x.worker === worker && x.status === 'active')) {
      notify('Operator ini masih memiliki pekerjaan aktif. Pilih operator lain.');
      return;
    }

    item.status = 'transferred';
    item.transferredAt = new Date().toISOString();

    workItems.unshift({
      id: workId(),
      worker: stage === 'Siap Kirim' ? '—' : worker,
      product: item.product,
      client: item.client,
      source: item.source,
      stage,
      qty: item.doneQty,
      doneQty: 0,
      status: stage === 'Siap Kirim' ? 'shipped' : 'active',
      createdAt: new Date().toISOString(),
      parentId: item.id
    });

    saveWork();
    renderWorkMonitor();
    closeWorkModal();
    notify('Barang diteruskan ke ' + stage + '.');
  }

  /* =========================================================
   * RENDER WORK MONITOR
   * ========================================================= */
  function renderWorkMonitor() {
    const active = workItems.filter((x) => x.status === 'active');
    const completed = workItems.filter((x) => x.status === 'completed');
    const shipped = workItems.filter((x) => x.status === 'shipped');

    const workerActiveCount = $('#workerActiveCount');
    const goodsActiveCount = $('#goodsActiveCount');
    const goodsDoneCount = $('#goodsDoneCount');
    const goodsShipCount = $('#goodsShipCount');

    if (workerActiveCount)
      workerActiveCount.textContent = new Set(active.map((x) => x.worker)).size;
    if (goodsActiveCount) goodsActiveCount.textContent = active.length;
    if (goodsDoneCount) goodsDoneCount.textContent = completed.length;
    if (goodsShipCount) goodsShipCount.textContent = shipped.length;

    const activeRoot = $('#activeWorkList');
    if (activeRoot) {
      activeRoot.innerHTML = active.length
        ? active
            .map(
              (x) => `
          <div class="order">
            <div class="order-top">
              <div>
                <div class="order-name">${escapeHTML(x.worker)} · ${escapeHTML(x.product)}</div>
                <div class="order-meta">${escapeHTML(x.stage)} · ${x.qty} pcs · ${escapeHTML(
                x.client || x.source
              )}</div>
              </div>
              <span class="tag orange">SEDANG DIKERJAKAN</span>
            </div>
            <div class="progress-row"><span>Target setoran</span><span>${x.qty} pcs</span></div>
            <div class="progress"><i style="width:0%"></i></div>
            <div style="text-align:right;margin-top:10px">
              <button class="btn primary" onclick="window.__lab_finishWork('${x.id}')">Setor / Selesai</button>
            </div>
          </div>`
            )
            .join('')
        : '<div class="empty">Belum ada pekerja aktif mengambil barang.</div>';
    }

    const doneRoot = $('#completedWorkList');
    if (doneRoot) {
      doneRoot.innerHTML = completed.length
        ? completed
            .map(
              (x) => `
          <div class="order">
            <div class="order-top">
              <div>
                <div class="order-name">${escapeHTML(x.product)}</div>
                <div class="order-meta">Disetor oleh ${escapeHTML(x.worker)} · ${escapeHTML(
                x.stage
              )} · ${x.doneQty} pcs</div>
              </div>
              <span class="tag blue">MENUNGGU BAGIAN</span>
            </div>
            <div style="text-align:right;margin-top:10px">
              <button class="btn primary" onclick="window.__lab_openHandover('${x.id}')">Teruskan ke Bagian Berikutnya →</button>
            </div>
          </div>`
            )
            .join('')
        : '<div class="empty">Belum ada barang selesai yang menunggu proses berikutnya.</div>';
    }

    const stageCounts = { Obras: 0, KAM: 0, Jahit: 0, Setrika: 0, Packaging: 0 };
    active.concat(completed).forEach((x) => {
      if (stageCounts[x.stage] !== undefined) stageCounts[x.stage] += 1;
    });

    const stageObras = $('#stageObras');
    const stageJahit = $('#stageJahit');
    const stageSetrika = $('#stageSetrika');
    const stageKirim = $('#stageKirim');

    if (stageObras) stageObras.textContent = stageCounts.Obras + ' pekerjaan';
    if (stageJahit)
      stageJahit.textContent = stageCounts.KAM + stageCounts.Jahit + ' pekerjaan';
    if (stageSetrika) stageSetrika.textContent = stageCounts.Setrika + ' pekerjaan';
    if (stageKirim)
      stageKirim.textContent = stageCounts.Packaging + shipped.length + ' pekerjaan';
  }

  /* =========================================================
   * EVENT BINDING
   * ========================================================= */
  function bindEvents() {
    const orderModal = $('#orderModal');
    if (orderModal) {
      orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) closeModal();
      });
    }

    const workModal = $('#workModal');
    if (workModal) {
      workModal.addEventListener('click', (e) => {
        if (e.target === workModal) closeWorkModal();
      });
    }
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  function init() {
    loadOrders();
    loadWorkItems();
    bindEvents();
    renderOrders();
    renderWorkMonitor();

    console.info('[Lab Konveksibos] Ready (local prototype).');
  }

  // Expose functions to window for inline onclick handlers
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.addOrder = addOrder;
  window.openWorkModal = openWorkModal;
  window.closeWorkModal = closeWorkModal;
  window.refreshJobOptions = refreshJobOptions;
  window.checkWorkerPrevious = checkWorkerPrevious;
  window.submitPreviousWork = submitPreviousWork;
  window.assignWork = assignWork;
  window.handoverWork = handoverWork;
  window.__lab_finishWork = finishWork;
  window.__lab_openHandover = openHandover;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
