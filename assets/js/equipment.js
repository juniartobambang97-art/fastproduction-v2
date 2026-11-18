(function () {
  'use strict';

  const db = window.fpSupabase;
  if (!db) {
    console.error('[Equipment] Supabase client tidak ditemukan. Pastikan config.js, supabase.js, dan auth.js sudah di-load.');
    return;
  }

  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    equipment: [],
    loading: false,
    initialized: false
  };

  const STATUS_TO_DB = {
    'Operational': 'operational',
    'Needs maintenance': 'maintenance',
    'Under maintenance': 'maintenance'
  };

  const STATUS_FROM_DB = {
    'operational': 'Operational',
    'maintenance': 'Maintenance',
    'broken': 'Broken',
    'retired': 'Retired'
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function notify(message, isError = false) {
    console.log(`[Equipment] ${message}`);
    if (typeof window.toast === 'function') {
      window.toast(message, isError ? 'error' : 'success');
    } else if (typeof window.notify === 'function') {
      window.notify(message, isError);
    } else {
      alert(message);
    }
  }

  async function loadSession() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      console.warn('[Equipment] No session found.');
      return false;
    }
    state.user = session.user;
    return true;
  }

  async function loadProfile() {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', state.user.id)
      .maybeSingle();

    if (error) {
      console.error('[Equipment] loadProfile:', error);
      return false;
    }
    state.profile = data;
    return true;
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

      if (error) console.warn('[Equipment] company lookup:', error.message);

      if (data) {
        state.company = data;
        const { data: member, error: mErr } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();

        if (mErr) console.warn('[Equipment] membership lookup:', mErr.message);
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
      console.warn('[Equipment] membership fallback:', error.message);
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

    if (cErr) console.warn('[Equipment] company from fallback:', cErr.message);
    state.company = company || null;
  }

  async function loadEquipment() {
    if (!state.company?.id) {
      state.equipment = [];
      return;
    }

    const { data, error } = await db
      .from('equipment')
      .select(`
        id, name, type, capacity, status,
        assigned_employee_id, created_at,
        employees:assigned_employee_id ( id, name )
      `)
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Equipment] loadEquipment:', error);
      state.equipment = [];
      return;
    }

    state.equipment = data || [];
  }

  function renderStats() {
    const cards = document.querySelectorAll('.grid .card');
    if (cards.length < 4) return;

    const total = state.equipment.length;
    const operational = state.equipment.filter(e => e.status === 'operational').length;
    const unassigned = state.equipment.filter(e => !e.assigned_employee_id).length;
    const maintenance = state.equipment.filter(e => e.status === 'maintenance').length;

    const values = [
      cards[0].querySelector('.value'),
      cards[1].querySelector('.value'),
      cards[2].querySelector('.value'),
      cards[3].querySelector('.value')
    ];

    if (values[0]) values[0].textContent = total;
    if (values[1]) values[1].textContent = operational;
    if (values[2]) values[2].textContent = unassigned;
    if (values[3]) values[3].textContent = maintenance;
  }

  function renderGrid() {
    const grid = document.querySelector('.machine-grid');
    if (!grid) return;

    if (!state.equipment.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <div style="font-size:25px">⚙</div>
        <strong>No equipment registered yet</strong>
        <p>Add your first machine or production equipment to build your workshop inventory.</p>
      </div>`;
      return;
    }

    grid.innerHTML = state.equipment.map(eq => {
      const statusLabel = STATUS_FROM_DB[eq.status] || eq.status;
      const statusClass = eq.status === 'maintenance' || eq.status === 'broken' ? 'warning' : '';
      const operatorName = eq.employees?.name || 'Unassigned';
      const needsOperator = !eq.assigned_employee_id;

      return `
        <div class="machine">
          <div class="machine-top">
            <div class="machine-icon">⚙</div>
            <span class="tag ${statusClass}">${escapeHTML(statusLabel)}</span>
          </div>
          <h3>${escapeHTML(eq.name)}</h3>
          <p>${escapeHTML(eq.type || 'Equipment')}</p>
          <div class="machine-details">
            <div>
              <small>CAPABILITY</small>
              <strong>${escapeHTML(eq.type || 'Not specified')}</strong>
            </div>
            <div>
              <small>CONDITION</small>
              <strong>${escapeHTML(statusLabel)}</strong>
            </div>
            <div>
              <small>OPERATOR</small>
              <strong>${escapeHTML(operatorName)}</strong>
            </div>
            <div>
              <small>CAPACITY</small>
              <strong>${escapeHTML(eq.capacity || 'Not specified')}</strong>
            </div>
          </div>
          <div class="machine-foot">
            ${needsOperator
              ? '<span class="tag warning">Operator needed</span><a href="your-loker.html">Prepare vacancy →</a>'
              : '<span class="tag">Assigned</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function render() {
    renderStats();
    renderGrid();
  }

  function openModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('show');
  }

  function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('show');

    const form = modal?.querySelector('.modal');
    if (form) {
      const inputs = form.querySelectorAll('input, select');
      inputs.forEach(input => {
        if (input.tagName === 'SELECT') {
          input.selectedIndex = 0;
        } else {
          input.value = '';
        }
      });
    }
  }

  async function handleFormSubmit() {
    if (!state.company?.id) {
      notify('Company not found. Please create or join a company first.', true);
      return;
    }

    const modal = document.getElementById('modal');
    if (!modal) return;

    const form = modal.querySelector('.modal');
    if (!form) return;

    const nameInput = form.querySelector('input[name="name"]');
    const typeSelect = form.querySelector('select[name="type"]');
    const conditionSelect = form.querySelector('select[name="condition"]');
    const capacityInput = form.querySelector('input[name="capacity"]');

    if (!nameInput || !typeSelect || !conditionSelect || !capacityInput) {
      console.error('[Equipment] Form inputs not found');
      return;
    }

    const name = nameInput.value.trim();
    const type = typeSelect.value;
    const condition = conditionSelect.value;
    const capacity = capacityInput.value.trim();

    if (!name) {
      notify('Machine name is required.', true);
      return;
    }

    if (!type || type === 'Choose machine type') {
      notify('Please select a machine type.', true);
      return;
    }

    if (!condition || condition === 'Choose condition') {
      notify('Please select a condition.', true);
      return;
    }

    const status = STATUS_TO_DB[condition] || 'operational';

    const submitBtn = modal.querySelector('.modal-actions .btn:last-child');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    try {
      const { data, error } = await db
        .from('equipment')
        .insert({
          company_id: state.company.id,
          name,
          type: type === 'Choose machine type' ? null : type,
          capacity: capacity || null,
          status
        })
        .select('id')
        .single();

      if (error) throw error;

      notify('Equipment saved successfully.');
      closeModal();
      await loadEquipment();
      render();
    } catch (error) {
      console.error('[Equipment] save equipment:', error);
      const msg = error.message || 'unknown';
      if (/policy|permission|authorization/i.test(msg)) {
        notify('You need admin access to add equipment.', true);
      } else {
        notify('Failed to save equipment: ' + msg, true);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue';
      }
    }
  }

  function bindEvents() {
    const addBtn = document.getElementById('btnAddEquipment');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        if (!state.company?.id) {
          e.preventDefault();
          e.stopPropagation();
          notify('Please create or join a company first.', true);
          return;
        }
        openModal();
      });
    }
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const hasSession = await loadSession();
    if (!hasSession) {
      console.warn('[Equipment] No session, redirecting to login.');
      window.location.replace('login.html');
      return;
    }

    await loadProfile();
    await loadCompany();

    if (!state.company?.id) {
      console.warn('[Equipment] No company found.');
      notify('No company found. Please create or join a company first.', true);
      const addBtn = document.getElementById('btnAddEquipment');
      if (addBtn) addBtn.style.display = 'none';
      return;
    }

    await loadEquipment();
    bindEvents();
    render();
  }

  window.openModal = openModal;
  window.closeModal = closeModal;
  window.handleEquipmentSubmit = handleFormSubmit;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
