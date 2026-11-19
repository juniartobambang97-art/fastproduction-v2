(function () {
  "use strict";

  if (window.FPCharacterSelect) return;

  const COLS = 5;

  const names = [
    "Factory Worker", "Fashion Designer",
    "Sewing Machine Operator", "Factory Manager",
    "Fashion Entrepreneur",
    "Tailor", "Fabric Supplier", "Warehouse Worker",
    "Sewing Machine Mechanic", "Delivery Driver",
    "Business Owner", "Creative Director",
    "Quality Controller", "Pattern Maker", "Sample Machinist",
    "Garment Worker", "Trims Buyer", "Logistic Manager",
    "Store Manager", "Fashion Stylist",
    "HR Manager", "Graphic Designer", "Merchandiser",
    "Cutter", "Presser",
    "Machinist", "Embroidery Expert", "Shoe Designer",
    "Supply Chain Officer", "Assistant Designer"
  ];

  const characters = names.map((name, i) => ({
    id: i + 1,
    name,
    row: Math.floor(i / COLS),
    col: i % COLS
  }));

  let selected = null;
  let currentUser = null;

  const byId = id => document.getElementById(id);

  function getSupabase() {
    return window.fpSupabase ||
      window.supabaseClient ||
      window.supabase ||
      null;
  }

  function setStatus(message, type) {
    const el = byId("fpCharStatus");
    if (!el) return;
    el.textContent = message;
    el.className = type || "";
  }

  function getHost() {
    let host = byId("fpCharGridHost");
    if (host) return host;

    const overlay = byId("character-select");
    if (!overlay) {
      throw new Error("Character overlay tidak ditemukan.");
    }

    host = document.createElement("section");
    host.id = "fpCharGridHost";

    const enter = byId("btnEnterWorld");

    if (enter && overlay.contains(enter)) {
      overlay.insertBefore(host, enter);
    } else {
      overlay.appendChild(host);
    }

    return host;
  }

  function selectCharacter(id) {
    const ch = characters.find(item => item.id === id);
    if (!ch) return;

    selected = ch.id;

    document.querySelectorAll(".fp-char-tile").forEach(tile => {
      tile.classList.toggle(
        "is-selected",
        Number(tile.dataset.id) === ch.id
      );
      tile.setAttribute(
        "aria-pressed",
        Number(tile.dataset.id) === ch.id ? "true" : "false"
      );
    });

    const sprite = byId("fpCharSprite");
    sprite.style.setProperty("--c", ch.col);
    sprite.style.setProperty("--r", ch.row);

    byId("fpCharName").textContent = ch.name;
    byId("fpCharPreview").hidden = false;
    byId("fpCharConfirm").disabled = false;

    setStatus("", "");
  }

  function buildUI() {
    const host = getHost();
    if (host.dataset.built === "true") return;

    host.innerHTML = `
      <div class="fp-char-heading">
        <h3>Choose Your Character</h3>
        <p>Select your identity in FastProduction</p>
      </div>
      <div class="fp-char-grid" id="fpCharGrid"
           role="group" aria-label="Character selection"></div>
      <div class="fp-char-preview" id="fpCharPreview" hidden>
        <div class="sprite" id="fpCharSprite"></div>
        <div class="meta">
          <strong id="fpCharName">—</strong>
          <span>YOUR CHARACTER</span>
        </div>
      </div>
      <div id="fpCharStatus" aria-live="polite"></div>
      <button type="button" id="fpCharConfirm" disabled>
        CONFIRM CHARACTER
      </button>
    `;

    const grid = byId("fpCharGrid");

    characters.forEach(ch => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "fp-char-tile";
      tile.dataset.id = ch.id;
      tile.setAttribute("aria-label", ch.name);
      tile.setAttribute("aria-pressed", "false");
      tile.style.setProperty("--c", ch.col);
      tile.style.setProperty("--r", ch.row);
      tile.addEventListener("click", () => selectCharacter(ch.id));
      grid.appendChild(tile);
    });

    byId("fpCharConfirm").addEventListener("click", saveCharacter);
    host.dataset.built = "true";
  }

  async function saveCharacter() {
    if (!selected || !currentUser) return;

    const ch = characters.find(item => item.id === selected);
    const sb = getSupabase();
    const button = byId("fpCharConfirm");

    if (!sb || !sb.auth || typeof sb.auth.updateUser !== "function") {
      setStatus("Supabase Auth belum siap.", "err");
      return;
    }

    button.disabled = true;
    setStatus("Saving character...", "");

    try {
      const metadata = {
        ...(currentUser.user_metadata || {}),
        character_id: ch.id,
        character_name: ch.name
      };

      const { data, error } = await sb.auth.updateUser({
        data: metadata
      });

      if (error) throw error;

      if (data && data.user) currentUser = data.user;

      sessionStorage.setItem(
        "fp_character",
        JSON.stringify(ch)
      );

      setStatus("Character saved successfully!", "ok");

      const enter = byId("btnEnterWorld");
      if (enter) enter.disabled = false;

    } catch (error) {
      console.error("[FPCharacterSelect]", error);
      setStatus("Gagal menyimpan: " + error.message, "err");
      button.disabled = false;
    }
  }

  function restore(user) {
    currentUser = user;

    const meta = (user && user.user_metadata) || {};
    let id = Number(meta.character_id) || null;

    if (!id) {
      try {
        const cached = JSON.parse(
          sessionStorage.getItem("fp_character") || "null"
        );
        id = cached && Number(cached.id);
      } catch (_) {}
    }

    const enter = byId("btnEnterWorld");

    if (id && characters.some(ch => ch.id === id)) {
      selectCharacter(id);

      if (Number(meta.character_id) === id) {
        setStatus("Character restored!", "ok");
      }

      if (enter) enter.disabled = false;
    } else {
      selected = null;
      if (enter) enter.disabled = true;
    }
  }

  window.FPCharacterSelect = {
    open(user) {
      buildUI();
      getHost().style.display = "";
      restore(user || null);
    },
    characters
  };
})();
