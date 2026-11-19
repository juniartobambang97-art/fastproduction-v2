/*! FastProduction V2 — create-design.js
 *  Module 05: Creator Studio — Design creation & editing
 *  Dependencies: config.js, supabase.js, auth.js
 *  Target table: public.designs (schema verified)
 *  RLS: designs_read_co (member), designs_write_admin (admin)
 */
(function () {
  'use strict';

  /* =========================================================
   * CONSTANTS
   * ========================================================= */
  const DRAFT_KEY_PREFIX = 'fp:cd:draft:';
  const MAX_NAME_LENGTH = 120;
  const TOAST_DURATION = 3800;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    designId: null,
    mode: 'create',           // 'create' | 'edit'
    originalStatus: 'draft',
    isSubmitting: false,
    isDirty: false,
    lastSavedAt: null
  };

  /* =========================================================
   * DOM REFS
   * ========================================================= */
  const el = {
    form: {},
    btnSaveDraft: null,
    btnContinue: null,
    draftBadge: null,
    previewBox: null,
    previewSection: null
  };

  function cacheDom() {
    el.form = {
      name:              document.getElementById('design-name'),
      designer:          document.getElementById('designer-brand'),
      category:          document.getElementById('product-category'),
      description:       document.getElementById('design-description'),
      material:          document.getElementById('main-material'),
      colorVariant:      document.getElementById('color-variant'),
      sizes:             document.getElementById('available-sizes'),
      technique:         document.getElementById('production-technique'),
      constructionNotes: document.getElementById('construction-notes'),
      minQty:            document.getElementById('min-qty'),
      maxQty:            document.getElementById('max-qty'),
      interestPeriod:    document.getElementById('interest-period'),
      poPaymentPeriod:   document.getElementById('po-payment-period'),
      costMaterial:      document.getElementById('cost-material'),
      costLabor:         document.getElementById('cost-labor'),
      costOther:         document.getElementById('cost-other'),
      costMargin:        document.getElementById('cost-margin'),
      costQuantity:      document.getElementById('cost-quantity'),
      costEstimate:      document.getElementById('cost-estimate'),
      costTotalDisplay:  document.getElementById('cost-total-display'),
      costBatchDisplay:  document.getElementById('cost-batch-display'),
      costPriceDisplay:  document.getElementById('cost-price-display'),
      costProfitDisplay: document.getElementById('cost-profit-display')
    };
    el.btnSaveDraft    = document.getElementById('btn-save-draft');
    el.btnContinue     = document.getElementById('btn-continue-preview');
    el.draftBadge      = document.getElementById('draft-badge');
    el.previewBox      = document.getElementById('marketplace-preview');
    el.previewSection  = document.getElementById('preview-section');
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

  const toIntOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i;
  };

  function calculateCost() {
    const read = (input) => {
      const value = Number(input?.value || 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };

    const material = read(el.form.costMaterial);
    const labor = read(el.form.costLabor);
    const other = read(el.form.costOther);
    const margin = Math.min(99, Math.max(0, read(el.form.costMargin)));

    const quantityInput = read(el.form.costQuantity);
    const minQuantity = read(el.form.minQty);
    const quantity = Math.floor(quantityInput || minQuantity);

    const unitCost = Math.round(material + labor + other);
    const sellingPrice = margin >= 100
      ? unitCost
      : Math.ceil(unitCost / (1 - margin / 100));
    const batchCost = quantity > 0 ? unitCost * quantity : 0;
    const grossProfit = quantity > 0
      ? (sellingPrice - unitCost) * quantity
      : 0;

    const money = (value) => 'Rp ' + Math.round(value).toLocaleString('id-ID');

    if (el.form.costEstimate) {
      el.form.costEstimate.value = String(unitCost);
    }
    if (el.form.costTotalDisplay) {
      el.form.costTotalDisplay.textContent = money(unitCost);
    }
    if (el.form.costBatchDisplay) {
      el.form.costBatchDisplay.textContent = money(batchCost);
    }
    if (el.form.costPriceDisplay) {
      el.form.costPriceDisplay.textContent = money(sellingPrice);
    }
    if (el.form.costProfitDisplay) {
      el.form.costProfitDisplay.textContent = money(grossProfit);
    }

    return unitCost;
  }

  const getDesignIdFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      if (id && UUID_REGEX.test(id)) return id;
    } catch (_) {}
    return null;
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
   * AUTH + COMPANY (follows dashboard.js / profile.js pattern)
   * ========================================================= */
  async function loadSessionAndCompany() {
    const Auth = window.FPAuth;
    const db = window.fpSupabase;

    if (!Auth) {
      toast('Auth module tidak tersedia.', 'error');
      return false;
    }
    if (!db) {
      toast('Supabase client tidak tersedia.', 'error');
      return false;
    }

    let session = null;
    try {
      session = await Auth.getSession();
    } catch (err) {
      console.warn('[CreateDesign] getSession error:', err);
    }

    if (!session || !session.user) {
      toast('Silakan login terlebih dahulu.', 'warn');
      setTimeout(() => { window.location.replace('login.html'); }, 1200);
      return false;
    }
    state.user = session.user;

    // Load profile
    try {
      state.profile = await Auth.getProfile(session.user.id);
    } catch (err) {
      console.warn('[CreateDesign] getProfile error:', err);
      state.profile = null;
    }

    // Resolve company (same pattern as dashboard.js)
    await loadCompany();

    if (!state.company) {
      toast('Anda belum tergabung di company manapun. Buat company terlebih dahulu.', 'error');
      setTimeout(() => { window.location.replace('profile.html'); }, 2200);
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
        .select('id,name,type,verified_at')
        .eq('id', companyId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) console.warn('[CreateDesign] company lookup:', error.message);

      if (data) {
        state.company = data;
        const { data: member, error: mErr } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();
        if (mErr) console.warn('[CreateDesign] membership lookup:', mErr.message);
        state.membership = member || null;
        return;
      }
    }

    // Fallback: latest membership
    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,member_role,joined_at')
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[CreateDesign] membership fallback:', error.message);
      return;
    }
    if (!memberships || !memberships.length) return;

    state.membership = memberships[0];

    const { data: company, error: cErr } = await db
      .from('companies')
      .select('id,name,type,verified_at')
      .eq('id', memberships[0].company_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (cErr) console.warn('[CreateDesign] company from fallback:', cErr.message);
    state.company = company || null;
  }

  /* =========================================================
   * LOCAL DRAFT
   * Key format: fp:cd:draft:<userId>:<companyId>
   * - Separate per user + per company
   * - Contains ALL form fields (including those not in DB)
   * - NEVER deleted after DB save (extra fields still relevant)
   * ========================================================= */
  function getDraftKey() {
    if (!state.user || !state.company) return null;
    return `${DRAFT_KEY_PREFIX}${state.user.id}:${state.company.id}`;
  }

  function collectFormData() {
    return {
      name:              el.form.name?.value || '',
      designer:          el.form.designer?.value || '',
      category:          el.form.category?.value || '',
      description:       el.form.description?.value || '',
      material:          el.form.material?.value || '',
      colorVariant:      el.form.colorVariant?.value || '',
      sizes:             el.form.sizes?.value || '',
      technique:         el.form.technique?.value || '',
      constructionNotes: el.form.constructionNotes?.value || '',
      minQty:            el.form.minQty?.value || '',
      maxQty:            el.form.maxQty?.value || '',
      interestPeriod:    el.form.interestPeriod?.value || '',
      poPaymentPeriod:   el.form.poPaymentPeriod?.value || '',
      costMaterial:      el.form.costMaterial?.value || '',
      costLabor:         el.form.costLabor?.value || '',
      costOther:         el.form.costOther?.value || '',
      costMargin:        el.form.costMargin?.value || '30',
      costQuantity:      el.form.costQuantity?.value || '',
      savedAt:           Date.now()
    };
  }

  function saveLocalDraft() {
    const key = getDraftKey();
    if (!key) return;
    try {
      const data = collectFormData();
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.warn('[CreateDesign] saveLocalDraft:', err);
    }
  }

  function restoreLocalDraft() {
    const key = getDraftKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);

      // In EDIT mode: only restore EXTRA fields (not in DB) to avoid
      // overwriting actual DB data. DB fields come from loadDesign().
      // In CREATE mode: restore everything.
      if (state.mode === 'create') {
        if (el.form.name && !el.form.name.value && data.name) el.form.name.value = data.name;
        if (el.form.material && !el.form.material.value && data.material) el.form.material.value = data.material;
        if (el.form.technique && !el.form.technique.value && data.technique) el.form.technique.value = data.technique;
        if (el.form.minQty && !el.form.minQty.value && data.minQty) el.form.minQty.value = data.minQty;
        if (el.form.maxQty && !el.form.maxQty.value && data.maxQty) el.form.maxQty.value = data.maxQty;
      }

      // Extra fields — always restored (not in DB schema)
      if (el.form.designer && data.designer)               el.form.designer.value = data.designer;
      if (el.form.category && data.category)               el.form.category.value = data.category;
      if (el.form.description && data.description)         el.form.description.value = data.description;
      if (el.form.colorVariant && data.colorVariant)       el.form.colorVariant.value = data.colorVariant;
      if (el.form.sizes && data.sizes)                     el.form.sizes.value = data.sizes;
      if (el.form.constructionNotes && data.constructionNotes) el.form.constructionNotes.value = data.constructionNotes;
      if (el.form.interestPeriod && data.interestPeriod)   el.form.interestPeriod.value = data.interestPeriod;
      if (el.form.poPaymentPeriod && data.poPaymentPeriod) el.form.poPaymentPeriod.value = data.poPaymentPeriod;

      if (el.form.costMaterial && data.costMaterial !== undefined) el.form.costMaterial.value = data.costMaterial;
      if (el.form.costLabor && data.costLabor !== undefined) el.form.costLabor.value = data.costLabor;
      if (el.form.costOther && data.costOther !== undefined) el.form.costOther.value = data.costOther;
      if (el.form.costMargin && data.costMargin !== undefined) el.form.costMargin.value = data.costMargin;
      if (el.form.costQuantity && data.costQuantity !== undefined) el.form.costQuantity.value = data.costQuantity;

      calculateCost();
    } catch (err) {
      console.warn('[CreateDesign] restoreLocalDraft:', err);
    }
  }

  /* =========================================================
   * LOAD EXISTING DESIGN (EDIT MODE)
   * ========================================================= */
  async function loadDesign(designId) {
    const db = window.fpSupabase;
    const { data, error } = await db
      .from('designs')
      .select('*')
      .eq('id', designId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      console.error('[CreateDesign] loadDesign:', error);
      toast('Gagal memuat desain: ' + (error.message || 'unknown'), 'error');
      return false;
    }
    if (!data) {
      toast('Desain tidak ditemukan atau sudah dihapus.', 'error');
      return false;
    }
    if (data.company_id !== state.company.id) {
      toast('Desain ini bukan milik company Anda.', 'error');
      return false;
    }

    state.designId = data.id;
    state.mode = 'edit';
    state.originalStatus = data.status || 'draft';

    // Populate DB-backed fields
    if (el.form.name)      el.form.name.value      = data.name || '';
    if (el.form.material)  el.form.material.value  = data.material || '';
    if (el.form.technique) el.form.technique.value = data.technique || '';
    if (el.form.minQty)    el.form.minQty.value    = data.min_qty != null ? data.min_qty : '';
    if (el.form.maxQty)    el.form.maxQty.value    = data.max_qty != null ? data.max_qty : '';

    // Update UI chrome
    if (el.draftBadge) {
      const label = data.status === 'draft' ? 'EDITING / DRAFT' : 'EDITING / ' + (data.status || '').toUpperCase();
      el.draftBadge.textContent = '● ' + label;
    }

    // Restore extra fields from local draft (non-DB fields)
    restoreLocalDraft();

    toast('Desain berhasil dimuat.', 'info');
    return true;
  }

  /* =========================================================
   * VALIDATION
   * ========================================================= */
  function validate() {
    const errors = [];
    const name = (el.form.name?.value || '').trim();
    if (!name) {
      errors.push('Nama desain wajib diisi.');
    } else if (name.length > MAX_NAME_LENGTH) {
      errors.push(`Nama desain maksimal ${MAX_NAME_LENGTH} karakter.`);
    }

    const minQ = toIntOrNull(el.form.minQty?.value);
    const maxQ = toIntOrNull(el.form.maxQty?.value);

    if (minQ !== null) {
      if (minQ < 0) errors.push('Minimum quantity tidak boleh negatif.');
      if (!Number.isInteger(minQ)) errors.push('Minimum quantity harus bilangan bulat.');
    }
    if (maxQ !== null) {
      if (maxQ < 0) errors.push('Maximum quantity tidak boleh negatif.');
      if (!Number.isInteger(maxQ)) errors.push('Maximum quantity harus bilangan bulat.');
    }
    if (minQ !== null && maxQ !== null && maxQ < minQ) {
      errors.push('Maximum quantity harus ≥ minimum quantity.');
    }

    const interestP = toIntOrNull(el.form.interestPeriod?.value);
    const poP = toIntOrNull(el.form.poPaymentPeriod?.value);
    if (interestP !== null && interestP < 1) errors.push('Interest period minimal 1 hari.');
    if (poP !== null && poP < 1) errors.push('PO payment period minimal 1 hari.');

    return errors;
  }

  /* =========================================================
   * LIVE PREVIEW (uses textContent — XSS safe)
   * ========================================================= */
  function renderPreview() {
    if (!el.previewBox) return;

    const d = collectFormData();
    const minQ = toIntOrNull(d.minQty);
    const maxQ = toIntOrNull(d.maxQty);
    const qtyText = (minQ != null && maxQ != null) ? `${minQ} – ${maxQ} pcs`
                  : (minQ != null ? `min. ${minQ} pcs`
                  : (maxQ != null ? `max. ${maxQ} pcs` : '—'));

    // Clear previous content
    el.previewBox.innerHTML = '';

    // Title
    const title = document.createElement('strong');
    title.style.cssText = 'display:block;color:var(--lime);font:13px var(--mono);margin-bottom:8px;text-align:left;';
    title.textContent = d.name || 'Untitled Design';
    el.previewBox.appendChild(title);

    // Rows
    const rows = [
      ['Designer',  d.designer],
      ['Category',  d.category],
      ['Material',  d.material],
      ['Technique', d.technique],
      ['Colors',    d.colorVariant],
      ['Sizes',     d.sizes],
      ['Target Qty', qtyText]
    ];

    const wrap = document.createElement('div');
    wrap.style.cssText = 'color:var(--muted);font-size:11px;line-height:1.9;text-align:left;';

    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      const lbl = document.createElement('span');
      lbl.style.color = '#b9c3bb';
      lbl.textContent = label + ': ';
      row.appendChild(lbl);
      row.appendChild(document.createTextNode(value || '—'));
      wrap.appendChild(row);
    });

    // Description excerpt
    if (d.description && d.description.trim()) {
      const desc = document.createElement('div');
      desc.style.cssText = 'margin-top:10px;color:#849087;font-size:10px;line-height:1.6;';
      const text = d.description.trim();
      desc.textContent = text.length > 180 ? text.slice(0, 180) + '…' : text;
      wrap.appendChild(desc);
    }

    el.previewBox.appendChild(wrap);
  }

  /* =========================================================
   * SAVE TO SUPABASE
   * - Only fields present in public.designs schema
   * - Handles RLS errors gracefully
   * - After insert: updates URL to ?id=... to switch to edit mode
   * - Does NOT delete local draft (extra fields still relevant)
   * ========================================================= */
  async function saveDesign({ status, scrollAfter }) {
    if (state.isSubmitting) return;

    const errors = validate();
    if (errors.length) {
      toast(errors[0], 'error');
      return false;
    }

    const db = window.fpSupabase;
    if (!db) {
      toast('Supabase client tidak tersedia.', 'error');
      return false;
    }
    if (!state.company || !state.company.id) {
      toast('Company tidak valid.', 'error');
      return false;
    }

    state.isSubmitting = true;
    setSubmittingUI(true);

    const payload = {
      name:      (el.form.name.value || '').trim(),
      material:  (el.form.material.value || '').trim() || null,
      technique: (el.form.technique.value || '').trim() || null,
      min_qty:   toIntOrNull(el.form.minQty.value),
      max_qty:   toIntOrNull(el.form.maxQty.value),
      status:    status || 'draft',
      cost_estimate: Number(el.form.costEstimate?.value || 0),
      updated_at: new Date().toISOString()
    };

    try {
      let result;

      if (state.mode === 'edit' && state.designId) {
        // UPDATE — do not send company_id / created_at
        result = await db
          .from('designs')
          .update(payload)
          .eq('id', state.designId)
          .is('deleted_at', null)
          .select('id')
          .maybeSingle();

        if (result.error) throw result.error;
        if (!result.data) {
          throw new Error('Desain tidak ditemukan atau akses ditolak (RLS).');
        }
        state.lastSavedAt = Date.now();
        toast('Desain berhasil diperbarui.', 'success');
      } else {
        // INSERT
        payload.company_id = state.company.id;
        payload.created_at = new Date().toISOString();

        result = await db
          .from('designs')
          .insert(payload)
          .select('id')
          .single();

        if (result.error) throw result.error;

        state.designId = result.data.id;
        state.mode = 'edit';
        state.lastSavedAt = Date.now();

        // Update URL so subsequent saves become UPDATE, not INSERT
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('id', state.designId);
          window.history.replaceState({}, '', url.toString());
        } catch (_) {}

        toast('Desain berhasil disimpan.', 'success');
      }

      // Persist local draft (extra fields remain available)
      saveLocalDraft();
      state.isDirty = false;

      if (scrollAfter && el.previewSection) {
        setTimeout(() => {
          el.previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          toast('Halaman preview akan tersedia di versi selanjutnya. Data sudah tersimpan.', 'info');
        }, 500);
      }

      return true;
    } catch (err) {
      console.error('[CreateDesign] save error:', err);
      const msg = mapSupabaseError(err);
      toast(msg, 'error');
      return false;
    } finally {
      state.isSubmitting = false;
      setSubmittingUI(false);
    }
  }

  function mapSupabaseError(err) {
    const msg = (err && err.message) || 'Gagal menyimpan desain.';
    if (/new row violates row-level security/i.test(msg) ||
        /row-level security/i.test(msg)) {
      return 'Akses ditolak: hanya admin company yang dapat membuat/mengedit desain.';
    }
    if (/violates row-level security/i.test(msg)) {
      return 'Akses ditolak oleh kebijakan keamanan.';
    }
    if (/chk_design_qty|violates check/i.test(msg)) {
      return 'Validasi gagal: maximum quantity harus ≥ minimum quantity.';
    }
    if (/min_qty_check|max_qty_check/i.test(msg)) {
      return 'Quantity tidak boleh negatif.';
    }
    if (/duplicate|unique/i.test(msg)) {
      return 'Desain dengan nama ini sudah ada.';
    }
    if (/not found/i.test(msg)) {
      return 'Desain tidak ditemukan.';
    }
    return msg.length > 160 ? msg.slice(0, 160) + '…' : msg;
  }

  /* =========================================================
   * UI STATE
   * ========================================================= */
  function setSubmittingUI(isSubmitting) {
    const label = isSubmitting ? 'Menyimpan…' : null;

    if (el.btnSaveDraft) {
      el.btnSaveDraft.disabled = isSubmitting;
      if (isSubmitting) {
        el.btnSaveDraft.dataset.originalText = el.btnSaveDraft.dataset.originalText || el.btnSaveDraft.textContent;
        el.btnSaveDraft.textContent = label;
      } else if (el.btnSaveDraft.dataset.originalText) {
        el.btnSaveDraft.textContent = el.btnSaveDraft.dataset.originalText;
      }
    }
    if (el.btnContinue) {
      el.btnContinue.disabled = isSubmitting;
      if (isSubmitting) {
        el.btnContinue.dataset.originalText = el.btnContinue.dataset.originalText || el.btnContinue.textContent;
        el.btnContinue.textContent = label;
      } else if (el.btnContinue.dataset.originalText) {
        el.btnContinue.textContent = el.btnContinue.dataset.originalText;
      }
    }
  }


  /* LOCAL IMAGE PREVIEW */
  const uploadImages = {};

  function bindUploadEvents() {
    document.querySelectorAll('[data-upload-slot]').forEach((card) => {
      const input = card.querySelector('.upload-input');
      if (!input) return;

      card.addEventListener('click', (event) => {
        if (event.target.closest('.upload-remove')) return;
        if (event.target !== input) input.click();
      });

      card.addEventListener('keydown', (event) => {
        if (event.target !== card) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      });

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          toast('Pilih file gambar yang valid.', 'error');
          input.value = '';
          return;
        }
        if (file.size > 8 * 1024 * 1024) {
          toast('Ukuran gambar maksimal 8 MB.', 'warn');
          input.value = '';
          return;
        }

        const slot = card.dataset.uploadSlot;
        if (uploadImages[slot]?.url) URL.revokeObjectURL(uploadImages[slot].url);

        const url = URL.createObjectURL(file);
        uploadImages[slot] = { file, url };
        renderUploadPreview(card, input, file, url);
        state.isDirty = true;
        toast('Gambar berhasil dipilih.', 'success');
      });
    });
  }

  function renderUploadPreview(card, input, file, url) {
    card.classList.add('has-image');
    card.replaceChildren(input);

    const img = document.createElement('img');
    img.className = 'upload-preview';
    img.src = url;
    img.alt = 'Preview gambar';
    card.appendChild(img);

    const filename = document.createElement('span');
    filename.className = 'upload-filename';
    filename.textContent = file.name;
    card.appendChild(filename);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'upload-remove';
    remove.textContent = 'Hapus gambar';

    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      const slot = card.dataset.uploadSlot;
      if (uploadImages[slot]?.url) URL.revokeObjectURL(uploadImages[slot].url);
      delete uploadImages[slot];

      input.value = '';
      card.classList.remove('has-image');
      card.replaceChildren(input);

      const labels = {
        front: ['Front View', 'Product front design'],
        back: ['Back View', 'Product back design'],
        detail: ['Detail View', 'Close-up references']
      };
      const label = labels[slot];

      const plus = document.createElement('strong');
      plus.textContent = '+';
      card.appendChild(plus);
      card.appendChild(document.createTextNode(label[0]));

      const desc = document.createElement('span');
      desc.textContent = label[1];
      card.appendChild(desc);
      state.isDirty = true;
    });

    card.appendChild(remove);
  }

  /* =========================================================
   * EVENT BINDING
   * ========================================================= */
  function bindEvents() {
    if (el.btnSaveDraft) {
      el.btnSaveDraft.addEventListener('click', (e) => {
        e.preventDefault();
        saveDesign({ status: 'draft', scrollAfter: false });
      });
    }

    if (el.btnContinue) {
      el.btnContinue.addEventListener('click', async (e) => {
        e.preventDefault();
        // create-preview.html does not exist yet (verified in diagnostic).
        // Safe fallback: save → scroll to preview section → informative toast.
        const ok = await saveDesign({ status: 'draft', scrollAfter: true });
        if (!ok) return;
      });
    }

    // Cost Engine live calculation.
    [
      el.form.costMaterial,
      el.form.costLabor,
      el.form.costOther,
      el.form.costMargin,
      el.form.costQuantity,
      el.form.minQty
    ].filter(Boolean).forEach((input) => {
      input.addEventListener('input', calculateCost);
      input.addEventListener('change', calculateCost);
    });

    // Live preview + local draft autosave.
    // Only real form controls are included; display nodes are excluded.
    const inputs = Object.values(el.form).filter((input) =>
      input && typeof input.addEventListener === 'function' &&
      ('value' in input) && input.type !== 'hidden'
    );
    let saveTimer = null;

    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        state.isDirty = true;
        renderPreview();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveLocalDraft, 400);
      });
      input.addEventListener('change', () => {
        state.isDirty = true;
        renderPreview();
        saveLocalDraft();
      });
    });

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (state.isDirty && !state.isSubmitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    cacheDom();

    // Sanity check: critical DOM must exist
    if (!el.form.name || !el.btnSaveDraft || !el.btnContinue) {
      console.error('[CreateDesign] Required DOM elements missing. Check HTML IDs.');
      return;
    }

    // Auth + company
    const ready = await loadSessionAndCompany();
    if (!ready) return;

    // Edit mode?
    const urlId = getDesignIdFromUrl();
    if (urlId) {
      const loaded = await loadDesign(urlId);
      if (!loaded) {
        // Remove invalid id from URL to avoid repeated failures
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('id');
          window.history.replaceState({}, '', url.toString());
        } catch (_) {}
        // Still render preview with whatever is in form
      }
    } else {
      // Create mode — restore local draft
      restoreLocalDraft();
    }

    bindEvents();
    bindUploadEvents();
    calculateCost();
    renderPreview();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
