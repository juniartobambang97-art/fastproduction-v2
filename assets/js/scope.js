(function () {
  'use strict';

  /* =========================================================
   * DEPENDENCIES
   * ========================================================= */
  const db = window.fpSupabase;
  const Auth = window.FPAuth;

  if (!db || !Auth) {
    console.error('[Scope] Supabase atau FPAuth belum tersedia.');
    return;
  }

  /* =========================================================
   * HELPERS
   * ========================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
  }

  function fmtIDR(n) {
    return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch { return '—'; }
  }

  function notify(msg, isError = false) {
    let toast = $('#scope-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'scope-toast';
      toast.style.cssText = `
        position:fixed;bottom:25px;left:50%;transform:translateX(-50%);
        z-index:99999;padding:13px 20px;border-radius:12px;
        background:#171c24;color:#fff;border:1px solid #c5f36b;
        font-size:13px;max-width:90%;box-shadow:0 8px 24px rgba(0,0,0,.5);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.borderColor = isError ? '#f87171' : '#c5f36b';
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  /* =========================================================
   * STATE
   * ========================================================= */
  const state = {
    user: null,
    profile: null,
    company: null,
    membership: null,
    scopes: [],          // scopes (public open + my company)
    myScopeIds: new Set(), // scope ids owned by my company
    applications: [],    // applications for my scopes
    rooms: [],           // deal rooms I'm participant of
    currentRoom: null,
    currentRoomMessages: [],
    currentRoomPaymentRequests: []
  };

  /* =========================================================
   * DOM CACHE
   * ========================================================= */
  const dom = {};

  function cacheDom() {
    dom.scopeList       = $('#scopeList');
    dom.applicationList = $('#applicationList');
    dom.roomList        = $('#roomList');
    dom.scopeForm       = $('#scopeForm');
    dom.applyForm       = $('#applyForm');
    dom.roomContent     = $('#roomContent');
    dom.roomTitle       = $('#roomTitle');
    dom.detailTitle     = $('#detailTitle');
    dom.detailBody      = $('#detailBody');
    dom.search          = $('#search');
    dom.category        = $('#category');
    dom.statusFilter    = $('#statusFilter');
    dom.totalScopes     = $('#totalScopes');
    dom.totalApps       = $('#totalApps');
    dom.totalRooms      = $('#totalRooms');
    dom.appCount        = $('#appCount');
    dom.views           = $$('.view');
    dom.tabs            = $$('.tab');
  }

  /* =========================================================
   * NAVIGATION (view switching — keeps existing onclick="show()")
   * ========================================================= */
  // Deklarasikan show()/modal()/closeModal() ke window karena HTML memanggil via onclick=
  window.show = function (view) {
    dom.views.forEach(x => x.classList.toggle('active', x.id === view));
    dom.tabs.forEach(x => x.classList.toggle('active', x.dataset.view === view));
    if (view === 'applications') renderApplications();
    if (view === 'rooms') renderRooms();
    if (view === 'explore') renderScopes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.modal = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  };

  window.closeModal = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  };

  /* =========================================================
   * LOAD SESSION + COMPANY
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
        console.warn('[Scope] getProfile failed:', err.message);
        state.profile = null;
      }

      await loadCompany();
      return true;
    } catch (err) {
      console.error('[Scope] session error:', err);
      notify('Unable to verify session.', true);
      return false;
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

      if (error) console.warn('[Scope] company lookup:', error.message);

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

    const { data: memberships, error } = await db
      .from('company_members')
      .select('company_id,member_role,joined_at')
      .eq('user_id', state.user.id)
      .order('joined_at', { ascending: false })
      .limit(1);

    if (error) { console.warn('[Scope] membership:', error.message); return; }
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
   * DATA LOADERS
   * ========================================================= */
  async function loadScopes() {
    // Ambil scope: (a) status open (publik) atau (b) milik company user
    // RLS `scopes_read` sudah mengizinkan keduanya — tidak perlu query ganda.
    const { data, error } = await db
      .from('scopes')
      .select('id,client_company_id,title,category,details,brand,qty,material,location,capacity,status,created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[Scope] load scopes:', error);
      notify('Failed to load scopes: ' + error.message, true);
      state.scopes = [];
      state.myScopeIds = new Set();
      return;
    }

    state.scopes = data || [];
    state.myScopeIds = new Set(
      state.scopes
        .filter(s => s.client_company_id === state.company?.id)
        .map(s => s.id)
    );
  }

  async function loadApplications() {
    if (!state.company?.id || !state.myScopeIds.size) {
      state.applications = [];
      return;
    }

    const scopeIds = [...state.myScopeIds];

    const { data, error } = await db
      .from('scope_applications')
      .select(`
        id, scope_id, partner_company_id, status, cover_letter, created_at,
        companies:partner_company_id ( id, name, type )
      `)
      .in('scope_id', scopeIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Scope] load applications:', error);
      state.applications = [];
      return;
    }
    state.applications = data || [];
  }

  async function loadRooms() {
    if (!state.company?.id) { state.rooms = []; return; }

    const { data, error } = await db
      .from('deal_rooms')
      .select(`
        id, scope_id, application_id, title, status, agreed_amount,
        client_company_id, partner_company_id, created_at,
        client:client_company_id ( id, name ),
        partner:partner_company_id ( id, name )
      `)
      .or(`client_company_id.eq.${state.company.id},partner_company_id.eq.${state.company.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Scope] load rooms:', error);
      state.rooms = [];
      return;
    }
    state.rooms = data || [];
  }

  async function loadRoomDetail(roomId) {
    // Fetch messages
    const { data: messages, error: mErr } = await db
      .from('deal_room_messages')
      .select('id,sender_id,type,body,created_at,profiles:sender_id ( id, full_name )')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (mErr) console.error('[Scope] room messages:', mErr);

    // Fetch payment requests
    const { data: payments, error: pErr } = await db
      .from('payment_requests')
      .select('id,amount,payment_type,status,created_at,milestone_id')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (pErr) console.error('[Scope] room payments:', pErr);

    state.currentRoomMessages = messages || [];
    state.currentRoomPaymentRequests = payments || [];
  }

  /* =========================================================
   * RENDER: SCOPE CARDS
   * ========================================================= */
  function renderScopes() {
    if (!dom.scopeList) return;

    const kw = (dom.search?.value || '').toLowerCase();
    const cat = dom.category?.value || '';
    const stFilter = dom.statusFilter?.value || '';

    const filtered = state.scopes.filter(s => {
      const hay = [s.title, s.brand, s.location, s.details, s.category]
        .filter(Boolean).join(' ').toLowerCase();
      if (kw && !hay.includes(kw)) return false;
      if (cat && s.category !== cat) return false;
      if (stFilter === 'open' && s.status !== 'open') return false;
      if (stFilter === 'selected' && s.status !== 'partner_selected') return false;
      return true;
    });

    if (dom.totalScopes) dom.totalScopes.textContent = state.scopes.length;
    if (dom.totalApps)   dom.totalApps.textContent = state.applications.length;
    if (dom.totalRooms)  dom.totalRooms.textContent = state.rooms.length;
    if (dom.appCount)    dom.appCount.textContent = state.applications.length ? ' · ' + state.applications.length : '';

    if (!filtered.length) {
      dom.scopeList.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          Belum ada Scope yang cocok. Buat Scope pertama atau ubah filter.
        </div>`;
      return;
    }

    dom.scopeList.innerHTML = filtered.map(s => {
      const isMine = state.myScopeIds.has(s.id);
      const statusLabel = s.status === 'partner_selected'
        ? 'PARTNER SELECTED'
        : (s.status || 'OPEN').toUpperCase();
      const appCount = state.applications.filter(a => a.scope_id === s.id).length;
      const detailShort = String(s.details || '').slice(0, 145);
      const more = String(s.details || '').length > 145 ? '…' : '';

      return `
        <article class="card">
          <span class="tag">${escapeHTML(s.category || 'Scope')} · ${escapeHTML(statusLabel)}${isMine ? ' · YOUR SCOPE' : ''}</span>
          <h3>${escapeHTML(s.title)}</h3>
          <p>${escapeHTML(detailShort)}${more}</p>
          <div class="meta">
            <div><small>QUANTITY</small><b>${Number(s.qty || 0).toLocaleString('id-ID')} pcs</b></div>
            <div><small>LOCATION</small><b>${escapeHTML(s.location || 'Flexible')}</b></div>
            <div><small>BRAND / CLIENT</small><b>${escapeHTML(s.brand || '—')}</b></div>
            <div><small>CAPACITY</small><b>${escapeHTML(s.capacity || '—')}</b></div>
          </div>
          <div class="card-foot">
            <span class="mono">${isMine ? appCount + ' APPLICATION(S)' : 'PUBLIC SCOPE'}</span>
            <button class="btn" data-action="detail" data-id="${escapeHTML(s.id)}">View Scope →</button>
          </div>
        </article>
      `;
    }).join('');
  }

  /* =========================================================
   * RENDER: DETAIL MODAL
   * ========================================================= */
  function openScopeDetail(scopeId) {
    const s = state.scopes.find(x => x.id === scopeId);
    if (!s) return;

    const isMine = state.myScopeIds.has(s.id);
    const isOpen = s.status === 'open';
    const related = state.applications.filter(a => a.scope_id === s.id);

    if (dom.detailTitle) dom.detailTitle.textContent = s.title || 'Scope Detail';

    dom.detailBody.innerHTML = `
      <span class="tag">${escapeHTML(s.category || 'Scope')} · ${escapeHTML((s.status || 'OPEN').toUpperCase())}</span>
      <p class="sub">${escapeHTML(s.details || '')}</p>
      <div class="meta">
        <div><small>CLIENT / BRAND</small><b>${escapeHTML(s.brand || '—')}</b></div>
        <div><small>QUANTITY</small><b>${Number(s.qty || 0).toLocaleString('id-ID')} pcs</b></div>
        <div><small>LOCATION</small><b>${escapeHTML(s.location || 'Flexible')}</b></div>
        <div><small>CAPACITY</small><b>${escapeHTML(s.capacity || '—')}</b></div>
        <div><small>MATERIAL</small><b>${escapeHTML(s.material || 'Discuss together')}</b></div>
        <div><small>CREATED</small><b>${escapeHTML(fmtDate(s.created_at))}</b></div>
      </div>
      <div class="actions">
        ${!isMine && isOpen
          ? `<button class="btn primary" data-action="apply" data-id="${escapeHTML(s.id)}">Apply / Send Proposal</button>`
          : ''}
        ${isMine
          ? `<button class="btn" data-action="view-apps" data-id="${escapeHTML(s.id)}">View applications (${related.length})</button>`
          : ''}
        ${!isMine && !isOpen
          ? `<span class="mono" style="color:var(--muted)">Scope ini sudah memilih partner.</span>`
          : ''}
      </div>
    `;
    window.modal('detailModal');
  }

  /* =========================================================
   * RENDER: APPLICATIONS
   * ========================================================= */
  function renderApplications() {
    if (!dom.applicationList) return;

    if (!state.applications.length) {
      dom.applicationList.innerHTML = `
        <div class="empty">Belum ada lamaran. Konveksi yang melamar ke Scope milikmu akan muncul di sini.</div>`;
      return;
    }

    dom.applicationList.innerHTML = state.applications.map(a => {
      const scope = state.scopes.find(s => s.id === a.scope_id);
      const partnerName = a.companies?.name || 'Partner Company';
      const isPending = a.status === 'pending';
      const scopeAlreadySelected = scope?.status === 'partner_selected';

      return `
        <div class="item">
          <div class="item-head">
            <div>
              <span class="tag">${escapeHTML(a.status || 'pending')}</span>
              <h3>${escapeHTML(partnerName)}</h3>
              <p>For: ${escapeHTML(scope?.title || 'Scope unavailable')}</p>
            </div>
            <b>${escapeHTML(fmtDate(a.created_at))}</b>
          </div>
          <p>${escapeHTML(a.cover_letter || '(no message)')}</p>
          ${isPending && scope && !scopeAlreadySelected
            ? `<button class="btn primary" data-action="accept" data-app-id="${escapeHTML(a.id)}" data-scope-id="${escapeHTML(a.scope_id)}">Select this manufacturer</button>`
            : ''}
          ${a.status === 'accepted' && scope?.status === 'partner_selected'
            ? `<button class="btn" data-action="open-room-by-scope" data-scope-id="${escapeHTML(scope.id)}">Open Cooperation Room</button>`
            : ''}
        </div>
      `;
    }).join('');
  }

  /* =========================================================
   * RENDER: ROOMS
   * ========================================================= */
  function renderRooms() {
    if (!dom.roomList) return;

    if (!state.rooms.length) {
      dom.roomList.innerHTML = `
        <div class="empty">Belum ada kerja sama aktif. Pilih salah satu lamaran untuk membuka ruang kerja sama.</div>`;
      return;
    }

    dom.roomList.innerHTML = state.rooms.map(r => `
      <div class="panel">
        <div class="item-head">
          <div>
            <span class="tag">${escapeHTML(r.status || 'discussion')}</span>
            <h2>${escapeHTML(r.title || 'Cooperation Room')}</h2>
            <p class="sub">${escapeHTML(r.client?.name || 'Client')} ↔ ${escapeHTML(r.partner?.name || 'Partner')}</p>
          </div>
          <button class="btn primary" data-action="open-room" data-id="${escapeHTML(r.id)}">Enter Room →</button>
        </div>
      </div>
    `).join('');
  }

  /* =========================================================
   * RENDER: ROOM MODAL
   * ========================================================= */
  async function openRoom(roomId) {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) { notify('Room not found.', true); return; }

    state.currentRoom = room;
    await loadRoomDetail(roomId);

    if (dom.roomTitle) dom.roomTitle.textContent = room.title || 'Cooperation Room';

    const messagesHtml = state.currentRoomMessages.length
      ? state.currentRoomMessages.map(m => {
          const senderName = m.profiles?.full_name || (m.type === 'system' ? 'System' : 'User');
          return `
            <div class="note">
              <small>${escapeHTML(senderName)} · ${escapeHTML(new Date(m.created_at).toLocaleString('id-ID'))}</small>
              <p>${escapeHTML(m.body)}</p>
            </div>`;
        }).join('')
      : `<div class="note"><small>SYSTEM</small><p>Belum ada pesan. Mulai diskusi dengan mengirim pesan pertama.</p></div>`;

    const paymentsHtml = state.currentRoomPaymentRequests.length
      ? state.currentRoomPaymentRequests.map(p => `
          <div class="note">
            <small>PAYMENT REQUEST · ${escapeHTML((p.status || '').toUpperCase())}</small>
            <p>${escapeHTML(p.payment_type || 'Termin')} · ${escapeHTML(fmtIDR(p.amount))}</p>
          </div>`).join('')
      : `<div class="note"><small>PAYMENT REQUEST</small><p>Belum ada pengajuan pembayaran untuk room ini.</p></div>`;

    dom.roomContent.innerHTML = `
      <div class="roomgrid">
        <div>
          <h3>Discussion & Handover</h3>
          <div id="messages" style="max-height:340px;overflow:auto;margin-bottom:10px;">${messagesHtml}</div>
          <form id="messageForm">
            <div class="field">
              <label>Write a message / update</label>
              <textarea name="text" required placeholder="Diskusikan detail produksi, revisi, atau update progres..."></textarea>
            </div>
            <button class="btn primary" style="margin-top:10px" type="submit">Send message</button>
          </form>
        </div>
        <div>
          <h3>Cooperation Status</h3>
          <p class="sub">Status hanya berubah berdasarkan kesepakatan kedua pihak.</p>
          <select id="roomStatus">
            <option value="discussion">Discussion</option>
            <option value="revised">Revised</option>
            <option value="agreed">Agreed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button class="btn" style="margin-top:9px;width:100%" data-action="update-room-status" type="button">Update status</button>

          <div class="note">
            <small>PARTIES</small>
            <p>Client: ${escapeHTML(room.client?.name || '—')}<br>
               Manufacturer: ${escapeHTML(room.partner?.name || '—')}</p>
          </div>
          <div class="note">
            <small>PAYMENT</small>
            ${paymentsHtml}
            <form id="paymentForm" style="margin-top:10px">
              <input name="amount" type="number" min="1" placeholder="Nominal (Rp)" required style="margin-bottom:6px">
              <select name="type" style="margin-bottom:6px">
                <option value="DP 50%">DP 50%</option>
                <option value="Termin produksi">Termin produksi</option>
                <option value="Pelunasan">Pelunasan</option>
              </select>
              <button class="btn" type="submit" style="width:100%">Ajukan Payment Request</button>
            </form>
          </div>
        </div>
      </div>
    `;

    const statusSelect = document.getElementById('roomStatus');
    if (statusSelect) statusSelect.value = room.status || 'discussion';

    document.getElementById('messageForm').addEventListener('submit', handleSendMessage);
    document.getElementById('paymentForm').addEventListener('submit', handleCreatePaymentRequest);

    window.modal('roomModal');
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!state.currentRoom) return;
    const text = String(e.target.text.value || '').trim();
    if (!text) return;

    const { error } = await db.rpc('rpc_add_room_message', {
      p_room_id: state.currentRoom.id,
      p_body: text,
      p_type: 'text'
    });

    if (error) {
      console.error('[Scope] rpc_add_room_message:', error);
      notify('Failed to send: ' + error.message, true);
      return;
    }
    e.target.reset();
    await loadRoomDetail(state.currentRoom.id);
    await openRoom(state.currentRoom.id); // re-render
  }

  async function handleCreatePaymentRequest(e) {
    e.preventDefault();
    if (!state.currentRoom) return;
    const amount = Number(e.target.amount.value || 0);
    const type = e.target.type.value;

    if (!amount || amount <= 0) { notify('Invalid amount.', true); return; }

    const { error } = await db.rpc('rpc_create_payment_request', {
      p_room_id: state.currentRoom.id,
      p_amount: amount,
      p_type: type,
      p_milestone_id: null
    });

    if (error) {
      console.error('[Scope] rpc_create_payment_request:', error);
      notify('Failed to create payment request: ' + error.message, true);
      return;
    }
    notify('Payment request berhasil diajukan.');
    await loadRoomDetail(state.currentRoom.id);
    await openRoom(state.currentRoom.id);
  }

  /* =========================================================
   * ACTIONS
   * ========================================================= */
  async function handleAcceptApplication(appId, scopeId) {
    if (!confirm('Pilih manufacturer ini sebagai partner dan buka Cooperation Room?')) return;

    const { data, error } = await db.rpc('rpc_open_deal_room', {
      p_scope_id: scopeId,
      p_application_id: appId
    });

    if (error) {
      console.error('[Scope] rpc_open_deal_room:', error);
      notify('Failed to open room: ' + error.message, true);
      return;
    }

    notify('Cooperation Room berhasil dibuat.');
    await Promise.all([loadScopes(), loadApplications(), loadRooms()]);
    renderScopes(); renderApplications(); renderRooms();
    window.show('rooms');
    if (data) openRoom(data);
  }

  async function handleUpdateRoomStatus() {
    if (!state.currentRoom) return;
    const newStatus = document.getElementById('roomStatus')?.value;
    if (!newStatus) return;

    const { error } = await db
      .from('deal_rooms')
      .update({ status: newStatus })
      .eq('id', state.currentRoom.id);

    if (error) {
      console.error('[Scope] update room status:', error);
      notify('Failed to update status: ' + error.message, true);
      return;
    }
    notify('Status berhasil diperbarui.');
    await loadRooms();
    state.currentRoom = state.rooms.find(r => r.id === state.currentRoom.id) || state.currentRoom;
    renderRooms();
  }

  async function handleApply(scopeId) {
    window.closeModal('detailModal');
    document.querySelector('#applyForm [name=scopeId]').value = scopeId;
    window.modal('applyModal');
  }

  async function handleCreateScope(e) {
    e.preventDefault();
    if (!state.company?.id) {
      notify('Kamu belum terhubung dengan company. Tidak bisa publish scope.', true);
      return;
    }

    const form = new FormData(e.target);
    const payload = {
      client_company_id: state.company.id,
      title: String(form.get('title') || '').trim(),
      brand: String(form.get('brand') || '').trim(),
      category: String(form.get('category') || '').trim(),
      qty: Number(form.get('qty') || 0),
      location: String(form.get('location') || '').trim() || null,
      material: String(form.get('material') || '').trim() || null,
      details: String(form.get('details') || '').trim(),
      status: 'open'
    };

    if (!payload.title || !payload.brand || !payload.qty || !payload.details) {
      notify('Lengkapi semua field wajib.', true);
      return;
    }

    const { data, error } = await db
      .from('scopes')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error('[Scope] create scope:', error);
      notify('Failed to publish scope: ' + error.message, true);
      return;
    }

    notify('Scope berhasil dipublikasikan.');
    e.target.reset();
    await loadScopes();
    renderScopes();
    window.show('explore');
    void data;
  }

  async function handleApplySubmit(e) {
    e.preventDefault();
    if (!state.company?.id) {
      notify('Kamu belum terhubung dengan company.', true);
      return;
    }

    const form = new FormData(e.target);
    const scopeId = form.get('scopeId');
    const coverLetter = String(form.get('message') || '').trim();
    if (!scopeId || !coverLetter) {
      notify('Pesan wajib diisi.', true);
      return;
    }

    const { error } = await db
      .from('scope_applications')
      .insert({
        scope_id: scopeId,
        partner_company_id: state.company.id,
        status: 'pending',
        cover_letter: coverLetter
      });

    if (error) {
      console.error('[Scope] apply:', error);
      notify('Failed to apply: ' + error.message, true);
      return;
    }

    notify('Application berhasil dikirim.');
    e.target.reset();
    window.closeModal('applyModal');
    await Promise.all([loadScopes(), loadApplications()]);
    renderScopes();
  }

  /* =========================================================
   * EVENT DELEGATION
   * ========================================================= */
  function bindEvents() {
    // Explore filter
    dom.search?.addEventListener('input', renderScopes);
    dom.category?.addEventListener('change', renderScopes);
    dom.statusFilter?.addEventListener('change', renderScopes);

    // Create scope form
    dom.scopeForm?.addEventListener('submit', handleCreateScope);

    // Apply form
    dom.applyForm?.addEventListener('submit', handleApplySubmit);

    // Detail modal delegation
    dom.detailBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'apply') handleApply(id);
      if (action === 'view-apps') {
        window.closeModal('detailModal');
        window.show('applications');
      }
    });

    // Scope list delegation
    dom.scopeList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="detail"]');
      if (!btn) return;
      openScopeDetail(btn.dataset.id);
    });

    // Application list delegation
    dom.applicationList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'accept') {
        handleAcceptApplication(btn.dataset.appId, btn.dataset.scopeId);
      }
      if (action === 'open-room-by-scope') {
        const room = state.rooms.find(r => r.scope_id === btn.dataset.scopeId);
        if (room) openRoom(room.id);
        else notify('Room belum tersedia. Coba refresh.', true);
      }
    });

    // Room list delegation
    dom.roomList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="open-room"]');
      if (!btn) return;
      openRoom(btn.dataset.id);
    });

    // Room modal delegation
    dom.roomContent?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="update-room-status"]');
      if (btn) handleUpdateRoomStatus();
    });

    // Close modal backdrop click
    $$('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('open');
      });
    });
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  async function init() {
    cacheDom();
    const ok = await loadSession();
    if (!ok) return;

    await loadScopes();
    await loadApplications();
    await loadRooms();

    renderScopes();
    renderApplications();
    renderRooms();
    bindEvents();

    console.info('[Scope] Ready. company=', state.company?.name || '(none)');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
