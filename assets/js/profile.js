(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  if (!db || !Auth) {
    console.error('[Profile] Supabase atau FPAuth belum tersedia.');
    return;
  }

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ROLE_LABELS = {
    designer: 'Designer',
    brand: 'Brand',
    manufacturer: 'Manufacturer',
    supplier: 'Supplier',
    worker: 'Worker',
    customer: 'Customer'
  };

  const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS); // admin TIDAK dimasukkan

  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    roles: [],
    designs: [],
    stats: {
      designs: 0,
      orders: 0,
      employees: 0,
      // final patch: penanda error per-count agar tidak menipu sebagai 0
      errors: {
        designs: false,
        orders: false,
        employees: false
      }
    }
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[c]);
  }

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  function notify(message, error = false) {
    let toast = $('#profile-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'profile-toast';
      toast.style.cssText = `
        position:fixed;bottom:25px;left:50%;
        transform:translateX(-50%);
        z-index:99999;padding:13px 20px;
        border-radius:12px;background:#171c24;
        color:#fff;border:1px solid #a3e635;
        font-size:13px;max-width:90%;
        box-shadow:0 4px 12px rgba(0,0,0,0.5);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.borderColor = error ? '#ef4444' : '#a3e635';
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  /* =========================================================
   * RENDER: PROFILE HEADER
   * ========================================================= */
  function renderProfile() {
    const profile = state.profile || {};
    const user = state.user || {};

    const name =
      profile.full_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'Fashion Architect';

    const card = $('.profile-card');
    if (!card) return;

    const avatar = $('.avatar', card);
    const heading = $('.identity h2', card);
    const subtitle = $('.identity p', card);

    if (heading) heading.textContent = name;
    if (subtitle) subtitle.textContent = user.email || 'Email unavailable';

    if (avatar) {
      if (profile.avatar_url) {
        avatar.innerHTML = `
          <img src="${escapeHTML(profile.avatar_url)}"
               alt="Profile avatar"
               style="width:100%;height:100%;object-fit:cover;border-radius:inherit">
        `;
      } else {
        avatar.textContent = name.charAt(0).toUpperCase();
      }
    }

    const meta = $('.profile-meta', card);
    if (meta) {
      const phoneNode = $$('.meta', meta).find(n => /phone|telepon/i.test(n.textContent));
      if (phoneNode) {
        const strong = $('strong', phoneNode);
        if (strong) strong.textContent = profile.phone || 'Not provided';
      }
    }

    renderCompany(card);
  }

  /* =========================================================
   * RENDER: COMPANY (di dalam section Business Identity)
   * ========================================================= */
  function renderCompany() {
    const sections = $$('main .panel');
    const businessSection = sections.find(s =>
      /business identity/i.test(s.textContent)
    );
    if (!businessSection) return;

    $('[data-profile-company]', businessSection)?.remove();

    const info = document.createElement('div');
    info.dataset.profileCompany = 'true';
    info.style.cssText = `
      margin-top:14px;padding:14px;
      background:rgba(255,255,255,.035);
      border:1px solid rgba(255,255,255,.09);
      border-radius:12px;
    `;

    if (!state.company) {
      info.innerHTML = `
        <strong style="font-size:13px;">No active company</strong>
        <p style="opacity:.6;font-size:12px;margin-top:6px;">
          Your account is not connected to an active company.
        </p>
      `;
    } else {
      const c = state.company;
      const m = state.membership;
      info.innerHTML = `
        <strong style="font-size:14px;color:var(--lime)">${escapeHTML(c.name)}</strong>
        <p style="opacity:.65;font-size:12px;margin-top:6px">
          ${escapeHTML(c.type || 'Company')}
          ${m?.member_role ? ' · ' + escapeHTML(m.member_role) : ''}
        </p>
        <p style="opacity:.65;font-size:12px;margin-top:4px">
          ${c.verified_at ? '✓ Verified company' : '⏳ Verification pending'}
        </p>
      `;
    }

    businessSection.appendChild(info);
  }

  /* =========================================================
   * RENDER: ROLES
   * ========================================================= */
  function renderRoles() {
    const roleList = $('.role-list');
    if (!roleList) return;

    const activeSet = new Set(
      state.roles.map(r => String(r.role).toLowerCase())
    );

    roleList.innerHTML = '';

    Object.entries(ROLE_LABELS).forEach(([enumVal, label]) => {
      const isActive = activeSet.has(enumVal);
      const span = document.createElement('span');
      span.className = 'role';
      span.textContent = label;
      if (isActive) {
        span.style.cssText =
          'background:var(--lime);color:var(--bg);font-weight:700;border-color:var(--lime);';
      }
      roleList.appendChild(span);
    });

    const addBtn = document.createElement('span');
    addBtn.className = 'role add';
    addBtn.textContent = '+ Add role';
    addBtn.style.cursor = 'pointer';
    addBtn.addEventListener('click', showRolePrompt);
    roleList.appendChild(addBtn);
  }

  async function showRolePrompt() {
    const activeSet = new Set(state.roles.map(r => String(r.role).toLowerCase()));
    const available = ASSIGNABLE_ROLES.filter(r => !activeSet.has(r));

    if (!available.length) {
      notify('You already have all assignable roles.', true);
      return;
    }

    const answer = prompt(
      `Pilih role baru:\n${available.map(r => '• ' + ROLE_LABELS[r]).join('\n')}`
    );
    if (!answer) return;

    const cleaned = answer.trim().toLowerCase();
    const match = available.find(r =>
      r === cleaned || ROLE_LABELS[r].toLowerCase() === cleaned
    );

    if (!match) {
      notify('Role tidak valid.', true);
      return;
    }

    await addRoleViaRPC(match);
  }

  async function addRoleViaRPC(roleEnum) {
    if (roleEnum === 'admin') {
      notify('Admin role hanya dapat diberikan oleh administrator.', true);
      return;
    }

    const { error } = await db.rpc('rpc_set_my_role', { p_role: roleEnum });

    if (error) {
      console.error('[Profile] rpc_set_my_role:', error);
      notify(error.message || 'Gagal menambahkan role.', true);
      return;
    }

    await loadRoles();
    renderRoles();
    notify(`Role ${ROLE_LABELS[roleEnum]} berhasil ditambahkan.`);
  }

  /* =========================================================
   * RENDER: PORTFOLIO (designs + production progress)
   * ========================================================= */
  function renderPortfolio() {
    const sections = $$('main .panel');
    const portfolioSection = sections.find(s => {
      const h3 = $('h3', s);
      return h3 && /^portfolio$/i.test(h3.textContent.trim());
    });
    if (!portfolioSection) return;

    $('[data-portfolio]', portfolioSection)?.remove();

    const wrapper = document.createElement('div');
    wrapper.dataset.portfolio = 'true';
    wrapper.style.cssText = 'margin-top:14px;';

    if (!state.designs.length) {
      wrapper.innerHTML = `
        <p style="opacity:.6;font-size:12px;">
          No designs published yet. Create your first design from Design Studio.
        </p>
        <a class="panel-link" href="create-design.html" style="display:inline-block;margin-top:10px;">
          Open Design Studio ↗
        </a>
      `;
      portfolioSection.appendChild(wrapper);
      return;
    }

    wrapper.innerHTML = state.designs.map(d => {
      const orders = d.orders || [];
      const totalQty = orders.reduce((s, o) => s + Number(o.qty || 0), 0);
      // final patch: label diperjelas — rata-rata sederhana antar-PO
      const avgProgress = orders.length
        ? Math.round(
            orders.reduce((s, o) => s + Number(o.progress_pct || 0), 0) / orders.length
          )
        : 0;

      const poLine = orders.length
        ? `· ${orders.length} PO · ${fmtNumber(totalQty)} pcs · Average PO Progress ${avgProgress}%`
        : '· No production order yet';

      return `
        <div style="padding:12px 0;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <strong style="font-size:12px;">${escapeHTML(d.name)}</strong>
            <span style="font-family:var(--mono);font-size:10px;opacity:.6;white-space:nowrap;">
              ${escapeHTML(String(d.status || 'draft').toUpperCase())}
            </span>
          </div>
          <p style="opacity:.6;font-size:10px;margin:4px 0 0 0;font-family:var(--mono);">
            ${escapeHTML(d.material || 'no material')} · ${escapeHTML(d.technique || 'no technique')}
          </p>
          <p style="opacity:.75;font-size:10px;margin:4px 0 0 0;color:var(--lime);">
            ${poLine}
          </p>
        </div>
      `;
    }).join('') + `
      <a class="panel-link" href="create-design.html" style="display:inline-block;margin-top:12px;">
        Manage portfolio ↗
      </a>
    `;

    portfolioSection.appendChild(wrapper);
  }

  /* =========================================================
   * RENDER: ACTIVITY STATS
   * ========================================================= */
  function renderActivityStats() {
    const sections = $$('main .panel');
    const activitySection = sections.find(s => {
      const h3 = $('h3', s);
      return h3 && /activity/i.test(h3.textContent);
    });
    if (!activitySection) return;

    $('[data-activity-stats]', activitySection)?.remove();

    const wrapper = document.createElement('div');
    wrapper.dataset.activityStats = 'true';
    wrapper.style.cssText = `
      display:grid;grid-template-columns:repeat(3,1fr);
      gap:10px;margin-top:14px;
    `;

    // final patch: TIDAK menampilkan 0 jika query gagal.
    // Jika error -> tampilkan "—" dengan label "error".
    const cell = (value, label, isError) => {
      const display = isError ? '—' : fmtNumber(value);
      const color = isError ? '#f87171' : 'var(--lime)';
      const note = isError
        ? '<div style="font-size:9px;margin-top:3px;opacity:.55;">unavailable</div>'
        : '';
      return `
        <div style="text-align:center;padding:10px;background:rgba(255,255,255,.03);border-radius:8px;">
          <div style="font-size:22px;font-weight:800;color:${color};">${display}</div>
          <div style="font-size:10px;opacity:.6;margin-top:4px;font-family:var(--mono);">
            ${label}
          </div>
          ${note}
        </div>
      `;
    };

    wrapper.innerHTML = [
      cell(state.stats.designs, 'DESIGNS', state.stats.errors.designs),
      cell(state.stats.orders, 'PRODUCTION', state.stats.errors.orders),
      cell(state.stats.employees, 'WORKFORCE', state.stats.errors.employees)
    ].join('');

    activitySection.appendChild(wrapper);

    const link = $('a.panel-link', activitySection);
    if (link && link.getAttribute('href') === '#') {
      link.setAttribute('href', 'dashboard.html');
    }
  }

  /* =========================================================
   * DATA LOADERS
   * ========================================================= */
  async function loadCompany() {
    const companyId = state.profile?.default_company_id;

    if (companyId) {
      const { data, error } = await db
        .from('companies')
        .select('id,name,type,business_license,verified_at')
        .eq('id', companyId)
        .is('deleted_at', null)          // final patch
        .maybeSingle();

      if (error) console.warn('[Profile] company lookup:', error.message);

      if (data) {
        state.company = data;

        const { data: member, error: mErr } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();

        if (mErr) console.warn('[Profile] membership lookup:', mErr.message);
        state.membership = member || null;
        return;
      }
    }

    // Fallback: cari membership terbaru
    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,member_role,joined_at')   // final patch
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false });    // final patch

    if (error) {
      console.warn('[Profile] membership list:', error.message);
      return;
    }
    if (!memberships?.length) return;

    state.membership = memberships[0];

    const { data: company, error: cErr } = await db
      .from('companies')
      .select('id,name,type,business_license,verified_at')
      .eq('id', memberships[0].company_id)
      .is('deleted_at', null)          // final patch
      .maybeSingle();

    if (cErr) console.warn('[Profile] company from membership:', cErr.message);
    state.company = company || null;
  }

  async function loadRoles() {
    const { data, error } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', state.user.id);

    if (error) {
      console.error('[Profile] Load roles:', error);
      state.roles = [];
      return;
    }
    state.roles = data || [];
  }

  async function loadDesigns() {
    if (!state.company?.id) {
      state.designs = [];
      return;
    }

    const { data: designs, error: dErr } = await db
      .from('designs')
      .select('id,name,material,technique,status,created_at')
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (dErr) {
      console.error('[Profile] Load designs:', dErr);
      state.designs = [];
      return;
    }

    if (!designs?.length) {
      state.designs = [];
      return;
    }

    const designIds = designs.map(d => d.id);

    const { data: orders, error: oErr } = await db
      .from('production_orders')
      .select('id,design_id,qty,progress_pct,status,stage')
      .eq('company_id', state.company.id)    // final patch
      .in('design_id', designIds)
      .is('deleted_at', null);

    if (oErr) {
      console.error('[Profile] Load production orders:', oErr);
      state.designs = designs.map(d => ({ ...d, orders: [] }));
      return;
    }

    const orderMap = new Map();
    (orders || []).forEach(o => {
      if (!orderMap.has(o.design_id)) orderMap.set(o.design_id, []);
      orderMap.get(o.design_id).push(o);
    });

    state.designs = designs.map(d => ({
      ...d,
      orders: orderMap.get(d.id) || []
    }));
  }

  async function loadStats() {
    if (!state.company?.id) {
      state.stats = {
        designs: 0,
        orders: 0,
        employees: 0,
        errors: { designs: false, orders: false, employees: false }
      };
      return;
    }

    const [designRes, orderRes, empRes] = await Promise.all([
      db.from('designs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', state.company.id)
        .is('deleted_at', null),
      db.from('production_orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', state.company.id)
        .is('deleted_at', null),
      db.from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', state.company.id)
        .is('deleted_at', null)
    ]);

    if (designRes.error) console.error('[Profile] count designs:', designRes.error);
    if (orderRes.error)  console.error('[Profile] count orders:', orderRes.error);
    if (empRes.error)    console.error('[Profile] count employees:', empRes.error);

    // final patch: catat status error per-count. Jangan biarkan error tampil sebagai 0.
    state.stats = {
      designs:   designRes.error ? null : (designRes.count || 0),
      orders:    orderRes.error  ? null : (orderRes.count  || 0),
      employees: empRes.error    ? null : (empRes.count    || 0),
      errors: {
        designs:   !!designRes.error,
        orders:    !!orderRes.error,
        employees: !!empRes.error
      }
    };
  }

  async function loadEquipment() {
    const container = $('#equipment-content');
    if (!container) return;

    if (!state.company?.id) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">＋</div>
          <strong>No company yet</strong>
          <p>Create or join a company before adding equipment.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '<p style="opacity:.6;font-size:12px;">Loading equipment...</p>';

    const { data, error } = await db
      .from('equipment')
      .select('id,name,type,capacity,status')
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Profile] Equipment:', error);
      container.innerHTML = `
        <p style="color:#f87171;font-size:12px;">
          Unable to load equipment. ${escapeHTML(error.message)}
        </p>
      `;
      return;
    }

    if (!data?.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">＋</div>
          <strong>No equipment registered yet</strong>
          <p>Add your first machine or production equipment to build your workshop inventory.</p>
          <button class="btn primary" id="btn-add-equipment">Add Equipment</button>
        </div>
      `;
      $('#btn-add-equipment')?.addEventListener('click', () => {
        window.location.href = 'equipment.html';
      });
      return;
    }

    container.innerHTML = data.map(item => `
      <div style="
        padding:14px;margin:10px 0;
        border:1px solid rgba(255,255,255,.09);
        border-radius:12px;background:rgba(255,255,255,.025);
      ">
        <strong style="font-size:13px;">${escapeHTML(item.name)}</strong>
        <div style="font-size:12px;opacity:.65;margin-top:6px">
          ${escapeHTML(item.type || 'Equipment')}
          ${item.capacity ? ' · ' + escapeHTML(item.capacity) : ''}
        </div>
        <div style="font-size:11px;margin-top:7px;color:#a3e635;font-family:var(--mono);">
          ${escapeHTML(String(item.status || '').toUpperCase())}
        </div>
      </div>
    `).join('') + `
      <button class="btn primary" id="btn-add-equipment" style="margin-top:12px;">
        Add Equipment
      </button>
    `;
    $('#btn-add-equipment')?.addEventListener('click', () => {
      window.location.href = 'equipment.html';
    });
  }

  /* =========================================================
   * EDIT PROFILE MODAL
   * ========================================================= */
  function inputStyle() {
    return `
      box-sizing:border-box;width:100%;
      padding:12px;border-radius:9px;
      background:#0e1218;color:#fff;
      border:1px solid #343b46;outline:none;
      font-family:inherit;font-size:13px;
    `;
  }

  function buttonStyle(primary) {
    return `
      flex:1;padding:12px;border-radius:9px;
      border:1px solid ${primary ? '#a3e635' : '#343b46'};
      background:${primary ? '#a3e635' : 'transparent'};
      color:${primary ? '#111' : '#fff'};
      font-weight:700;cursor:pointer;
      font-family:inherit;font-size:13px;
    `;
  }

  function openEditor() {
    if ($('#profile-editor')) return;

    const profile = state.profile || {};

    const modal = document.createElement('div');
    modal.id = 'profile-editor';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:99998;
      background:rgba(0,0,0,.78);
      display:flex;align-items:center;justify-content:center;
      padding:20px;backdrop-filter:blur(4px);
    `;

    modal.innerHTML = `
      <form id="profile-edit-form" style="
        width:100%;max-width:430px;
        background:#171c24;color:#fff;
        padding:24px;border-radius:18px;
        border:1px solid rgba(255,255,255,.12);
        box-shadow:0 20px 60px rgba(0,0,0,0.5);
      ">
        <h2 style="margin:0 0 20px;font-size:18px;">Edit Profile</h2>

        <label style="display:block;font-size:11px;margin-bottom:7px;opacity:.7;">Full Name</label>
        <input name="full_name" maxlength="100" required
          value="${escapeHTML(profile.full_name || '')}"
          style="${inputStyle()}">

        <label style="display:block;font-size:11px;margin:15px 0 7px;opacity:.7;">Phone</label>
        <input name="phone" maxlength="30"
          value="${escapeHTML(profile.phone || '')}"
          style="${inputStyle()}">

        <label style="display:block;font-size:11px;margin:15px 0 7px;opacity:.7;">Avatar URL</label>
        <input name="avatar_url" type="url" maxlength="2048"
          value="${escapeHTML(profile.avatar_url || '')}"
          placeholder="https://..."
          style="${inputStyle()}">

        <p style="font-size:11px;opacity:.55;margin-top:12px;font-family:var(--mono);">
          EMAIL: ${escapeHTML(state.user.email)}
        </p>

        <div style="display:flex;gap:10px;margin-top:22px">
          <button type="button" id="profile-cancel"
            style="${buttonStyle(false)}">Cancel</button>
          <button type="submit"
            style="${buttonStyle(true)}">Save Changes</button>
        </div>
      </form>
    `;

    document.body.appendChild(modal);

    $('#profile-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });

    $('#profile-edit-form').onsubmit = saveProfile;
  }

  async function saveProfile(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const values = new FormData(form);

    const full_name = String(values.get('full_name') || '').trim();
    const phone = String(values.get('phone') || '').trim();
    const avatar_url = String(values.get('avatar_url') || '').trim();

    if (!full_name) {
      notify('Full name is required.', true);
      return;
    }

    if (avatar_url) {
      try {
        const u = new URL(avatar_url);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad');
      } catch {
        notify('Avatar URL must be a valid HTTP or HTTPS URL.', true);
        return;
      }
    }

    submit.disabled = true;
    submit.textContent = 'Saving...';

    const { data, error } = await db
      .from('profiles')
      .update({ full_name, phone, avatar_url: avatar_url || null })
      .eq('id', state.user.id)
      .select('id,full_name,phone,avatar_url,default_company_id')
      .single();

    if (error) {
      console.error('[Profile] Save:', error);
      notify(error.message || 'Could not save profile.', true);
      submit.disabled = false;
      submit.textContent = 'Save Changes';
      return;
    }

    state.profile = data;
    renderProfile();
    $('#profile-editor')?.remove();
    notify('Profile updated successfully.');
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    try {
      const session = await Auth.getSession();

      if (!session?.user) {
        window.location.replace('login.html');
        return;
      }

      state.user = session.user;

      const [profileResult] = await Promise.allSettled([
        Auth.getProfile(session.user.id),
        loadRoles()
      ]);

      if (profileResult.status === 'fulfilled') {
        state.profile = profileResult.value;
      } else {
        console.warn('[Profile] getProfile:', profileResult.reason);
        state.profile = null;
      }

      await loadCompany();

      await Promise.all([
        loadDesigns(),
        loadStats(),
        loadEquipment()
      ]);

      renderProfile();
      renderRoles();
      renderPortfolio();
      renderActivityStats();

      // Bind "Edit Profile"
      const editButton = $$('button, a').find(
        el => /edit profile/i.test(el.textContent)
      );
      if (editButton) {
        editButton.removeAttribute('onclick');
        editButton.addEventListener('click', (e) => {
          e.preventDefault();
          openEditor();
        });
      }

      // final patch: Account Settings — berdasarkan judul panel, bukan link text.
      // Cari panel yang h3-nya "Account Settings", ambil link di dalamnya,
      // arahkan ke settings.html.
      const allPanels = $$('main .panel');
      const accountPanel = allPanels.find(p => {
        const h3 = $('h3', p);
        return h3 && /^account settings$/i.test(h3.textContent.trim());
      });
      if (accountPanel) {
        const link = $('a.panel-link', accountPanel);
        if (link) {
          link.setAttribute('href', 'settings.html');
          // Hapus handler onclick yang mungkin masih tersisa dari HTML asli
          link.removeAttribute('onclick');
        }
      }

      console.info('[Profile] Loaded successfully.');
    } catch (error) {
      console.error('[Profile] Initialization failed:', error);
      notify(error.message || 'Unable to load profile.', true);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
