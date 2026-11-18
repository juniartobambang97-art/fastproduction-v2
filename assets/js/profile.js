(function () {
  'use strict';

  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  if (!db || !Auth) {
    console.error('[Profile] Supabase atau FPAuth belum tersedia.');
    return;
  }

  const $ = (selector) => document.querySelector(selector);

  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
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

  function renderProfile() {
    const profile = state.profile || {};
    const user = state.user || {};

    const name =
      profile.full_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'Fashion Architect';

    const avatar = $('.profile-card .avatar');
    const heading = $('.profile-card .identity h2');
    const subtitle = $('.profile-card .identity p');

    if (heading) heading.textContent = name;

    if (subtitle) {
      subtitle.textContent = user.email || 'Email unavailable';
    }

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

    const meta = $('.profile-meta');
    if (meta) {
      const phone = profile.phone || 'Not provided';

      const phoneNode = [...meta.querySelectorAll('.meta')]
        .find(node => /phone|telepon/i.test(node.textContent));

      if (phoneNode) {
        const value = phoneNode.querySelector('strong, span:last-child');
        if (value) value.textContent = phone;
      }
    }

    renderCompany();
  }

  function renderCompany() {
    const company = state.company;
    const membership = state.membership;

    const sections = [...document.querySelectorAll('main section')];

    const businessSection = sections.find(section =>
      /business identity/i.test(section.textContent)
    );

    if (!businessSection) return;

    let info = businessSection.querySelector('[data-profile-company]');

    if (!info) {
      info = document.createElement('div');
      info.dataset.profileCompany = 'true';
      info.style.cssText = `
        margin-top:14px;padding:14px;
        background:rgba(255,255,255,.035);
        border:1px solid rgba(255,255,255,.09);
        border-radius:12px;
      `;
      businessSection.appendChild(info);
    }

    if (!company) {
      info.innerHTML = `
        <strong>No active company</strong>
        <p style="opacity:.6;font-size:12px">
          Your account is not connected to an active company.
        </p>
      `;
      return;
    }

    info.innerHTML = `
      <strong>${escapeHTML(company.name)}</strong>
      <p style="opacity:.65;font-size:12px;margin-top:6px">
        ${escapeHTML(company.type || 'Company')}
        ${membership?.member_role
          ? ' · ' + escapeHTML(membership.member_role)
          : ''}
      </p>
      <p style="opacity:.65;font-size:12px">
        ${company.verified_at ? 'Verified company' : 'Verification pending'}
      </p>
    `;
  }

  async function loadCompany() {
    const companyId = state.profile?.default_company_id;

    if (companyId) {
      const { data, error } = await db
        .from('companies')
        .select('id,name,type,business_license,verified_at')
        .eq('id', companyId)
        .maybeSingle();

      if (error) console.warn('[Profile] Company:', error.message);

      if (data) {
        state.company = data;

        const { data: member } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();

        state.membership = member;
        return;
      }
    }

    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,member_role')
      .eq('user_id', state.user.id);

    if (error) {
      console.warn('[Profile] Membership:', error.message);
      return;
    }

    if (!memberships?.length) return;

    state.membership = memberships[0];

    const { data: company } = await db
      .from('companies')
      .select('id,name,type,business_license,verified_at')
      .eq('id', memberships[0].company_id)
      .maybeSingle();

    state.company = company;
  }

  async function loadEquipment() {
    const container = $('#equipment-content');
    if (!container) return;

    if (!state.company?.id) {
      container.innerHTML = `
        <p style="opacity:.6">No company equipment available yet.</p>
      `;
      return;
    }

    container.innerHTML = '<p style="opacity:.6">Loading equipment...</p>';

    const { data, error } = await db
      .from('equipment')
      .select('id,name,type,capacity,status')
      .eq('company_id', state.company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Profile] Equipment:', error);
      container.innerHTML = `
        <p style="color:#f87171">Unable to load equipment.</p>
      `;
      return;
    }

    if (!data?.length) {
      container.innerHTML = `
        <p style="opacity:.6">No equipment registered for this company.</p>
      `;
      return;
    }

    container.innerHTML = data.map(item => `
      <div style="
        padding:14px;margin:10px 0;
        border:1px solid rgba(255,255,255,.09);
        border-radius:12px;background:rgba(255,255,255,.025)
      ">
        <strong>${escapeHTML(item.name)}</strong>
        <div style="font-size:12px;opacity:.65;margin-top:6px">
          ${escapeHTML(item.type || 'Equipment')}
          ${item.capacity ? ' · ' + escapeHTML(item.capacity) : ''}
        </div>
        <div style="font-size:11px;margin-top:7px;color:#a3e635">
          ${escapeHTML(item.status)}
        </div>
      </div>
    `).join('');
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
      padding:20px;
    `;

    modal.innerHTML = `
      <form id="profile-edit-form" style="
        width:100%;max-width:430px;
        background:#171c24;color:#fff;
        padding:24px;border-radius:18px;
        border:1px solid rgba(255,255,255,.12)
      ">
        <h2 style="margin:0 0 20px">Edit Profile</h2>

        <label style="display:block;font-size:12px;margin-bottom:7px">
          Full Name
        </label>
        <input name="full_name" maxlength="100" required
          value="${escapeHTML(profile.full_name || '')}"
          style="${inputStyle()}">

        <label style="display:block;font-size:12px;margin:15px 0 7px">
          Phone
        </label>
        <input name="phone" maxlength="30"
          value="${escapeHTML(profile.phone || '')}"
          style="${inputStyle()}">

        <label style="display:block;font-size:12px;margin:15px 0 7px">
          Avatar URL
        </label>
        <input name="avatar_url" type="url" maxlength="2048"
          value="${escapeHTML(profile.avatar_url || '')}"
          placeholder="https://..."
          style="${inputStyle()}">

        <p style="font-size:11px;opacity:.55;margin-top:12px">
          Email: ${escapeHTML(state.user.email)}
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

    modal.addEventListener('click', event => {
      if (event.target === modal) modal.remove();
    });

    $('#profile-edit-form').onsubmit = saveProfile;
  }

  function inputStyle() {
    return `
      box-sizing:border-box;width:100%;
      padding:12px;border-radius:9px;
      background:#0e1218;color:#fff;
      border:1px solid #343b46;outline:none
    `;
  }

  function buttonStyle(primary) {
    return `
      flex:1;padding:12px;border-radius:9px;
      border:1px solid ${primary ? '#a3e635' : '#343b46'};
      background:${primary ? '#a3e635' : 'transparent'};
      color:${primary ? '#111' : '#fff'};
      font-weight:700;cursor:pointer
    `;
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
        const url = new URL(avatar_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Invalid URL');
        }
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

  async function init() {
    try {
      const session = await Auth.getSession();

      if (!session?.user) {
        window.location.replace('login.html');
        return;
      }

      state.user = session.user;

      state.profile = await Auth.getProfile(session.user.id);

      await loadCompany();

      renderProfile();
      await loadEquipment();

      const editButton = [...document.querySelectorAll('button,a')]
        .find(element => /edit profile/i.test(element.textContent));

      if (editButton) {
        editButton.removeAttribute('onclick');
        editButton.addEventListener('click', event => {
          event.preventDefault();
          openEditor();
        });
      }

      console.info('[Profile] Loaded successfully.');
    } catch (error) {
      console.error('[Profile] Initialization failed:', error);
      notify(error.message || 'Unable to load profile.', true);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
