/*! FastProduction V2 — settings.js
 *  Module: Settings — Account preferences
 *  Target: pages/settings.html
 *  Dependencies: config.js, supabase.js, auth.js
 *  Tables: profiles (for display name, email)
 *  Storage: localStorage (for preferences not in DB)
 */
(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  if (!db || !Auth) {
    console.error('[Settings] Supabase atau FPAuth belum tersedia.');
    return;
  }

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    preferences: {},
    initialized: false
  };

  const PREF_KEY = 'fp_settings_preferences';

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (sel) => document.querySelector(sel);

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function notify(message, isError = false) {
    console.log(`[Settings] ${message}`);
    let toast = $('#settings-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'settings-toast';
      toast.style.cssText = `
        position:fixed;bottom:25px;left:50%;transform:translateX(-50%);
        z-index:99999;padding:13px 20px;border-radius:12px;
        background:#171c24;color:#fff;border:1px solid #c5f36b;
        font-size:13px;max-width:90%;box-shadow:0 8px 24px rgba(0,0,0,.5);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.borderColor = isError ? '#f87171' : '#c5f36b';
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  /* =========================================================
   * AUTH + PROFILE
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
      console.error('[Settings] session error:', err);
      return false;
    }
  }

  async function loadProfile() {
    try {
      state.profile = await Auth.getProfile(state.user.id);
    } catch (err) {
      console.warn('[Settings] getProfile:', err);
      state.profile = null;
    }
  }

  /* =========================================================
   * PREFERENCES (localStorage)
   * ========================================================= */
  function loadPreferences() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      state.preferences = raw ? JSON.parse(raw) : {};
    } catch {
      state.preferences = {};
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(state.preferences));
    } catch (err) {
      console.warn('[Settings] save preferences:', err);
    }
  }

  /* =========================================================
   * POPULATE FORM
   * ========================================================= */
  function populateForm() {
    const profile = state.profile || {};
    const prefs = state.preferences;

    // Account panel
    const displayNameInput = $('#account input[type="text"]');
    const emailInput = $('#account input[type="email"]');
    const languageSelect = $('#account select');

    if (displayNameInput) {
      displayNameInput.value = profile.full_name || state.user?.user_metadata?.full_name || '';
    }
    if (emailInput) {
      emailInput.value = state.user?.email || '';
    }
    if (languageSelect) {
      languageSelect.value = prefs.language || 'Bahasa Indonesia';
    }

    // Security panel
    const securityToggles = $$('#security .toggle');
    if (securityToggles[0]) securityToggles[0].checked = prefs.twoFactor || false;
    if (securityToggles[1]) securityToggles[1].checked = prefs.loginNotifications !== false;

    // Notifications panel
    const notifToggles = $$('#notifications .toggle');
    if (notifToggles[0]) notifToggles[0].checked = prefs.marketplaceUpdates !== false;
    if (notifToggles[1]) notifToggles[1].checked = prefs.productionUpdates !== false;
    if (notifToggles[2]) notifToggles[2].checked = prefs.financialNotifications !== false;
    if (notifToggles[3]) notifToggles[3].checked = prefs.promotionalUpdates || false;

    // Privacy panel
    const privacyToggles = $$('#privacy .toggle');
    if (privacyToggles[0]) privacyToggles[0].checked = prefs.publicProfile !== false;
    if (privacyToggles[1]) privacyToggles[1].checked = prefs.showBusinessIdentity || false;

    // Preferences panel
    const prefThemeSelect = $('#preferences select');
    const prefCompactToggle = $('#preferences .toggle');
    if (prefThemeSelect) prefThemeSelect.value = prefs.theme || 'Dark';
    if (prefCompactToggle) prefCompactToggle.checked = prefs.compactInterface || false;

    // Financial panel
    const finCurrencySelect = $('#financial select');
    const finToggles = $$('#financial .toggle');
    if (finCurrencySelect) finCurrencySelect.value = prefs.currency || 'IDR — Indonesian Rupiah';
    if (finToggles[0]) finToggles[0].checked = prefs.invoiceReminders !== false;
    if (finToggles[1]) finToggles[1].checked = prefs.paymentConfirmation !== false;
  }

  /* =========================================================
   * COLLECT FORM DATA
   * ========================================================= */
  function collectFormData() {
    const prefs = {};

    // Account
    const displayNameInput = $('#account input[type="text"]');
    const emailInput = $('#account input[type="email"]');
    const languageSelect = $('#account select');

    prefs.displayName = displayNameInput?.value || '';
    prefs.email = emailInput?.value || '';
    prefs.language = languageSelect?.value || 'Bahasa Indonesia';

    // Security
    const securityToggles = $$('#security .toggle');
    prefs.twoFactor = securityToggles[0]?.checked || false;
    prefs.loginNotifications = securityToggles[1]?.checked !== false;

    // Notifications
    const notifToggles = $$('#notifications .toggle');
    prefs.marketplaceUpdates = notifToggles[0]?.checked !== false;
    prefs.productionUpdates = notifToggles[1]?.checked !== false;
    prefs.financialNotifications = notifToggles[2]?.checked !== false;
    prefs.promotionalUpdates = notifToggles[3]?.checked || false;

    // Privacy
    const privacyToggles = $$('#privacy .toggle');
    prefs.publicProfile = privacyToggles[0]?.checked !== false;
    prefs.showBusinessIdentity = privacyToggles[1]?.checked || false;

    // Preferences
    const prefThemeSelect = $('#preferences select');
    const prefCompactToggle = $('#preferences .toggle');
    prefs.theme = prefThemeSelect?.value || 'Dark';
    prefs.compactInterface = prefCompactToggle?.checked || false;

    // Financial
    const finCurrencySelect = $('#financial select');
    const finToggles = $$('#financial .toggle');
    prefs.currency = finCurrencySelect?.value || 'IDR — Indonesian Rupiah';
    prefs.invoiceReminders = finToggles[0]?.checked !== false;
    prefs.paymentConfirmation = finToggles[1]?.checked !== false;

    return prefs;
  }

  /* =========================================================
   * SAVE HANDLER
   * ========================================================= */
  async function handleSave() {
    const prefs = collectFormData();

    // Update profile in Supabase
    const updatePayload = {};
    if (prefs.displayName && prefs.displayName !== (state.profile?.full_name || '')) {
      updatePayload.full_name = prefs.displayName;
    }

    let profileUpdated = false;
    if (Object.keys(updatePayload).length > 0) {
      try {
        const { data, error } = await db
          .from('profiles')
          .update(updatePayload)
          .eq('id', state.user.id)
          .select('id,full_name')
          .single();

        if (error) throw error;
        state.profile = { ...state.profile, ...data };
        profileUpdated = true;
      } catch (err) {
        console.error('[Settings] update profile:', err);
        notify('Failed to update profile: ' + (err.message || 'unknown'), true);
        return;
      }
    }

    // Save preferences to localStorage
    state.preferences = prefs;
    savePreferences();

    const message = profileUpdated
      ? 'Profile and preferences saved successfully.'
      : 'Preferences saved successfully.';
    notify(message);
  }

  /* =========================================================
   * EVENT BINDING
   * ========================================================= */
  function bindEvents() {
    const saveBtn = $('button[onclick*="alert"]');
    if (saveBtn) {
      saveBtn.removeAttribute('onclick');
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleSave();
      });
    }

    // Smooth scroll for settings nav
    $$('.settings-nav a').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href')?.replace('#', '');
        const target = targetId ? $('#' + targetId) : null;
        if (target) {
          $$('.settings-nav a').forEach((x) => x.classList.remove('active'));
          link.classList.add('active');
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
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
    loadPreferences();
    populateForm();
    bindEvents();

    console.info('[Settings] Ready.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
