/*! FastProduction V2 — campaigns.js
 *  Module: Campaign management (1 Design : N Campaign)
 *  Dependencies: config.js, supabase.js, auth.js
 *  Target table: public.campaigns
 *  RLS: campaigns_read_co (member), campaigns_write_admin (admin)
 *
 *  Dipanggil dari create-design.html setelah design sudah ada (?id=...).
 *  Tidak menyentuh create-design.js — berdiri sendiri.
 */
(function () {
  'use strict';

  /* =========================================================
   * CONSTANTS
   * ========================================================= */
  const TOAST_DURATION = 3800;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    designId: null,
    design: null,
    campaigns: [],
    editingId: null,
    isLoading: false,
    isSaving: false
  };

  /* =========================================================
   * DOM REFS
   * ========================================================= */
  const dom = {
    list: null,
    count: null,
    empty: null,
    btnNew: null,
    modal: null,
    form: null,
    modalTitle: null,
    statusMsg: null
  };

  function cacheDom() {
    dom.list        = document.getElementById('campaigns-list');
    dom.count       = document.getElementById('campaigns-count');
    dom.empty       = document.getElementById('campaigns-empty');
    dom.btnNew      = document.getElementById('btn-new-campaign');
    dom.modal       = document.getElementById('campaignModal');
    dom.form        = document.getElementById('campaignForm');
    dom.modalTitle  = document.getElementById('campaignModalTitle');
    dom.statusMsg   = document.getElementById('campaigns-status');
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

  const getDesignIdFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      if (id && UUID_REGEX.test(id)) return id;
    } catch (_) {}
    return null;
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
   * AUTH + COMPANY (pola sama dengan create-design.js)
   * ========================================================= */
  async function loadSessionAndCompany() {
    const Auth = window.FPAuth;
    const db = window.fpSupabase;
    if (!Auth || !db) {
      setStatus('Module Supabase/Auth belum siap.', true);
      return false;
    }
    try {
      const session = await Auth.getSession();
      if (!session?.user) {
        setStatus('Login diperlukan untuk melihat campaign.', true);
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
        setStatus('Company tidak ditemukan. Buat/join company dulu.', true);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Campaigns] session error:', err);
      setStatus('Gagal memuat sesi.', true);
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
   * DESIGN VERIFICATION
   * ========================================================= */
  async function verifyDesign(designId) {
    const db = window.fpSupabase;
    const { data, error } = await db
      .from('designs')
      .select('id,company_id,name,status')
      .eq('id', designId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) {
      console.warn('[Campaigns] design not found:', error?.message);
      return null;
    }
    if (data.company_id !== state.company.id) {
      console.warn('[Campaigns] design belongs to another company');
      return null;
    }
    return data;
  }

  /* =========================================================
   * LOAD CAMPAIGNS
   * ========================================================= */
  async function loadCampaigns() {
    if (!state.designId || !state.company?.id) {
      state.campaigns = [];
      return;
    }
    state.isLoading = true;
    render();
    const db = window.fpSupabase;
    const { data, error } = await db
      .from('campaigns')
      .select('id,title,target_qty,min_interest,interest_period_days,po_payment_period_days,status,started_at,ended_at,created_at,updated_at')
      .eq('design_id', state.designId)
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Campaigns] load:', error);
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
    const title = (form.elements.namedItem('title')?.value || '').trim();
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
    if (!state.designId) { toast('Design belum dipilih.', 'error'); return; }

    const errors = validateForm(e.target);
    if (errors.length) { toast(errors[0], 'error'); return; }

    state.isSaving = true;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    const payload = {
      title: (e.target.elements.namedItem('title')?.value || '').trim(),
      target_qty: toIntOrNull(e.target.target_qty.value),
      min_interest: toIntOrNull(e.target.min_interest.value) ?? 0,
      interest_period_days: toIntOrNull(e.target.interest_period_days.value),
      po_payment_period_days: toIntOrNull(e.target.po_payment_period_days.value),
      status: e.target.status?.value || 'draft',
      updated_at: new Date().toISOString()
    };

    // Date fields (nullable)
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
          .eq('design_id', state.designId)
          .is('deleted_at', null);
        if (error) throw error;
        toast('Campaign diperbarui.', 'success');
      } else {
        payload.company_id = state.company.id;
        payload.design_id = state.designId;
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
      // Auto-set started_at saat pertama kali open
      if (newStatus === 'open') {
        const current = state.campaigns.find(c => c.id === campaignId);
        if (current && !current.started_at) {
          updatePayload.started_at = new Date().toISOString();
        }
      }
      // Auto-set ended_at saat closed/cancelled
      if (newStatus === 'closed' || newStatus === 'cancelled') {
        updatePayload.ended_at = new Date().toISOString();
      }
      const { error } = await db
        .from('campaigns')
        .update(updatePayload)
        .eq('id', campaignId)
        .eq('company_id', state.company.id)
        .eq('design_id', state.designId)
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
        .eq('company_id', state.company.id)
        .eq('design_id', state.designId);
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
      dom.form.elements.namedItem('title').value = campaign.title || '';
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
    dom.modal.style.display = 'flex';
  }

  function closeCampaignModal() {
    if (dom.modal) {
      dom.modal.classList.remove('show');
      dom.modal.style.display = 'none';
    }
    state.editingId = null;
  }

  /* =========================================================
   * RENDER
   * ========================================================= */
  function render() {
    if (!dom.list) return;

    if (dom.count) dom.count.textContent = String(state.campaigns.length);

    if (!state.designId) {
      if (dom.empty) {
        dom.empty.style.display = 'block';
        dom.empty.innerHTML = '<strong>Simpan design terlebih dahulu</strong>' +
          '<p>Klik "Save Draft" untuk membuat design, lalu Anda bisa menambahkan campaign.</p>';
      }
      dom.list.innerHTML = '';
      if (dom.btnNew) dom.btnNew.disabled = true;
      return;
    }

    if (dom.btnNew) dom.btnNew.disabled = false;

    if (state.isLoading) {
      dom.list.innerHTML = '<div class="cost-placeholder"><strong>LOADING...</strong>Memuat campaign...</div>';
      if (dom.empty) dom.empty.style.display = 'none';
      return;
    }

    if (!state.campaigns.length) {
      dom.list.innerHTML = '';
      if (dom.empty) {
        dom.empty.style.display = 'block';
        dom.empty.innerHTML = '<strong>Belum ada campaign</strong>' +
          '<p>Buat campaign pertama untuk design ini. Satu design bisa memiliki banyak campaign.</p>';
      }
      return;
    }

    if (dom.empty) dom.empty.style.display = 'none';

    dom.list.innerHTML = state.campaigns.map(c => {
      const targetText = c.target_qty ? `${Number(c.target_qty).toLocaleString('id-ID')} pcs` : '—';
      const interestText = c.min_interest ? `${Number(c.min_interest).toLocaleString('id-ID')} orang` : '—';
      const periodText = c.interest_period_days ? `${c.interest_period_days} hari` : '—';
      const poPeriodText = c.po_payment_period_days ? `${c.po_payment_period_days} hari` : '—';
      const color = statusColor(c.status);

      // Status dropdown options
      const statusOptions = STATUS_OPTIONS.map(o =>
        `<option value="${o.value}"${o.value === c.status ? ' selected' : ''}>${o.label}</option>`
      ).join('');

      return `
        <div class="campaign-card" data-id="${escapeHtml(c.id)}">
          <div class="campaign-head">
            <div>
              <strong style="font-size:13px;">${escapeHtml(c.title)}</strong>
              <div style="font-size:10px;color:var(--muted);margin-top:4px;font-family:var(--mono);">
                ${escapeHtml(fmtDate(c.created_at))}
                ${c.started_at ? ' · mulai ' + escapeHtml(fmtDate(c.started_at)) : ''}
              </div>
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
    if (dom.modal) {
      dom.modal.addEventListener('click', (e) => {
        if (e.target === dom.modal) closeCampaignModal();
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
   * STATUS MESSAGE
   * ========================================================= */
  function setStatus(msg, isError = false) {
    if (!dom.statusMsg) return;
    dom.statusMsg.textContent = msg;
    dom.statusMsg.style.color = isError ? '#f28e7d' : 'var(--muted)';
    dom.statusMsg.style.display = msg ? 'block' : 'none';
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    cacheDom();
    if (!dom.list) {
      // Section campaigns tidak ada di halaman ini — exit diam-diam
      return;
    }

    const ready = await loadSessionAndCompany();
    if (!ready) {
      render();
      return;
    }

    state.designId = getDesignIdFromUrl();
    if (state.designId) {
      state.design = await verifyDesign(state.designId);
      if (!state.design) {
        setStatus('Design tidak ditemukan atau bukan milik company Anda.', true);
        state.designId = null;
      }
    }

    bindEvents();
    await loadCampaigns();
    console.info('[Campaigns] Ready. designId=', state.designId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
