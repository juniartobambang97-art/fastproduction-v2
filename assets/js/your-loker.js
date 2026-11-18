/*! FastProduction V2 — your-loker.js
 *  Module: Your Loker — Vacancy management
 *  Target: pages/your-loker.html
 *  Dependencies: config.js, supabase.js, auth.js
 *  Tables: vacancies (structure inferred from dashboard.js usage)
 */
(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  if (!db || !Auth) {
    console.error('[YourLoker] Supabase atau FPAuth belum tersedia.');
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
    vacancies: [],
    activeFilter: 'all',
    initialized: false
  };

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '—';
    }
  }

  function notify(message, isError = false) {
    console.log(`[YourLoker] ${message}`);
    if (typeof window.toast === 'function') {
      window.toast(message, isError ? 'error' : 'success');
    } else if (typeof window.notify === 'function') {
      window.notify(message, isError);
    } else {
      alert(message);
    }
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
      return true;
    } catch (err) {
      console.error('[YourLoker] session error:', err);
      return false;
    }
  }

  async function loadProfile() {
    try {
      state.profile = await Auth.getProfile(state.user.id);
    } catch (err) {
      console.warn('[YourLoker] getProfile:', err);
      state.profile = null;
    }
  }

  async function loadCompany() {
    const companyId = state.profile?.default_company_id;
    if (companyId) {
      const { data, error } = await db
        .from('companies')
        .select('id,name,type,verified_at')
        .eq('id', companyId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) console.warn('[YourLoker] company lookup:', error.message);
      if (data) {
        state.company = data;
        const { data: member, error: mErr } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();
        if (mErr) console.warn('[YourLoker] membership lookup:', mErr.message);
        state.membership = member || null;
        return;
      }
    }

    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,member_role,joined_at')
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn('[YourLoker] membership fallback:', error.message);
      return;
    }
    if (!memberships?.length) return;
    state.membership = memberships[0];
    const { data: company, error: cErr } = await db
      .from('companies')
      .select('id,name,type,verified_at')
      .eq('id', memberships[0].company_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) console.warn('[YourLoker] company from fallback:', cErr.message);
    state.company = company || null;
  }

  /* =========================================================
   * DATA LOADERS
   * ========================================================= */
  async function loadVacancies() {
    if (!state.company?.id) {
      state.vacancies = [];
      return;
    }

    const { data, error } = await db
      .from('vacancies')
      .select('*')
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[YourLoker] load vacancies:', error);
      state.vacancies = [];
      return;
    }

    state.vacancies = data || [];
  }

  /* =========================================================
   * RENDER
   * ========================================================= */
  function updateStats() {
    const cards = $$('.grid .card');
    if (cards.length < 4) return;

    const total = state.vacancies.length;
    const published = state.vacancies.filter((v) => v.status === 'open' || v.status === 'published').length;
    const drafts = state.vacancies.filter((v) => v.status === 'draft').length;
    const hired = state.vacancies.filter((v) => v.status === 'closed' || v.status === 'filled').length;

    const values = [
      cards[0].querySelector('.value'),
      cards[1].querySelector('.value'),
      cards[2].querySelector('.value'),
      cards[3].querySelector('.value')
    ];

    if (values[0]) values[0].textContent = published;
    if (values[1]) values[1].textContent = '—'; // applicants — belum ada tabel applications
    if (values[2]) values[2].textContent = drafts;
    if (values[3]) values[3].textContent = hired;
  }

  function renderVacancies() {
    const jobsGrid = $('#jobs');
    if (!jobsGrid) return;

    let filtered = state.vacancies;
    if (state.activeFilter === 'published') {
      filtered = state.vacancies.filter((v) => v.status === 'open' || v.status === 'published');
    } else if (state.activeFilter === 'draft') {
      filtered = state.vacancies.filter((v) => v.status === 'draft');
    } else if (state.activeFilter === 'closed') {
      filtered = state.vacancies.filter((v) => v.status === 'closed' || v.status === 'filled');
    }

    if (!filtered.length) {
      jobsGrid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <div style="font-size:25px">♙</div>
        <strong>${
          state.vacancies.length
            ? 'No vacancies match this filter'
            : 'No vacancies yet'
        }</strong>
        <p>${
          state.vacancies.length
            ? 'Try a different filter.'
            : 'Create your first vacancy to start recruiting.'
        }</p>
      </div>`;
      return;
    }

    jobsGrid.innerHTML = filtered
      .map((v) => {
        const statusLabel = (v.status || 'draft').toUpperCase();
        const statusClass = v.status === 'draft' ? 'draft' : '';
        const category = v.category || v.job_category || 'GENERAL';
        const positions = v.positions || v.position_count || 1;
        const type = v.employment_type || 'Full time';
        const title = v.title || v.job_title || 'Untitled Vacancy';
        const description = v.description || 'No description provided.';
        const source = v.source || 'Manual';

        return `<div class="job">
          <div class="job-top">
            <div class="job-icon">⚙</div>
            <span class="tag ${statusClass}">${escapeHTML(statusLabel)}</span>
          </div>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(description)}</p>
          <div class="job-meta">
            <span>${escapeHTML(category)}</span>
            <span>${escapeHTML(type)}</span>
            <span>${positions} POSITION${positions > 1 ? 'S' : ''}</span>
          </div>
          <div class="job-foot">
            <span style="font-size:10px;color:var(--muted)">Source: ${escapeHTML(source)}</span>
            <a href="#" onclick="return false">Review →</a>
          </div>
        </div>`;
      })
      .join('');
  }

  function render() {
    updateStats();
    renderVacancies();
  }

  /* =========================================================
   * MODAL
   * ========================================================= */
  function openModal() {
    if (!state.company?.id) {
      notify('Please create or join a company first.', true);
      return;
    }
    const modal = $('#modal');
    if (modal) modal.classList.add('show');
  }

  function closeModal() {
    const modal = $('#modal');
    if (modal) modal.classList.remove('show');
  }

  async function handleCreateVacancy() {
    if (!state.company?.id) {
      notify('Company not found.', true);
      return;
    }

    const modal = $('#modal');
    if (!modal) return;

    const inputs = modal.querySelectorAll('input, select, textarea');
    const title = inputs[0]?.value.trim();
    const category = inputs[1]?.value;
    const positions = parseInt(inputs[2]?.value, 10) || 1;
    const employmentType = inputs[3]?.value;
    const description = inputs[4]?.value.trim();

    if (!title) {
      notify('Job title is required.', true);
      return;
    }

    if (!category || category === 'Choose job category') {
      notify('Please select a job category.', true);
      return;
    }

    const payload = {
      company_id: state.company.id,
      title,
      category: category === 'Choose job category' ? null : category,
      positions,
      employment_type: employmentType === 'Employment type' ? null : employmentType,
      description,
      status: 'draft',
      source: 'manual',
      created_at: new Date().toISOString()
    };

    const submitBtn = modal.querySelector('.modal-actions .btn:last-child');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    try {
      const { data, error } = await db
        .from('vacancies')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      notify('Vacancy draft created successfully.');
      closeModal();
      inputs.forEach((input) => {
        if (input.tagName === 'SELECT') {
          input.selectedIndex = 0;
        } else {
          input.value = '';
        }
      });

      await loadVacancies();
      render();
    } catch (error) {
      console.error('[YourLoker] create vacancy:', error);
      const msg = error.message || 'unknown';
      if (/policy|permission|authorization/i.test(msg)) {
        notify('You need admin access to create vacancies.', true);
      } else {
        notify('Failed to create vacancy: ' + msg, true);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Draft';
      }
    }
  }

  /* =========================================================
   * TAB SWITCHING
   * ========================================================= */
  function switchTab(btn, filter) {
    $$('.tab').forEach((x) => x.classList.remove('active'));
    if (btn) btn.classList.add('active');
    state.activeFilter = filter;
    renderVacancies();
  }

  /* =========================================================
   * EVENT BINDING
   * ========================================================= */
  function bindEvents() {
    const createBtn = $('#modal')?.parentElement?.querySelector('.btn[onclick*="openModal"]');
    if (createBtn) {
      createBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    }

    const modal = $('#modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    const createDraftBtn = modal?.querySelector('.modal-actions .btn:last-child');
    if (createDraftBtn) {
      createDraftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleCreateVacancy();
      });
    }
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const hasSession = await loadSession();
    if (!hasSession) return;

    await loadProfile();
    await loadCompany();

    if (!state.company?.id) {
      console.warn('[YourLoker] No company found.');
      notify('No company found. Please create or join a company first.', true);
      return;
    }

    await loadVacancies();
    bindEvents();
    render();

    console.info('[YourLoker] Ready.');
  }

  // Expose functions to window for inline onclick handlers
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.switchTab = switchTab;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
