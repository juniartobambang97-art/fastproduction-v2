/*! FastProduction V2 — manage-company.js
 *  Module: Company Management
 *  Target: pages/manage-company.html
 *  Dependencies: config.js, supabase.js, auth.js
 *  Tables: companies, company_members, profiles
 *  RPCs: rpc_list_company_members, rpc_set_company_admin,
 *        rpc_remove_company_admin, rpc_update_company
 */
(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;
  const Auth = window.FPAuth;
  if (!db || !Auth) {
    console.error('[ManageCompany] Supabase atau FPAuth belum tersedia.');
    return;
  }

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    members: [],
    isOwner: false,
    isAdmin: false
  };

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch { return '—'; }
  }

  function notify(message, isError = false) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + (isError ? 'error' : 'success');
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  /* =========================================================
   * AUTH + COMPANY
   * ========================================================= */
  async function loadSession() {
    try {
      const session = await Auth.getSession();
      if (!session?.user) {
        window.location.replace('login.html');
        return false;
      }
      state.user = session.user;
      try {
        state.profile = await Auth.getProfile(session.user.id);
      } catch (err) {
        console.warn('[ManageCompany] getProfile:', err);
        state.profile = null;
      }
      return true;
    } catch (err) {
      console.error('[ManageCompany] session error:', err);
      notify('Gagal memuat sesi.', true);
      return false;
    }
  }

  async function loadCompany() {
    const companyId = state.profile?.default_company_id;
    if (!companyId) {
      notify('Company tidak ditemukan.', true);
      return false;
    }

    const { data: company, error } = await db
      .from('companies')
      .select('id,name,type,owner_id,verified_at,created_at')
      .eq('id', companyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !company) {
      console.error('[ManageCompany] load company:', error);
      notify('Gagal memuat company.', true);
      return false;
    }

    state.company = company;

    // Cek membership user
    const { data: member } = await db
      .from('company_members')
      .select('member_role')
      .eq('company_id', company.id)
      .eq('user_id', state.user.id)
      .maybeSingle();

    state.membership = member || null;
    state.isOwner = member?.member_role === 'owner';
    state.isAdmin = member?.member_role === 'admin' || state.isOwner;

    return true;
  }

  /* =========================================================
   * RENDER: COMPANY INFO
   * ========================================================= */
  function renderCompanyInfo() {
    const c = state.company;
    if (!c) return;

    $('#info-name').textContent = c.name || '—';
    $('#info-type').textContent = c.type === 'manufacturer' ? 'Manufacturer / Workshop' : c.type === 'brand' ? 'Fashion Brand' : '—';
    $('#info-id').textContent = c.id.slice(0, 8).toUpperCase() + '...';
    $('#info-created').textContent = fmtDate(c.created_at);
    $('#info-verified').textContent = c.verified_at ? '✓ Verified' : '⏳ Pending';

    // Owner name akan di-set setelah load members
  }

  /* =========================================================
   * RENDER: MEMBERS
   * ========================================================= */
  function renderMembers() {
    const list = $('#member-list');
    const count = $('#member-count');
    if (!list) return;

    count.textContent = state.members.length + ' MEMBERS';

    if (!state.members.length) {
      list.innerHTML = '<div class="empty">Tidak ada anggota.</div>';
      return;
    }

    list.innerHTML = state.members.map(m => {
      const roleClass = m.member_role === 'owner' ? 'owner' : m.member_role === 'admin' ? 'admin' : 'member';
      const roleLabel = m.member_role.toUpperCase();
      const isCurrentUser = m.user_id === state.user.id;
      const canManage = state.isOwner && !isCurrentUser && m.member_role !== 'owner';

      return `
        <div class="member-card">
          <div class="member-info">
            <div class="member-name">${escapeHTML(m.full_name || 'Unknown')} ${isCurrentUser ? '(You)' : ''}</div>
            <div class="member-email">${escapeHTML(m.email || '—')}</div>
            <div class="member-meta">
              <span>📱 ${escapeHTML(m.phone || '—')}</span>
              <span>📅 Joined ${fmtDate(m.joined_at)}</span>
            </div>
          </div>
          <div class="member-actions">
            <span class="tag ${roleClass}">${roleLabel}</span>
            ${canManage && m.member_role !== 'admin' ? `
              <button class="btn primary" onclick="window.__mc_setAdmin('${m.user_id}')">Set Admin</button>
            ` : ''}
            ${canManage && m.member_role === 'admin' ? `
              <button class="btn danger" onclick="window.__mc_removeAdmin('${m.user_id}')">Remove Admin</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Set owner name di company info
    const owner = state.members.find(m => m.member_role === 'owner');
    if (owner && $('#info-owner')) {
      $('#info-owner').textContent = owner.full_name || '—';
    }
  }

  /* =========================================================
   * LOAD MEMBERS
   * ========================================================= */
  async function loadMembers() {
    if (!state.company?.id) return;

    try {
      const { data, error } = await db.rpc('rpc_list_company_members', {
        p_company_id: state.company.id
      });

      if (error) {
        console.error('[ManageCompany] load members:', error);
        notify('Gagal memuat anggota: ' + (error.message || 'unknown'), true);
        state.members = [];
        return;
      }

      state.members = data || [];
      renderMembers();
    } catch (err) {
      console.error('[ManageCompany] load members exception:', err);
      notify('Error: ' + (err.message || 'unknown'), true);
    }
  }

  /* =========================================================
   * ACTIONS: SET/REMOVE ADMIN
   * ========================================================= */
  async function setAdmin(userId) {
    if (!state.isOwner) {
      notify('Hanya owner yang dapat mengubah admin.', true);
      return;
    }

    const member = state.members.find(m => m.user_id === userId);
    if (!member) return;

    const confirmed = confirm(`Jadikan ${member.full_name || 'user ini'} sebagai Admin?`);
    if (!confirmed) return;

    try {
      const { error } = await db.rpc('rpc_set_company_admin', {
        p_company_id: state.company.id,
        p_user_id: userId
      });

      if (error) {
        console.error('[ManageCompany] set admin:', error);
        notify('Gagal: ' + (error.message || 'unknown'), true);
        return;
      }

      notify('Admin berhasil ditambahkan.', false);
      await loadMembers();
    } catch (err) {
      console.error('[ManageCompany] set admin exception:', err);
      notify('Error: ' + (err.message || 'unknown'), true);
    }
  }

  async function removeAdmin(userId) {
    if (!state.isOwner) {
      notify('Hanya owner yang dapat mengubah admin.', true);
      return;
    }

    const member = state.members.find(m => m.user_id === userId);
    if (!member) return;

    const confirmed = confirm(`Cabut hak admin dari ${member.full_name || 'user ini'}?`);
    if (!confirmed) return;

    try {
      const { error } = await db.rpc('rpc_remove_company_admin', {
        p_company_id: state.company.id,
        p_user_id: userId
      });

      if (error) {
        console.error('[ManageCompany] remove admin:', error);
        notify('Gagal: ' + (error.message || 'unknown'), true);
        return;
      }

      notify('Admin berhasil dicabut.', false);
      await loadMembers();
    } catch (err) {
      console.error('[ManageCompany] remove admin exception:', err);
      notify('Error: ' + (err.message || 'unknown'), true);
    }
  }

  /* =========================================================
   * EDIT COMPANY INFO
   * ========================================================= */
  function showEditForm() {
    $('#company-info-display').style.display = 'none';
    $('#company-edit-form').style.display = 'block';
    $('#btn-edit-company').style.display = 'none';

    // Populate form
    $('#edit-name').value = state.company?.name || '';
    $('#edit-type').value = state.company?.type || 'manufacturer';
  }

  function hideEditForm() {
    $('#company-info-display').style.display = 'block';
    $('#company-edit-form').style.display = 'none';
    $('#btn-edit-company').style.display = 'block';
  }

  async function handleSaveCompany(e) {
    e.preventDefault();

    const name = $('#edit-name').value.trim();
    const type = $('#edit-type').value;

    if (!name || name.length < 2) {
      notify('Nama company minimal 2 karakter.', true);
      return;
    }

    if (!['manufacturer', 'brand'].includes(type)) {
      notify('Tipe company tidak valid.', true);
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      const { error } = await db.rpc('rpc_update_company', {
        p_company_id: state.company.id,
        p_name: name,
        p_type: type
      });

      if (error) {
        console.error('[ManageCompany] update company:', error);
        notify('Gagal: ' + (error.message || 'unknown'), true);
        return;
      }

      // Update state
      state.company.name = name;
      state.company.type = type;

      notify('Company berhasil diperbarui.', false);
      renderCompanyInfo();
      hideEditForm();
    } catch (err) {
      console.error('[ManageCompany] update company exception:', err);
      notify('Error: ' + (err.message || 'unknown'), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    }
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    const sessionOk = await loadSession();
    if (!sessionOk) return;

    const companyOk = await loadCompany();
    if (!companyOk) return;

    renderCompanyInfo();
    await loadMembers();

    // Bind events
    $('#btn-edit-company')?.addEventListener('click', showEditForm);
    $('#btn-cancel-edit')?.addEventListener('click', hideEditForm);
    $('#editCompanyForm')?.addEventListener('submit', handleSaveCompany);

    // Expose functions to window for inline onclick
    window.__mc_setAdmin = setAdmin;
    window.__mc_removeAdmin = removeAdmin;

    console.info('[ManageCompany] Ready. isOwner=', state.isOwner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
