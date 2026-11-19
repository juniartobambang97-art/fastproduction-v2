(function () {
  'use strict';

  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  const form = document.getElementById('create-company-form');
  const button = document.getElementById('create-button');
  const message = document.getElementById('company-message');

  if (!db || !Auth || !form) {
    console.error('[CreateCompany] Dependencies unavailable.');
    return;
  }

  function showMessage(text, type) {
    message.textContent = text;
    message.className = 'message ' + type;
  }

  async function init() {
    try {
      const session = await Auth.getSession();

      if (!session?.user) {
        window.location.replace('login.html');
        return;
      }

      console.info('[CreateCompany] Authenticated:', session.user.id);
    } catch (error) {
      console.error('[CreateCompany] Auth error:', error);
      showMessage('Unable to verify your session. Please reload.', 'error');
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const name = document.getElementById('company-name').value.trim();
    const type = document.getElementById('company-type').value;

    if (name.length < 2 || name.length > 80) {
      showMessage('Company name must contain 2–80 characters.', 'error');
      return;
    }

    if (!['manufacturer', 'brand'].includes(type)) {
      showMessage('Invalid company type.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'CREATING COMPANY...';
    message.className = 'message';
    message.textContent = '';

    try {
      const { data, error } = await db.rpc('rpc_create_company', {
        p_name: name,
        p_type: type
      });

      if (error) throw error;

      if (!data) {
        throw new Error('Company creation returned no company ID.');
      }

      showMessage(
        'Company created successfully. Opening your workspace...',
        'success'
      );

      button.textContent = 'CREATED ✓';

      setTimeout(() => {
        window.location.replace('dashboard.html');
      }, 1000);

    } catch (error) {
      console.error('[CreateCompany] RPC failed:', error);

      showMessage(
        error.message || 'Unable to create company. Please try again.',
        'error'
      );

      button.disabled = false;
      button.textContent = 'CREATE COMPANY →';
    }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
