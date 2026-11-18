(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;

  if (!db) {
    console.error('[Marketplace] Supabase client tidak tersedia.');
    return;
  }

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[c]);
  }

  function statusLabel(status) {
    const map = {
      showcase: 'DESIGN SHOWCASE',
      interest: 'OPEN INTEREST',
      po_campaign: 'PO CAMPAIGN',
      payment_open: 'PAYMENT OPEN',
      in_production: 'IN PRODUCTION',
      completed: 'COMPLETED'
    };
    return map[status] || String(status || 'LISTING').toUpperCase();
  }

  function kindLabel(kind) {
    if (kind === 'independent') return 'INDEPENDENT';
    if (kind === 'community_po') return 'COMMUNITY';
    return String(kind || '').toUpperCase();
  }

  function footerNote(kind, status, progress) {
    if (status === 'payment_open') return 'Menunggu penyelesaian pembayaran';
    if (status === 'in_production') {
      return kind === 'independent' ? 'Independent production' : 'Sedang diproduksi';
    }
    if (status === 'completed') return 'Production completed';
    if (status === 'po_campaign') return 'Kampanye PO berjalan';
    if (status === 'interest') return 'Minat terbuka';
    if (status === 'showcase') return 'Belum masuk PO';
    if (typeof progress === 'number') return `Progress ${progress}%`;
    return '—';
  }

  function footerActionLabel(kind, status) {
    if (status === 'payment_open') return 'COMPLETE PAYMENT';
    if (status === 'in_production') return kind === 'independent' ? 'FOLLOW PROJECT' : 'VIEW PO';
    if (status === 'completed') return 'VIEW PROJECT';
    if (status === 'po_campaign') return 'VIEW PO';
    if (status === 'interest') return 'JOIN INTEREST';
    if (status === 'showcase') return 'VIEW DESIGN';
    return 'VIEW DETAIL';
  }

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    listings: [],
    activeFilter: 'all',
    keyword: '',
    loading: false,
    lastError: null
  };

  // Mapping tab HTML → nilai `status` di product_listings
  const TAB_STATUS_MAP = {
    all: null,
    showcase: 'showcase',
    interest: 'interest',
    po: 'po_campaign',
    payment: 'payment_open',
    production: 'in_production',
    completed: 'completed'
  };

  /* =========================================================
   * DOM REFS
   * ========================================================= */
  const dom = {
    grid: null,        // #projects
    empty: null,       // #empty
    count: null,       // #count
    search: null,      // #search
    searchBtn: null,   // #searchBtn
    tabsRoot: null,    // #tabs
    tabs: []           // .tab
  };

  function cacheDom() {
    dom.grid = $('#projects');
    dom.empty = $('#empty');
    dom.count = $('#count');
    dom.search = $('#search');
    dom.searchBtn = $('#searchBtn');
    dom.tabsRoot = $('#tabs');
    dom.tabs = $$('#tabs .tab');

    if (!dom.grid) {
      console.warn('[Marketplace] Elemen #projects tidak ditemukan.');
    }
  }

  /* =========================================================
   * LOADING & EMPTY STATE
   * ========================================================= */
  function showLoading() {
    if (!dom.grid) return;
    // Sisipkan elemen loading di atas grid, tanpa menghapus card statis
    let loading = $('#mp-loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.id = 'mp-loading';
      loading.style.cssText = `
        grid-column:1/-1;padding:40px;text-align:center;
        color:var(--muted);font-family:'DM Mono',monospace;
        font-size:11px;letter-spacing:1px;
      `;
      loading.textContent = 'LOADING LISTINGS...';
      dom.grid.parentNode.insertBefore(loading, dom.grid);
    }
    loading.style.display = 'block';
  }

  function hideLoading() {
    const loading = $('#mp-loading');
    if (loading) loading.style.display = 'none';
  }

  function showError(message) {
    if (!dom.grid) return;
    let box = $('#mp-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'mp-error';
      box.style.cssText = `
        grid-column:1/-1;padding:20px;border:1px solid #6a3b3b;
        background:rgba(255,80,80,.05);border-radius:8px;
        color:#f87171;font-size:12px;
      `;
      dom.grid.parentNode.insertBefore(box, dom.grid);
    }
    box.textContent = 'Unable to load listings: ' + message;
    box.style.display = 'block';
  }

  function hideError() {
    const box = $('#mp-error');
    if (box) box.style.display = 'none';
  }

  /* =========================================================
   * RENDER
   * ========================================================= */
  function clearExistingCards() {
    // Hapus hanya card hasil render dinamis; pertahankan placeholder statis?
    // Karena source HTML berisi 6 card statis "demo" yang isinya bukan dari DB,
    // untuk marketplace yang hidup kita HARUS mengganti seluruh isi grid.
    // Card statis yang ada di HTML akan dihapus saat render pertama.
    if (!dom.grid) return;
    // Tandai render dinamis via data attribute
    dom.grid.dataset.dynamic = 'true';
    dom.grid.innerHTML = '';
  }

  function renderCards(listings) {
    if (!dom.grid) return;
    clearExistingCards();

    if (!listings.length) {
      if (dom.empty) {
        dom.empty.style.display = 'block';
        dom.empty.textContent = state.keyword
          ? 'Tidak ada proyek yang cocok dengan pencarian.'
          : 'Belum ada listing yang tersedia saat ini.';
      }
      if (dom.count) dom.count.textContent = '0 projects';
      return;
    }

    if (dom.empty) dom.empty.style.display = 'none';

    const frag = document.createDocumentFragment();

    listings.forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.stage = item.status || '';
      card.dataset.id = item.id;
      if (item.design_id) card.dataset.designId = item.design_id;

      const img = item.image_url
        ? `<img src="${escapeHTML(item.image_url)}" alt="${escapeHTML(item.title || 'Listing')}" loading="lazy">`
        : `<div style="width:100%;height:100%;display:grid;place-items:center;color:var(--muted);font-family:'DM Mono';font-size:10px;">NO IMAGE</div>`;

      const progress = typeof item.progress_pct === 'number' ? item.progress_pct : 0;
      const desc = item.description || '';

      card.innerHTML = `
        <div class="visual">
          ${img}
          <span class="status">${escapeHTML(statusLabel(item.status))}</span>
          <span class="kind">${escapeHTML(kindLabel(item.kind))}</span>
        </div>
        <div class="card-body">
          <h3>${escapeHTML(item.title || 'Untitled Listing')}</h3>
          <div class="desc">${escapeHTML(desc)}</div>
          <div class="brand">BY <strong>${escapeHTML(item.company_name || 'FastProduction')}</strong></div>
          <div class="progress-info">
            <span>PROGRESS</span>
            <span>${progress}%</span>
          </div>
          <div class="track"><div class="fill" style="width:${progress}%"></div></div>
          <div class="card-foot">
            <small${item.kind === 'independent' ? ' class="independent"' : ''}>${escapeHTML(footerNote(item.kind, item.status, progress))}</small>
            <a href="#" class="detail" data-action="detail" data-id="${escapeHTML(item.id)}">${escapeHTML(footerActionLabel(item.kind, item.status))} ↗</a>
          </div>
        </div>
      `;

      frag.appendChild(card);
    });

    dom.grid.appendChild(frag);

    if (dom.count) {
      dom.count.textContent = listings.length + ' projects';
    }
  }

  /* =========================================================
   * FETCH: product_listings
   * ========================================================= */
  async function fetchListings() {
    hideError();
    showLoading();
    state.loading = true;

    try {
      let query = db
        .from('product_listings')
        .select('id,design_id,title,description,kind,status,image_url,progress_pct,created_at')
        .order('created_at', { ascending: false });

      const statusFilter = TAB_STATUS_MAP[state.activeFilter];
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      if (state.keyword && state.keyword.trim()) {
        const kw = state.keyword.trim().replace(/[%_]/g, '\\$&');
        query = query.or(`title.ilike.%${kw}%,description.ilike.%${kw}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Marketplace] fetch listings:', error);
        state.lastError = error;
        state.listings = [];
        showError(error.message || 'Unknown error');
        renderCards([]);
        return;
      }

      state.lastError = null;
      state.listings = data || [];

      // Karena RLS companies tidak mengizinkan public read,
      // kita tidak akan resolve company_name via join.
      // Tampilkan fallback 'FastProduction' atau kosong.
      // Untuk user yang login DAN member company yang sama,
      // brand name akan tetap fallback karena kita tidak join.

      renderCards(state.listings);
    } catch (err) {
      console.error('[Marketplace] unexpected:', err);
      state.lastError = err;
      state.listings = [];
      showError(err.message || 'Unexpected error');
      renderCards([]);
    } finally {
      state.loading = false;
      hideLoading();
    }
  }

  /* =========================================================
   * EVENT HANDLERS
   * ========================================================= */
  function bindEvents() {
    // Tabs
    dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        dom.tabs.forEach(t => t.classList.toggle('active', t === tab));
        state.activeFilter = tab.dataset.filter || 'all';
        fetchListings();
      });
    });

    // Search input (debounced)
    let searchTimer = null;
    if (dom.search) {
      dom.search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.keyword = dom.search.value || '';
          fetchListings();
        }, 350);
      });

      dom.search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(searchTimer);
          state.keyword = dom.search.value || '';
          fetchListings();
        }
      });
    }

    // Search button
    if (dom.searchBtn) {
      dom.searchBtn.addEventListener('click', () => {
        state.keyword = dom.search?.value || '';
        fetchListings();
      });
    }

    // Detail action (event delegation)
    if (dom.grid) {
      dom.grid.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-action="detail"]');
        if (!link) return;
        e.preventDefault();
        const id = link.getAttribute('data-id');
        const item = state.listings.find(x => x.id === id);
        if (!item) return;

        // Tidak ada modal detail di HTML, tidak ada tabel detail lengkap
        // untuk publik. Tampilkan info ringkas via alert yang informatif.
        const lines = [
          item.title || 'Untitled',
          '',
          item.description || '(tanpa deskripsi)',
          '',
          `Tipe: ${kindLabel(item.kind)}`,
          `Status: ${statusLabel(item.status)}`,
          `Progress: ${item.progress_pct ?? 0}%`
        ];
        alert(lines.join('\n'));
      });
    }
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    cacheDom();

    if (!dom.grid) {
      console.warn('[Marketplace] Grid tidak ditemukan; inisialisasi dibatalkan.');
      return;
    }

    bindEvents();

    // Muat listing pertama
    await fetchListings();

    console.info('[Marketplace] Ready.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
