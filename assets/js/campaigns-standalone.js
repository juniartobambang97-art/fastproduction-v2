/*! FastProduction V2 — campaigns-standalone.js
 *  Module: Campaign Management (Standalone Page)
 *  Dependencies: config.js, supabase.js, auth.js
 *  Target table: public.campaigns, public.designs
 *  RLS: campaigns_read_co (member), campaigns_write_admin (admin)
 */
(function () {
  'use strict';

  /* =========================================================
   * CONSTANTS
   * ========================================================= */
  const TOAST_DURATION = 3800;
  const STATUS_OPTIONS = [
    { value: 'draft',     label: 'Draft' },
    { value: 'open',      label: 'Open' },
    { value: 'closed',    label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    designs: [],
    campaigns: [],
    editingId: null,
    isLoading: false,
    isSaving: false,
    filterDesign: '',
    filterStatus: '',
    searchQuery: ''
  };

  /* =========================================================
   * DOM REFS
   * ========================================================= */
  const dom = {
    list: null,
    empty: null,
    btnNew: null,
    modal: null,
    form: null,
    modalTitle: null,
    btnCancel: null,
    search: null,
    filterDesign: null,
    filterStatus: null,
    cmpDesign: null
  };

  function cacheDom() {
    dom.list = document.getElementById('campaigns-list');
    dom.empty = document.getElementById('empty-state');
    dom.btnNew = document.getElementById('btn-new-campaign');
    dom.modal = document.getElementById('campaignModal');
    dom.form = document.getElementById('campaignForm');
    dom.modalTitle = document.getElementById('modal-title');
    dom.btnCancel = document.getElementById('btn-cancel');
    dom.search = document.getElementById('search');
    dom.filterDesign = document.getElementById('filter-design');
    dom.filterStatus = document.getElementById('filter-status');
    dom.cmpDesign = document.getElementById('cmp-design');
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
    return Math.trunc(n);
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch (_) { return '—'; }
  };

  const statusLabel = (s) => {
    const found = STATUS_OPTIONS.find(o => o.value === s);
    return found ? found.label.toUpperCase() : String(s || 'DRAFT').toUpperCase();
  };

  const statusColor = (s) => {
    switch (s) {
      case 'open':      return '#c5f36b';
      case 'closed':    return '#8bbbf0';
      case 'cancelled': return '#f28e7d';
      default:          return '#849087';
    }
  };

  /* =========================================================
   * TOAST
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
   * AUTH + COMPANY
   * ========================================================= */
  async function loadSessionAndCompany() {
    const Auth = window.FPAuth;
    const db = window.fpSupabase;
    if (!Auth || !db) {
      toast('Module Supabase/Auth belum siap.', 'error');
      return false;
    }
    try {
      const session = await Auth.getSession();
      if (!session?.user) {
        toast('Login diperlukan.', 'warn');
        setTimeout(() => { window.location.replace('login.html'); }, 1200);
        return false;
      }
      state.user = session.user;
      try {
        state.profile = await Auth.getProfile(session.user.id);
      } catch (err) {
        console.warn('[Campaigns] getProfile:', err);
      }
      await loadCompany();
      if (!state.company?.id) {
        toast('Company tidak ditemukan. Buat/join company dulu.', 'error');
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Campaigns] session error:', err);
      toast('Gagal memuat sesi.', 'error');
      return false;
    }
  }

  async function loadCompany() {
    const db = window.fpSupabase;
    const companyId = state.profile?.default_company_id;
    if (companyId) {
      const { data } = await db
        .from('companies')
        .select('id,name,type,verified_at')
        .eq('id', companyId)
        .is('deleted_at', null)
        .maybeSingle();
      if (data) {
        state.company = data;
        const { data: member } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();
        state.membership = member || null;
        return;
      }
    }
    const { data: memberships } = await db
      .from('company_members')
      .select('company_id,member_role,joined_at')
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false })
      .limit(1);
    if (!memberships?.length) return;
    state.membership = memberships[0];
    const { data: company } = await db
      .from('companies')
      .select('id,name,type,verified_at')
      .eq('id', memberships[0].company_id)
      .is('deleted_at', null)
      .maybeSingle();
    state.company = company || null;
  }

  /* =========================================================
   * LOAD DESIGNS
   * ========================================================= */
  async function loadDesigns() {
    if (!state.company?.id) {
      state.designs = [];
      return;
    }
    const db = window.fpSupabase;
    const { data, error } = await db
      .from('designs')
      .select('id,name,status')
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Campaigns] load designs:', error);
      state.designs = [];
      return;
    }
    state.designs = data || [];
    populateDesignDropdowns();
  }

  function populateDesignDropdowns() {
    // Filter dropdown
    if (dom.filterDesign) {
      dom.filterDesign.innerHTML = '<option value="">Semua Design</option>' +
        state.designs.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    }
    // Modal form dropdown
    if (dom.cmpDesign) {
      dom.cmpDesign.innerHTML = '<option value="">Pilih design</option>' +
        state.designs.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    }
  }

  /* =========================================================
   * LOAD CAMPAIGNS
   * ========================================================= */
  async function loadCampaigns() {
    if (!state.company?.id) {
      state.campaigns = [];
      render();
      return;
    }
    state.isLoading = true;
    render();
    const db = window.fpSupabase;
    const { data, error } = await db
      .from('campaigns')
      .select(`
        id, design_id, title, target_qty, min_interest, interest_period_days,
        po_payment_period_days, status, started_at, ended_at, created_at, updated_at
      `)
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Campaigns] load campaigns:', error);
      toast('Gagal memuat campaign: ' + (error.message || 'unknown'), 'error');
      state.campaigns = [];
    } else {
      state.campaigns = data || [];
    }
    state.isLoading = false;
    render();
  }

  /* =========================================================
   * VALIDATION
   * ========================================================= */
  function validateForm(form) {
    const errors = [];
    if (!form.design_id?.value) errors.push('Design wajib dipilih.');
    const title = (form.title?.value || '').trim();
    if (!title) errors.push('Judul campaign wajib diisi.');
    else if (title.length > 120) errors.push('Judul maksimal 120 karakter.');

    const targetQty = toIntOrNull(form.target_qty?.value);
    if (targetQty !== null && targetQty < 1) errors.push('Target qty minimal 1.');

    const minInterest = toIntOrNull(form.min_interest?.value);
    if (minInterest !== null && minInterest < 0) errors.push('Min interest tidak boleh negatif.');

    const interestDays = toIntOrNull(form.interest_period_days?.value);
    if (interestDays !== null && interestDays < 1) errors.push('Interest period minimal 1 hari.');

    const poDays = toIntOrNull(form.po_payment_period_days?.value);
    if (poDays !== null && poDays < 1) errors.push('PO payment period minimal 1 hari.');

    return errors;
  }

  /* =========================================================
   * SAVE (CREATE / UPDATE)
   * ========================================================= */
  async function handleSave(e) {
    e.preventDefault();
    if (state.isSaving) return;
    const db = window.fpSupabase;
    if (!db) { toast('Supabase tidak tersedia.', 'error'); return; }
    if (!state.company?.id) { toast('Company tidak valid.', 'error'); return; }

    const errors = validateForm(e.target);
    if (errors.length) { toast(errors[0], 'error'); return; }

    state.isSaving = true;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    const payload = {
      design_id: e.target.design_id.value,
      title: (e.target.title.value || '').trim(),
      target_qty: toIntOrNull(e.target.target_qty.value),
      min_interest: toIntOrNull(e.target.min_interest.value) ?? 0,
      interest_period_days: toIntOrNull(e.target.interest_period_days.value),
      po_payment_period_days: toIntOrNull(e.target.po_payment_period_days.value),
      status: e.target.status?.value || 'draft',
      updated_at: new Date().toISOString()
    };

    const startedAt = e.target.started_at?.value;
    payload.started_at = startedAt ? new Date(startedAt).toISOString() : null;
    const endedAt = e.target.ended_at?.value;
    payload.ended_at = endedAt ? new Date(endedAt).toISOString() : null;

    try {
      if (state.editingId) {
        const { error } = await db
          .from('campaigns')
          .update(payload)
          .eq('id', state.editingId)
          .eq('company_id', state.company.id)
          .is('deleted_at', null);
        if (error) throw error;
        toast('Campaign diperbarui.', 'success');
      } else {
        payload.company_id = state.company.id;
        payload.created_at = new Date().toISOString();
        const { error } = await db
          .from('campaigns')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        toast('Campaign dibuat.', 'success');
      }
      closeCampaignModal();
      await loadCampaigns();
    } catch (err) {
      console.error('[Campaigns] save:', err);
      const msg = mapSupabaseError(err);
      toast(msg, 'error');
    } finally {
      state.isSaving = false;
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'Simpan'; }
    }
  }

  function mapSupabaseError(err) {
    const msg = (err && err.message) || 'Gagal menyimpan campaign.';
    if (/row-level security/i.test(msg)) {
      return 'Akses ditolak: hanya admin company yang dapat mengelola campaign.';
    }
    if (/violates check/i.test(msg)) {
      return 'Validasi gagal: periksa kembali input.';
    }
    if (/foreign key/i.test(msg)) {
      return 'Design atau company tidak valid.';
    }
    return msg.length > 160 ? msg.slice(0, 160) + '…' : msg;
  }

  /* =========================================================
   * STATUS CHANGE
   * ========================================================= */
  async function handleChangeStatus(campaignId, newStatus) {
    if (state.isSaving) return;
    const db = window.fpSupabase;
    if (!db || !state.company?.id) return;

    const confirmed = confirm(`Ubah status campaign menjadi "${statusLabel(newStatus)}"?`);
    if (!confirmed) return;

    state.isSaving = true;
    try {
      const updatePayload = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };
      if (newStatus === 'open') {
        const current = state.campaigns.find(c => c.id === campaignId);
        if (current && !current.started_at) {
          updatePayload.started_at = new Date().toISOString();
        }
      }
      if (newStatus === 'closed' || newStatus === 'cancelled') {
        updatePayload.ended_at = new Date().toISOString();
      }
      const { error } = await db
        .from('campaigns')
        .update(updatePayload)
        .eq('id', campaignId)
        .eq('company_id', state.company.id)
        .is('deleted_at', null);
      if (error) throw error;
      toast('Status diperbarui.', 'success');
      await loadCampaigns();
    } catch (err) {
      console.error('[Campaigns] status change:', err);
      toast(mapSupabaseError(err), 'error');
    } finally {
      state.isSaving = false;
    }
  }

  /* =========================================================
   * DELETE (soft)
   * ========================================================= */
  async function handleDelete(campaignId) {
    if (state.isSaving) return;
    const confirmed = confirm('Hapus campaign ini? Tindakan tidak dapat dibatalkan.');
    if (!confirmed) return;

    const db = window.fpSupabase;
    state.isSaving = true;
    try {
      const { error } = await db
        .from('campaigns')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', campaignId)
        .eq('company_id', state.company.id);
      if (error) throw error;
      toast('Campaign dihapus.', 'success');
      await loadCampaigns();
    } catch (err) {
      console.error('[Campaigns] delete:', err);
      toast(mapSupabaseError(err), 'error');
    } finally {
      state.isSaving = false;
    }
  }

  /* =========================================================
   * MODAL
   * ========================================================= */
  function openCampaignModal(campaign = null) {
    if (!dom.modal || !dom.form) return;
    state.editingId = campaign?.id || null;
    if (dom.modalTitle) {
      dom.modalTitle.textContent = campaign ? 'Edit Campaign' : 'New Campaign';
    }
    dom.form.reset();
    if (campaign) {
      dom.form.design_id.value = campaign.design_id || '';
      dom.form.title.value = campaign.title || '';
      dom.form.target_qty.value = campaign.target_qty ?? '';
      dom.form.min_interest.value = campaign.min_interest ?? 0;
      dom.form.interest_period_days.value = campaign.interest_period_days ?? '';
      dom.form.po_payment_period_days.value = campaign.po_payment_period_days ?? '';
      dom.form.status.value = campaign.status || 'draft';
      if (campaign.started_at) {
        dom.form.started_at.value = campaign.started_at.slice(0, 10);
      }
      if (campaign.ended_at) {
        dom.form.ended_at.value = campaign.ended_at.slice(0, 10);
      }
    } else {
      dom.form.status.value = 'draft';
    }
    dom.modal.classList.add('show');
  }

  function closeCampaignModal() {
    if (dom.modal) dom.modal.classList.remove('show');
    state.editingId = null;
  }

  /* =========================================================
   * RENDER
   * ========================================================= */
  function render() {
    if (!dom.list) return;

    if (state.isLoading) {
      dom.list.innerHTML = '<div class="empty"><strong>LOADING...</strong>Memuat campaign...</div>';
      if (dom.empty) dom.empty.style.display = 'none';
      return;
    }

    // Apply filters
    let filtered = state.campaigns;
    if (state.filterDesign) {
      filtered = filtered.filter(c => c.design_id === state.filterDesign);
    }
    if (state.filterStatus) {
      filtered = filtered.filter(c => c.status === state.filterStatus);
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(c => (c.title || '').toLowerCase().includes(q));
    }

    if (!filtered.length) {
      dom.list.innerHTML = '';
      if (dom.empty) {
        dom.empty.style.display = 'block';
        if (state.campaigns.length === 0) {
          dom.empty.innerHTML = '<strong>BELUM ADA CAMPAIGN</strong>Buat campaign pertama untuk design Anda. Klik tombol "＋ New Campaign" untuk memulai.';
        } else {
          dom.empty.innerHTML = '<strong>TIDAK ADA HASIL</strong>Tidak ada campaign yang cocok dengan filter Anda.';
        }
      }
      return;
    }

    if (dom.empty) dom.empty.style.display = 'none';

    dom.list.innerHTML = filtered.map(c => {
      const design = state.designs.find(d => d.id === c.design_id);
      const designName = design?.name || 'Design tidak ditemukan';
      const targetText = c.target_qty ? `${Number(c.target_qty).toLocaleString('id-ID')} pcs` : '—';
      const interestText = c.min_interest ? `${Number(c.min_interest).toLocaleString('id-ID')} orang` : '—';
      const periodText = c.interest_period_days ? `${c.interest_period_days} hari` : '—';
      const poPeriodText = c.po_payment_period_days ? `${c.po_payment_period_days} hari` : '—';
      const color = statusColor(c.status);

      const statusOptions = STATUS_OPTIONS.map(o =>
        `<option value="${o.value}"${o.value === c.status ? ' selected' : ''}>${o.label}</option>`
      ).join('');

      return `
        <div class="campaign-card" data-id="${escapeHtml(c.id)}">
          <div class="campaign-head">
            <div>
              <h3>${escapeHtml(c.title)}</h3>
              <div class="design-name">${escapeHtml(designName)}</div>
            </div>
            <span class="tag" style="color:${color};border-color:${color}40;">
              ${statusLabel(c.status)}
            </span>
          </div>
          <div class="campaign-meta">
            <div><small>TARGET</small><b>${escapeHtml(targetText)}</b></div>
            <div><small>MIN INTEREST</small><b>${escapeHtml(interestText)}</b></div>
            <div><small>INTEREST PERIOD</small><b>${escapeHtml(periodText)}</b></div>
            <div><small>PO PAYMENT</small><b>${escapeHtml(poPeriodText)}</b></div>
          </div>
          <div class="campaign-actions">
            <select class="campaign-status-select" data-id="${escapeHtml(c.id)}">
              ${statusOptions}
            </select>
            <button class="btn" data-action="edit" data-id="${escapeHtml(c.id)}">Edit</button>
            <button class="btn" data-action="delete" data-id="${escapeHtml(c.id)}" style="color:var(--red,#f28e7d);">Hapus</button>
          </div>
        </div>
      `;
    }).join('');
  }

  /* =========================================================
   * EVENTS
   * ========================================================= */
  function bindEvents() {
    if (dom.btnNew) {
      dom.btnNew.addEventListener('click', () => openCampaignModal(null));
    }
    if (dom.form) {
      dom.form.addEventListener('submit', handleSave);
    }
    if (dom.btnCancel) {
      dom.btnCancel.addEventListener('click', closeCampaignModal);
    }
    if (dom.modal) {
      dom.modal.addEventListener('click', (e) => {
        if (e.target === dom.modal) closeCampaignModal();
      });
    }
    if (dom.search) {
      dom.search.addEventListener('input', (e) => {
        state.searchQuery = e.target.value || '';
        render();
      });
    }
    if (dom.filterDesign) {
      dom.filterDesign.addEventListener('change', (e) => {
        state.filterDesign = e.target.value || '';
        render();
      });
    }
    if (dom.filterStatus) {
      dom.filterStatus.addEventListener('change', (e) => {
        state.filterStatus = e.target.value || '';
        render();
      });
    }
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') {
        const c = state.campaigns.find(x => x.id === id);
        if (c) openCampaignModal(c);
      } else if (action === 'delete') {
        handleDelete(id);
      }
    });
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('campaign-status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        handleChangeStatus(id, newStatus);
      }
    });
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    cacheDom();
    const ready = await loadSessionAndCompany();
    if (!ready) {
      render();
      return;
    }
    await loadDesigns();
    bindEvents();
    await loadCampaigns();
    console.info('[Campaigns Standalone] Ready.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
