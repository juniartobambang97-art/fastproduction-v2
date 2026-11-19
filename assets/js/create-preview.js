/*! FastProduction V2 — create-preview.js
 *  Module 06: Design Preview — read-only review of saved design
 *  Dependencies: config.js, supabase.js, auth.js
 *  Target table: public.designs (schema verified)
 *  RLS: designs_read_co (member)
 */
(function () {
  'use strict';

  /* =========================================================
   * CONSTANTS
   * ========================================================= */
  const TOAST_DURATION = 4200;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    company: null,
    design: null,
    designId: null
  };

  /* =========================================================
   * DOM REFS
   * ========================================================= */
  const el = {
    content: null,
    loadingState: null,
    statusBadge: null,
    pageSubtitle: null
  };

  function cacheDom() {
    el.content = document.getElementById('content');
    el.loadingState = document.getElementById('loading-state');
    el.statusBadge = document.getElementById('status-badge');
    el.pageSubtitle = document.getElementById('page-subtitle');
  }

  /* =========================================================
   * UTILITIES
   * ========================================================= */
  const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatIDR = (n) => {
    if (n === null || n === undefined || n === '') return null;
    const num = Number(n);
    if (!Number.isFinite(num)) return null;
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  const formatQty = (n) => {
    if (n === null || n === undefined || n === '') return null;
    const num = Number(n);
    if (!Number.isFinite(num)) return null;
    return num.toLocaleString('id-ID') + ' pcs';
  };

  const formatDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return null; }
  };

  const getDesignIdFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      if (id && UUID_REGEX.test(id)) return id;
    } catch (_) {}
    return null;
  };

  const statusLabel = (status) => {
    const map = {
      draft: 'DRAFT',
      published: 'PUBLISHED',
      archived: 'ARCHIVED',
      active: 'ACTIVE'
    };
    return map[status] || String(status || 'DRAFT').toUpperCase();
  };

  /* =========================================================
   * TOAST SYSTEM
   * ========================================================= */
  let toastRoot = null;
  function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    toastRoot = document.createElement('div');
    toastRoot.setAttribute('style',
      'position:fixed;top:20px;right:20px;z-index:9999;' +
      'display:flex;flex-direction:column;gap:10px;pointer-events:none;' +
      'max-width:calc(100vw - 40px);');
    document.body.appendChild(toastRoot);
    return toastRoot;
  }

  function toast(message, type = 'info') {
    const root = ensureToastRoot();
    const palette = {
      success: { bg: '#1d2a1d', border: '#52613d', text: '#c5f36b' },
      error:   { bg: '#2a1a1a', border: '#6b3232', text: '#f3a0a0' },
      info:    { bg: '#1a2230', border: '#3a4b66', text: '#a9c0ea' },
      warn:    { bg: '#2a2416', border: '#6b5a2e', text: '#f3d76b' }
    };
    const c = palette[type] || palette.info;
    const node = document.createElement('div');
    node.setAttribute('style',
      `pointer-events:auto;min-width:240px;max-width:340px;padding:12px 16px;` +
      `border-radius:6px;background:${c.bg};border:1px solid ${c.border};color:${c.text};` +
      `font:12px 'Manrope',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);` +
      `opacity:0;transform:translateX(20px);transition:all .25s ease;word-break:break-word;`);
    node.textContent = message;
    root.appendChild(node);
    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateX(20px)';
      setTimeout(() => node.remove(), 260);
    }, TOAST_DURATION);
  }

  /* =========================================================
   * AUTH + COMPANY (same pattern as create-design.js / dashboard.js)
   * ========================================================= */
  async function loadSessionAndCompany() {
    const Auth = window.FPAuth;
    const db = window.fpSupabase;

    if (!Auth) {
      showError('Auth module tidak tersedia.', 'Silakan refresh halaman.');
      return false;
    }
    if (!db) {
      showError('Supabase client tidak tersedia.', 'Periksa koneksi internet Anda.');
      return false;
    }

    let session = null;
    try {
      session = await Auth.getSession();
    } catch (err) {
      console.warn('[CreatePreview] getSession error:', err);
    }

    if (!session || !session.user) {
      toast('Silakan login terlebih dahulu.', 'warn');
      setTimeout(() => { window.location.replace('login.html'); }, 1200);
      return false;
    }
    state.user = session.user;

    try {
      state.profile = await Auth.getProfile(session.user.id);
    } catch (err) {
      console.warn('[CreatePreview] getProfile error:', err);
      state.profile = null;
    }

    await loadCompany();

    if (!state.company) {
      showError(
        'Anda belum tergabung di company manapun.',
        'Buat company terlebih dahulu melalui halaman Profile.'
      );
      return false;
    }

    return true;
  }

  async function loadCompany() {
    const db = window.fpSupabase;
    const companyId = state.profile?.default_company_id;

    if (companyId) {
      const { data, error } = await db
        .from('companies')
        .select('id,name,type')
        .eq('id', companyId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!error && data) {
        state.company = data;
        return;
      }
    }

    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,joined_at')
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false })
      .limit(1);

    if (error || !memberships?.length) return;

    const { data: company } = await db
      .from('companies')
      .select('id,name,type')
      .eq('id', memberships[0].company_id)
      .is('deleted_at', null)
      .maybeSingle();

    state.company = company || null;
  }

  /* =========================================================
   * LOAD DESIGN
   * ========================================================= */
  async function loadDesign(designId) {
    const db = window.fpSupabase;

    const { data, error } = await db
      .from('designs')
      .select('id,company_id,name,material,technique,min_qty,max_qty,cost_estimate,status,front_image_url,back_image_url,detail_image_url,created_at,updated_at')
      .eq('id', designId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      console.error('[CreatePreview] loadDesign:', error);
      showError(
        'Gagal memuat desain.',
        error.message || 'Periksa koneksi Anda dan coba lagi.'
      );
      return false;
    }

    if (!data) {
      showError(
        'Desain tidak ditemukan.',
        'Desain mungkin sudah dihapus atau Anda tidak memiliki akses.'
      );
      return false;
    }

    if (data.company_id !== state.company.id) {
      showError(
        'Akses ditolak.',
        'Desain ini bukan milik company Anda.'
      );
      return false;
    }

    state.design = data;
    return true;
  }

  /* =========================================================
   * RENDER
   * ========================================================= */
  function renderDesign() {
    const d = state.design;
    if (!d || !el.content) return;

    // Update status badge
    if (el.statusBadge) {
      el.statusBadge.textContent = '● ' + statusLabel(d.status);
      el.statusBadge.classList.remove('live', 'draft');
      if (d.status === 'draft') el.statusBadge.classList.add('draft');
      else el.statusBadge.classList.add('live');
    }

    // Update subtitle
    if (el.pageSubtitle) {
      el.pageSubtitle.textContent = `Review desain "${d.name}" sebelum melanjutkan.`;
    }

    const val = (v, fallback = 'Belum diisi') =>
      (v === null || v === undefined || v === '') ? fallback : v;

    const emptyClass = (v) =>
      (v === null || v === undefined || v === '') ? ' empty' : '';

    const minQtyText = formatQty(d.min_qty);
    const maxQtyText = formatQty(d.max_qty);
    const costText = formatIDR(d.cost_estimate);
    const createdText = formatDate(d.created_at);
    const updatedText = formatDate(d.updated_at);

    const visualAssets = [
      ['Front View', d.front_image_url],
      ['Back View', d.back_image_url],
      ['Detail View', d.detail_image_url]
    ].filter(item => item[1]);

    const visualGallery = visualAssets.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
          ${visualAssets.map(([label, url]) => `
            <div style="min-width:0;">
              <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"
                loading="lazy"
                style="width:100%;height:220px;object-fit:contain;background:#0c100e;border:1px solid #465248;border-radius:6px;">
              <div style="font-size:10px;color:#aab5aa;margin-top:7px;">${label}</div>
            </div>
          `).join('')}
        </div>`
      : `<div class="visual-placeholder">
          <strong>+</strong>
          <div>Visual assets belum tersedia.</div>
        </div>`;

    const marketplaceImage = d.front_image_url || d.back_image_url || d.detail_image_url;

    el.content.innerHTML = `
      <!-- Design Identity -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Design Identity</h2>
            <div class="section-desc">Informasi dasar desain yang tersimpan.</div>
          </div>
          <span class="tag">01 / IDENTITY</span>
        </div>
        <div class="field-grid">
          <div class="field full">
            <span class="field-label">Design Name</span>
            <div class="field-value large${emptyClass(d.name)}">${escapeHtml(val(d.name))}</div>
          </div>
          <div class="field">
            <span class="field-label">Status</span>
            <div class="field-value mono${emptyClass(d.status)}">${escapeHtml(statusLabel(d.status))}</div>
          </div>
          <div class="field">
            <span class="field-label">Design ID</span>
            <div class="field-value mono">${escapeHtml(d.id.slice(0, 8).toUpperCase())}…</div>
          </div>
          <div class="field">
            <span class="field-label">Created</span>
            <div class="field-value mono${emptyClass(createdText)}">${escapeHtml(val(createdText))}</div>
          </div>
          <div class="field">
            <span class="field-label">Last Updated</span>
            <div class="field-value mono${emptyClass(updatedText)}">${escapeHtml(val(updatedText))}</div>
          </div>
        </div>
      </section>

      <!-- Product Specification -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Product Specification</h2>
            <div class="section-desc">Detail material dan teknik produksi.</div>
          </div>
          <span class="tag">02 / SPEC</span>
        </div>
        <div class="field-grid">
          <div class="field">
            <span class="field-label">Main Material</span>
            <div class="field-value${emptyClass(d.material)}">${escapeHtml(val(d.material))}</div>
          </div>
          <div class="field">
            <span class="field-label">Production Technique</span>
            <div class="field-value${emptyClass(d.technique)}">${escapeHtml(val(d.technique))}</div>
          </div>
        </div>
      </section>

      <!-- Production Target -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Production Target</h2>
            <div class="section-desc">Target kuantitas produksi.</div>
          </div>
          <span class="tag">03 / TARGET</span>
        </div>
        <div class="field-grid">
          <div class="field">
            <span class="field-label">Minimum Quantity</span>
            <div class="field-value mono${emptyClass(minQtyText)}">${escapeHtml(val(minQtyText))}</div>
          </div>
          <div class="field">
            <span class="field-label">Maximum Quantity</span>
            <div class="field-value mono${emptyClass(maxQtyText)}">${escapeHtml(val(maxQtyText))}</div>
          </div>
        </div>
      </section>

      <!-- Cost Estimate -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Cost Estimate</h2>
            <div class="section-desc">Estimasi biaya produksi per unit.</div>
          </div>
          <span class="tag">04 / COST</span>
        </div>
        <div class="field-grid">
          <div class="field full">
            <span class="field-label">Estimated Cost</span>
            <div class="field-value mono large${emptyClass(costText)}">${escapeHtml(val(costText))}</div>
          </div>
        </div>
      </section>

      <!-- Visual Assets -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Visual Assets</h2>
            <div class="section-desc">Gambar referensi desain.</div>
          </div>
          <span class="tag">05 / VISUAL</span>
        </div>
        ${visualGallery}
      </section>

      <!-- Marketplace Preview Card -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Marketplace Preview</h2>
            <div class="section-desc">Pratinjau bagaimana desain akan tampil di marketplace.</div>
          </div>
          <span class="tag">06 / PREVIEW</span>
        </div>
        <div class="info-note">
          <strong>PREVIEW MODE</strong>
          Tampilan di bawah ini adalah simulasi card marketplace berdasarkan data desain yang tersimpan.
          Beberapa informasi (brand, deskripsi, gambar) belum tersedia karena belum diinput pada tahap Create Design.
        </div>
        <article class="preview-card">
          <div class="visual">
            ${marketplaceImage
              ? `<img src="${escapeHtml(marketplaceImage)}" alt="${escapeHtml(d.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
              : 'NO IMAGE'}
          </div>
          <div class="body">
            <h3>${escapeHtml(d.name || 'Untitled Design')}</h3>
            <div class="desc">Deskripsi desain belum diisi.</div>
            <div class="brand">BY <strong>${escapeHtml(state.company?.name || 'FastProduction')}</strong></div>
            <div class="progress-info">
              <span>TARGET</span>
              <span>${escapeHtml(minQtyText || maxQtyText || '—')}</span>
            </div>
            <div class="track"><div class="fill" style="width:0%"></div></div>
            <div class="foot">
              <small>${escapeHtml(statusLabel(d.status))}</small>
              <a href="#" onclick="return false">VIEW DESIGN ↗</a>
            </div>
          </div>
        </article>
      </section>

      <!-- Actions -->
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Next Steps</h2>
            <div class="section-desc">Lanjutkan atau kembali ke editor desain.</div>
          </div>
          <span class="tag">07 / ACTIONS</span>
        </div>
        <div class="actions">
          <a class="btn" href="create-design.html?id=${escapeHtml(d.id)}">← Back to Design Editor</a>
          <button type="button" class="btn primary" id="btn-continue" disabled>Continue to Next Stage →</button>
        </div>
        <div class="info-note" style="margin-top:17px;">
          <strong>NOTE</strong>
          Tahap berikutnya (Publish to Marketplace) akan tersedia setelah fitur listing diimplementasikan.
          Untuk saat ini, Anda dapat kembali ke editor untuk memperbarui desain.
        </div>
      </section>
    `;

    // Bind continue button
    const btnContinue = document.getElementById('btn-continue');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        toast('Tahap berikutnya belum tersedia. Fitur ini akan dirilis pada versi selanjutnya.', 'info');
      });
      btnContinue.disabled = false;
    }
  }

  /* =========================================================
   * ERROR / LOADING STATES
   * ========================================================= */
  function showError(title, message) {
    if (!el.content) return;
    if (el.loadingState) el.loadingState.style.display = 'none';
    el.content.innerHTML = `
      <div class="error-state">
        <strong>${escapeHtml(title)}</strong>
        <div>${escapeHtml(message || '')}</div>
        <div class="actions">
          <a class="btn" href="create-design.html">← Back to Design Studio</a>
          <a class="btn" href="dashboard.html">Go to Dashboard</a>
        </div>
      </div>
    `;
  }

  function hideLoading() {
    if (el.loadingState) el.loadingState.style.display = 'none';
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    cacheDom();

    if (!el.content) {
      console.error('[CreatePreview] Content container not found.');
      return;
    }

    // 1. Validate URL parameter
    const designId = getDesignIdFromUrl();
    if (!designId) {
      showError(
        'Parameter desain tidak valid.',
        'Halaman ini harus dibuka melalui tombol "Continue to Preview" dari Create Design.'
      );
      return;
    }
    state.designId = designId;

    // 2. Auth + company
    const ready = await loadSessionAndCompany();
    if (!ready) return;

    // 3. Load design
    const loaded = await loadDesign(designId);
    if (!loaded) return;

    // 4. Render
    hideLoading();
    renderDesign();
    toast('Desain berhasil dimuat.', 'success');
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
