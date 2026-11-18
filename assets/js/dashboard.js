(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  if (!db || !Auth) {
    console.error('[Dashboard] Supabase atau FPAuth belum tersedia.');
    return;
  }

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[c]);
  }

  function fmtIDR(n) {
    const num = Number(n || 0);
    return 'Rp ' + num.toLocaleString('id-ID');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch { return '—'; }
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return '—'; }
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return fmtDate(iso);
  }

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null
  };

  /* =========================================================
   * SIDEBAR USER MINI + TOPBAR
   * ========================================================= */
  function renderUserMini() {
    const wrap = $('.sidebar-bottom .user-mini');
    if (!wrap) return;

    const avatar = $('.avatar', wrap);
    const nameEl = $('strong', wrap);
    const roleEl = $('small', wrap);

    const profile = state.profile || {};
    const memberRole = state.membership?.member_role;
    const companyName = state.company?.name;

    const displayName =
      profile.full_name ||
      state.user?.user_metadata?.full_name ||
      state.user?.email?.split('@')[0] ||
      'Your Account';

    if (nameEl) nameEl.textContent = displayName;

    if (roleEl) {
      if (companyName) {
        roleEl.textContent = memberRole
          ? `${memberRole} · ${companyName}`
          : companyName;
      } else {
        roleEl.textContent = 'Personal workspace';
      }
    }

    if (avatar) {
      if (profile.avatar_url) {
        avatar.innerHTML = `
          <img src="${escapeHTML(profile.avatar_url)}" alt="Avatar"
               style="width:100%;height:100%;object-fit:cover;border-radius:inherit">
        `;
      } else {
        avatar.textContent = displayName.charAt(0).toUpperCase();
      }
    }
  }

  /* =========================================================
   * STAT CARDS
   * ========================================================= */
  function setStatValue(index, value) {
    // .stats > .card ke-(index) > .stat-value
    const stats = $('.stats');
    if (!stats) return;
    const cards = $$('.card', stats);
    const card = cards[index];
    if (!card) return;
    const el = $('.stat-value', card);
    if (!el) return;

    if (value === null || value === undefined) {
      el.textContent = '—';
      el.style.color = '#f87171';
    } else {
      el.textContent = Number(value).toLocaleString('id-ID');
      el.style.color = '';
    }
  }

  async function loadStats() {
    if (!state.company?.id) {
      // No company → semua stat 0 (bukan error)
      setStatValue(0, 0);
      setStatValue(1, 0);
      setStatValue(2, 0);
      setStatValue(3, 0);
      return;
    }

    const companyId = state.company.id;

    const [designsRes, ordersRes, employeesRes, equipmentRes] = await Promise.all([
      db.from('designs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null),
      db.from('production_orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['in_production', 'qc', 'ready_to_ship'])
        .is('deleted_at', null),
      db.from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null),
      db.from('equipment')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
    ]);

    if (designsRes.error)   console.error('[Dashboard] designs:', designsRes.error);
    if (ordersRes.error)    console.error('[Dashboard] orders:', ordersRes.error);
    if (employeesRes.error) console.error('[Dashboard] employees:', employeesRes.error);
    if (equipmentRes.error) console.error('[Dashboard] equipment:', equipmentRes.error);

    setStatValue(0, designsRes.error   ? null : (designsRes.count   || 0));
    setStatValue(1, ordersRes.error    ? null : (ordersRes.count    || 0));
    setStatValue(2, employeesRes.error ? null : (employeesRes.count || 0));
    setStatValue(3, equipmentRes.error ? null : (equipmentRes.count || 0));
  }

  /* =========================================================
   * WALLET
   * ========================================================= */
  async function loadWallet() {
    const balanceEl = $('#balance');
    const availableEl = $('.wallet-bottom .wallet-detail:nth-child(1) strong');
    const pendingEl = $('.wallet-bottom .wallet-detail:nth-child(2) strong');

    if (!state.company?.id) {
      if (balanceEl) balanceEl.textContent = 'Rp —';
      if (availableEl) availableEl.textContent = 'Rp —';
      if (pendingEl) pendingEl.textContent = 'Rp —';
      return;
    }

    const { data, error } = await db
      .from('wallet_balances')
      .select('wallet_id,company_id,currency,balance')
      .eq('company_id', state.company.id)
      .maybeSingle();

    if (error) {
      console.error('[Dashboard] wallet_balances:', error);
      if (balanceEl) {
        balanceEl.textContent = 'Unavailable';
        balanceEl.style.fontSize = '20px';
      }
      return;
    }

    const balance = data?.balance ?? 0;
    const currency = data?.currency || 'IDR';

    if (balanceEl) balanceEl.textContent = fmtIDR(balance);

    if (availableEl) availableEl.textContent = fmtIDR(balance);
    if (pendingEl) pendingEl.textContent = 'Rp 0';
    // Pending balance tidak ada kolomnya di schema — tampilkan Rp 0 sebagai placeholder eksplisit.
  }

  /* =========================================================
   * PROJECT OVERVIEW (3 rows: Design / Production / Vacancy)
   * ========================================================= */
  async function loadProjectOverview() {
    const overviewCard = $('.columns .card:first-child');
    if (!overviewCard) return;

    const rows = $$('.project', overviewCard);
    if (!rows.length) return;

    if (!state.company?.id) {
      rows.forEach(row => {
        const status = $('.project-status', row);
        if (status) status.textContent = '—';
      });
      return;
    }

    const companyId = state.company.id;

    const [designsRes, ordersRes, vacanciesRes] = await Promise.all([
      db.from('designs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null),
      db.from('production_orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null),
      db.from('vacancies')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'open')
    ]);

    if (designsRes.error)   console.error('[Dashboard] overview designs:', designsRes.error);
    if (ordersRes.error)    console.error('[Dashboard] overview orders:', ordersRes.error);
    if (vacanciesRes.error) console.error('[Dashboard] overview vacancies:', vacanciesRes.error);

    const map = [
      designsRes.error   ? '—' : String(designsRes.count   || 0),
      ordersRes.error    ? '—' : String(ordersRes.count    || 0),
      vacanciesRes.error ? '—' : String(vacanciesRes.count || 0)
    ];

    rows.forEach((row, idx) => {
      const status = $('.project-status', row);
      if (status && map[idx] !== undefined) {
        status.textContent = map[idx];
        if (map[idx] === '—') status.style.color = '#f87171';
      }
    });
  }

  /* =========================================================
   * RECENT ACTIVITY
   * ========================================================= */
  async function loadRecentActivity() {
    const activityCard = $('.columns .card:last-child');
    if (!activityCard) return;

    // Bersihkan baris .activity lama (placeholder)
    $$('.activity', activityCard).forEach(el => el.remove());

    const listWrap = activityCard;

    if (!state.company?.id) {
      appendEmptyActivity(listWrap, 'No company linked to your account.');
      return;
    }

    // Ambil production_activities yang terkait dengan production_orders milik company
    // Pakai inner join via .select dengan filter foreign table.
    const { data, error } = await db
      .from('production_activities')
      .select(`
        id, action, created_at, payload_json,
        production_orders!inner(company_id, code, product)
      `)
      .eq('production_orders.company_id', state.company.id)
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) {
      console.error('[Dashboard] activities:', error);
      appendEmptyActivity(listWrap, 'Unable to load activity.');
      return;
    }

    if (!data?.length) {
      appendEmptyActivity(listWrap, 'No activity yet. Start a production order.');
      return;
    }

    data.forEach(act => {
      const row = document.createElement('div');
      row.className = 'activity';
      const po = act.production_orders || {};
      const label = formatActivityLabel(act.action);
      const detail = po.product || po.code || 'production order';
      row.innerHTML = `
        <span class="dot"></span>
        <div>
          <strong>${escapeHTML(label)}</strong>
          <small>${escapeHTML(detail)} · ${escapeHTML(relativeTime(act.created_at))}</small>
        </div>
      `;
      listWrap.appendChild(row);
    });

    // Perbaiki link "View all ↗" di header activity card
    const viewAllLink = $('.section-head a', activityCard);
    if (viewAllLink && viewAllLink.getAttribute('href') === '#') {
      viewAllLink.setAttribute('href', 'transactions.html');
    }
  }

  function appendEmptyActivity(card, message) {
    const row = document.createElement('div');
    row.className = 'activity';
    row.innerHTML = `
      <span class="dot" style="background:#3a4a3b"></span>
      <div><strong style="opacity:.6">${escapeHTML(message)}</strong></div>
    `;
    card.appendChild(row);

    const viewAllLink = $('.section-head a', card);
    if (viewAllLink && viewAllLink.getAttribute('href') === '#') {
      viewAllLink.setAttribute('href', 'transactions.html');
    }
  }

  function formatActivityLabel(action) {
    const map = {
      work_item_assigned: 'Work item assigned',
      work_item_submitted: 'Work submitted',
      work_item_handover: 'Work handover',
      work_item_handover_remaining: 'Handover (remaining)',
      work_item_submitted_partial: 'Partial submission',
      production_order_created: 'Production order created',
      ready_to_ship: 'Marked ready to ship',
      pending_production_reported: 'Pending production reported',
      pending_production_resolved: 'Pending production resolved'
    };
    return map[action] || action || 'Activity';
  }

  /* =========================================================
   * RECENT TRANSACTIONS
   * ========================================================= */
  async function loadRecentTransactions() {
    const tbody = $('.wallet-table tbody');
    if (!tbody) return;

    if (!state.company?.id) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:25px 5px">
          No company linked. Transactions will appear once you join or create a company.
        </td></tr>
      `;
      return;
    }

    const companyId = state.company.id;

    // Karena RLS di transactions memungkinkan select jika user member initiator
    // ATAU counterparty, kita query dua arah dan gabung di client.
    const [outRes, inRes] = await Promise.all([
      db.from('transactions')
        .select('id,type,amount,status,created_at,initiator_company_id,counterparty_company_id')
        .eq('initiator_company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5),
      db.from('transactions')
        .select('id,type,amount,status,created_at,initiator_company_id,counterparty_company_id')
        .eq('counterparty_company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    if (outRes.error) console.error('[Dashboard] tx out:', outRes.error);
    if (inRes.error)  console.error('[Dashboard] tx in:', inRes.error);

    // Gabung & dedupe by id
    const seen = new Set();
    const merged = [];
    [...(outRes.data || []), ...(inRes.data || [])].forEach(tx => {
      if (seen.has(tx.id)) return;
      seen.add(tx.id);
      merged.push(tx);
    });
    merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const top = merged.slice(0, 5);

    if (!top.length) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:25px 5px">
          No transactions available yet.
        </td></tr>
      `;
      return;
    }

    tbody.innerHTML = top.map(tx => {
      const isIncoming = tx.counterparty_company_id === companyId;
      const amountClass = isIncoming ? 'amount-in' : 'amount-out';
      const sign = isIncoming ? '+' : '−';
      const statusClass = tx.status === 'completed' ? '' : 'style="color:#f1b96d"';
      return `
        <tr>
          <td>${escapeHTML(tx.type || '—')}</td>
          <td>${escapeHTML(fmtDate(tx.created_at))}</td>
          <td style="font-family:var(--mono);font-size:9px;">${escapeHTML(tx.id.slice(0, 8))}</td>
          <td class="${amountClass}">${sign} ${escapeHTML(fmtIDR(tx.amount))}</td>
          <td ${statusClass}>${escapeHTML(String(tx.status || '').toUpperCase())}</td>
        </tr>
      `;
    }).join('');

    // Perbaiki link "Open wallet ↗" yang punya href "#/wallet.html"
    const openWallet = $('.section-head a', tbody.closest('section'));
    if (openWallet) {
      const href = openWallet.getAttribute('href') || '';
      if (href.includes('#/') || href === '#') {
        openWallet.setAttribute('href', 'wallet.html');
      }
    }

    // Update demo note
    const demo = $('.demo', tbody.closest('section'));
    if (demo) {
      demo.textContent = 'TRANSACTION CENTER / LIVE DATA';
      demo.style.color = 'var(--lime)';
    }
  }

  /* =========================================================
   * LINK FIXES (bug HTML)
   * ========================================================= */
  function fixBrokenLinks() {
    // 1) Section Wallet: class & id berisi "/wallet.html"
    const walletSection = $('section[class="/wallet.html"], section[id="/wallet.html"]');
    if (walletSection) {
      walletSection.classList.remove('/wallet.html');
      walletSection.classList.add('wallet');
      walletSection.removeAttribute('id');
    }

    // 2) Section Transactions: id "/transactions.html"
    const txSection = $('section.card[id="/transactions.html"]');
    if (txSection) {
      txSection.removeAttribute('id');
    }

    // 3) Wallet action buttons — ganti onclick ke arah nyata
    //    (deposit/withdraw masih placeholder, jadi biarkan alert)
    //    Tidak diubah supaya tidak mengklaim transaksi nyata.

    // 4) Link "#/wallet.html" → "wallet.html"
    $$('a[href="#/wallet.html"]').forEach(a => a.setAttribute('href', 'wallet.html'));

    // 5) Quick access "My Equipment" href="#"
    const quickLinks = $$('.quick');
    quickLinks.forEach(a => {
      const label = ($('strong', a)?.textContent || '').trim();
      if (/my equipment/i.test(label) && a.getAttribute('href') === '#') {
        a.setAttribute('href', 'equipment.html');
      }
    });

    // 6) Section-head "View all ↗" dengan href="#"
    //    Kita biarkan default → akan ditangani loadRecentActivity juga.
  }

  /* =========================================================
   * AUTH + COMPANY
   * ========================================================= */
  async function loadSessionAndCompany() {
    const session = await Auth.getSession();
    if (!session?.user) {
      window.location.replace('login.html');
      return false;
    }
    state.user = session.user;

    try {
      state.profile = await Auth.getProfile(session.user.id);
    } catch (err) {
      console.warn('[Dashboard] getProfile:', err);
      state.profile = null;
    }

    await loadCompany();
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

      if (error) console.warn('[Dashboard] company lookup:', error.message);

      if (data) {
        state.company = data;
        const { data: member, error: mErr } = await db
          .from('company_members')
          .select('member_role')
          .eq('company_id', data.id)
          .eq('user_id', state.user.id)
          .maybeSingle();
        if (mErr) console.warn('[Dashboard] membership lookup:', mErr.message);
        state.membership = member || null;
        return;
      }
    }

    // Fallback: membership terbaru
    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,member_role,joined_at')
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[Dashboard] membership fallback:', error.message);
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

    if (cErr) console.warn('[Dashboard] company from fallback:', cErr.message);
    state.company = company || null;
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    try {
      fixBrokenLinks();

      const ok = await loadSessionAndCompany();
      if (!ok) return;

      renderUserMini();

      await Promise.all([
        loadStats(),
        loadWallet(),
        loadProjectOverview(),
        loadRecentActivity(),
        loadRecentTransactions()
      ]);

      console.info('[Dashboard] Loaded successfully.');
    } catch (err) {
      console.error('[Dashboard] Initialization failed:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
