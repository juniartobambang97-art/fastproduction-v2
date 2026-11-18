(function () {
  'use strict';

  const db = window.fpSupabase;
  if (!db) {
    console.error('[Employees] Supabase client tidak ditemukan.');
    return;
  }

  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    employees: [],
    skills: [],
    skillMap: new Map(),
    filter: 'All',
    search: '',
    loading: false,
    initialized: false
  };

  const STATUS_TO_DB = {
    'Active': 'active',
    'Inactive': 'inactive',
    'On Leave': 'on_leave'
  };

  const STATUS_FROM_DB = {
    'active': 'Active',
    'inactive': 'Inactive',
    'on_leave': 'On Leave'
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function initials(name) {
    return (name || '').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  function notify(message, isError = false) {
    console.log(`[Employees] ${message}`);
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
      console.warn('[Employees] No session found.');
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
      console.error('[Employees] loadProfile:', error);
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

      if (error) console.warn('[Employees] company lookup:', error.message);

      if (data) {
        state.company = data;
        const { data: member, error: mErr } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();

        if (mErr) console.warn('[Employees] membership lookup:', mErr.message);
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
      console.warn('[Employees] membership fallback:', error.message);
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

    if (cErr) console.warn('[Employees] company from fallback:', cErr.message);
    state.company = company || null;
  }

  async function loadSkills() {
    const { data, error } = await db
      .from('skills')
      .select('id,name')
      .order('name');

    if (error) {
      console.error('[Employees] loadSkills:', error);
      state.skills = [];
      state.skillMap = new Map();
      return;
    }

    state.skills = data || [];
    state.skillMap = new Map(state.skills.map(s => [s.name.toLowerCase().trim(), s]));
  }

  async function loadEmployees() {
    if (!state.company?.id) {
      state.employees = [];
      return;
    }

    const { data, error } = await db
      .from('employees')
      .select(`
        id, name, phone, role, experience, assignment, status, 
        primary_skill, hired_at, created_at,
        employee_skills (
          skill_id,
          skills ( id, name )
        )
      `)
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Employees] loadEmployees:', error);
      state.employees = [];
      return;
    }

    state.employees = (data || []).map(emp => ({
      ...emp,
      skills: (emp.employee_skills || [])
        .map(es => es.skills?.name)
        .filter(Boolean)
    }));
  }

  function getFilteredEmployees() {
    const query = state.search.toLowerCase();
    return state.employees.filter(e => {
      const matchesStatus = state.filter === 'All' || 
        STATUS_FROM_DB[e.status] === state.filter;
      const content = [
        e.name, e.phone, e.role, e.experience, e.assignment, 
        ...(e.skills || [])
      ].join(' ').toLowerCase();
      return matchesStatus && content.includes(query);
    });
  }

  function renderStats() {
    const total = state.employees.length;
    const active = state.employees.filter(e => e.status === 'active').length;
    const assigned = state.employees.filter(e => e.assignment).length;
    const available = state.employees.filter(e => 
      e.status === 'active' && !e.assignment
    ).length;

    const totalEl = document.getElementById('total');
    const activeEl = document.getElementById('active');
    const assignedEl = document.getElementById('assigned');
    const availableEl = document.getElementById('available');

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (assignedEl) assignedEl.textContent = assigned;
    if (availableEl) availableEl.textContent = available;
  }

  function renderGrid() {
    const filtered = getFilteredEmployees();
    const grid = document.getElementById('employeeGrid');
    const resultCount = document.getElementById('resultCount');

    if (resultCount) {
      resultCount.textContent = `${filtered.length} PEOPLE`;
    }

    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = `<div class="empty">
        <strong>${state.employees.length ? 'No matching employees' : 'Your workforce starts here.'}</strong>
        <p>${state.employees.length ? 'Try another search or filter.' : 'Register your existing workers or add employees after recruitment.'}</p>
        ${state.employees.length ? '' : '<button class="btn primary" onclick="openModal()">＋ Register First Employee</button>'}
      </div>`;
      return;
    }

    grid.innerHTML = filtered.map(e => {
      const statusLabel = STATUS_FROM_DB[e.status] || e.status;
      const statusClass = e.status === 'inactive' ? 'inactive' : 
                          e.status === 'on_leave' ? 'leave' : '';
      
      return `
        <article class="employee">
          <div class="employee-top">
            <div class="avatar">${escapeHTML(initials(e.name))}</div>
            <div class="person">
              <strong>${escapeHTML(e.name)}</strong>
              <small>${escapeHTML(e.role || 'Employee')}</small>
            </div>
            <span class="status ${statusClass}">${escapeHTML(statusLabel)}</span>
          </div>
          <div class="employee-info">
            <div>
              <div class="info-label">CONTACT</div>
              <div class="info-value">${escapeHTML(e.phone || 'Not provided')}</div>
            </div>
            <div>
              <div class="info-label">EXPERIENCE</div>
              <div class="info-value">${escapeHTML(e.experience || 'Not specified')}</div>
            </div>
            <div>
              <div class="info-label">ASSIGNMENT</div>
              <div class="info-value">${escapeHTML(e.assignment || 'Available')}</div>
            </div>
            <div>
              <div class="info-label">COMPETENCIES</div>
              <div class="info-value">${(e.skills || []).length} skills</div>
            </div>
          </div>
          <div class="skills">
            ${(e.skills || []).length 
              ? e.skills.map(s => `<span class="skill">${escapeHTML(s)}</span>`).join('')
              : '<span class="source">No competencies registered</span>'}
          </div>
          <div class="card-foot">
            <span class="source">SOURCE: <b>Manual</b></span>
            <button onclick="removeEmployee('${e.id}')">Remove ×</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function render() {
    renderStats();
    renderGrid();
  }

  function setFilter(filter, button) {
    state.filter = filter;
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    if (button) button.classList.add('active');
    render();
  }

  function openModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('open');
  }

  function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('open');
    const form = document.getElementById('employeeForm');
    if (form) form.reset();
  }

  async function ensureSkill(name) {
    const key = name.toLowerCase().trim();
    if (state.skillMap.has(key)) {
      return state.skillMap.get(key).id;
    }

    const { data, error } = await db
      .from('skills')
      .insert({ name: name.trim() })
      .select('id')
      .single();

    if (error) {
      console.error('[Employees] create skill:', error);
      return null;
    }

    state.skills.push({ id: data.id, name: name.trim() });
    state.skillMap.set(key, { id: data.id, name: name.trim() });
    return data.id;
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    if (!state.company?.id) {
      notify('Company not found. Please complete your profile first.', true);
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    
    if (!name) {
      notify('Employee name is required.', true);
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    try {
      const status = STATUS_TO_DB[formData.get('status')] || 'active';
      const skills = formData.getAll('skills').filter(Boolean).map(s => s.trim());
      const primarySkill = skills[0] || null;

      const { data: empData, error: empError } = await db
        .from('employees')
        .insert({
          company_id: state.company.id,
          name,
          phone: String(formData.get('phone') || '').trim() || null,
          role: String(formData.get('role') || '').trim() || null,
          experience: String(formData.get('experience') || '').trim() || null,
          assignment: String(formData.get('assignment') || '').trim() || null,
          status,
          primary_skill: primarySkill
        })
        .select('id')
        .single();

      if (empError) throw empError;

      if (skills.length) {
        const skillIds = [];
        for (const skillName of skills) {
          const skillId = await ensureSkill(skillName);
          if (skillId) skillIds.push(skillId);
        }

        if (skillIds.length) {
          const skillLinks = skillIds.map(skillId => ({
            employee_id: empData.id,
            skill_id: skillId
          }));

          const { error: skillError } = await db
            .from('employee_skills')
            .insert(skillLinks);

          if (skillError) {
            console.error('[Employees] link skills:', skillError);
          }
        }
      }

      notify('Employee saved successfully.');
      closeModal();
      await loadEmployees();
      render();
    } catch (error) {
      console.error('[Employees] save employee:', error);
      notify('Failed to save employee: ' + (error.message || 'unknown'), true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Employee';
      }
    }
  }

  async function removeEmployee(id) {
    if (!confirm('Remove this employee from the directory?')) return;

    const { error } = await db
      .from('employees')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', state.company.id);

    if (error) {
      console.error('[Employees] remove employee:', error);
      notify('Failed to remove employee: ' + (error.message || 'unknown'), true);
      return;
    }

    notify('Employee removed.');
    await loadEmployees();
    render();
  }

  function bindEvents() {
    const form = document.getElementById('employeeForm');
    if (form && !form.dataset.bound) {
      form.addEventListener('submit', handleFormSubmit);
      form.dataset.bound = 'true';
    }

    const searchInput = document.getElementById('search');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        render();
      });
      searchInput.dataset.bound = 'true';
    }

    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.filter');
      if (filterBtn && !filterBtn.dataset.bound) {
        e.preventDefault();
        const filter = filterBtn.dataset.filter;
        if (filter) setFilter(filter, filterBtn);
        filterBtn.dataset.bound = 'true';
      }
    });
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const hasSession = await loadSession();
    if (!hasSession) {
      console.warn('[Employees] No session, redirecting to login.');
      window.location.href = '../login.html';
      return;
    }

    await loadProfile();
    await loadCompany();

    if (!state.company?.id) {
      console.warn('[Employees] No company found.');
      notify('No company found. Please create or join a company first.', true);
      return;
    }

    await Promise.all([loadSkills(), loadEmployees()]);
    bindEvents();
    render();
  }

  window.openModal = openModal;
  window.closeModal = closeModal;
  window.setFilter = setFilter;
  window.removeEmployee = removeEmployee;
  window.render = render;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
