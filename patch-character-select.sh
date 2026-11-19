#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

PROJECT="$HOME/fastproduction-v2"
cd "$PROJECT" || exit 1

echo "=== FASTPRODUCTION V2 / CHARACTER SELECT ==="

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP=".backup-character-select-$STAMP"
mkdir -p "$BACKUP"

FILES=(
  "pages/login.html"
  "assets/css/character-select.css"
  "assets/js/character-select.js"
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    mkdir -p "$BACKUP/$(dirname "$f")"
    cp -p "$f" "$BACKUP/$f"
  fi
done

rollback() {
  echo
  echo "PATCH GAGAL. Memulihkan file sebelumnya..."
  for f in "${FILES[@]}"; do
    if [ -f "$BACKUP/$f" ]; then
      cp -p "$BACKUP/$f" "$f"
    elif [ "$f" != "pages/login.html" ]; then
      rm -f "$f"
    fi
  done
  echo "Backup tersedia: $BACKUP"
}
trap rollback ERR

echo "[1/5] Memeriksa aset dan struktur..."

test -f pages/login.html
test -f assets/js/supabase.js
test -f assets/images/characters/character-spritesheet.jpeg

python3 - <<'PY'
import re
from pathlib import Path

p = Path("pages/login.html")
s = p.read_text(encoding="utf-8")

if 'id="character-select"' not in s:
    raise SystemExit("GAGAL: #character-select tidak ditemukan.")

if not re.search(r'function\s+showCharacter\s*\(\s*user\s*\)', s):
    raise SystemExit("GAGAL: fungsi showCharacter(user) tidak ditemukan.")

if 'id="btnEnterWorld"' not in s:
    raise SystemExit("GAGAL: #btnEnterWorld tidak ditemukan.")

print("Struktur login teridentifikasi.")
PY

echo "[2/5] Membuat CSS..."

mkdir -p assets/css assets/js

cat > assets/css/character-select.css <<'CSS'
#fpCharGridHost {
  width: min(640px, 100%);
  margin: 16px auto;
  padding: 12px;
  box-sizing: border-box;
}

.fp-char-heading {
  text-align: center;
  margin-bottom: 14px;
}

.fp-char-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.fp-char-tile {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  aspect-ratio: 1.489;
  padding: 0;
  border: 2px solid rgba(255,255,255,.2);
  border-radius: 9px;
  overflow: hidden;
  cursor: pointer;
  background-color: #252525;
  background-image: url("/assets/images/characters/character-spritesheet.jpeg");
  background-size: 500% 600%;
  background-position:
    calc(var(--c) * 25%)
    calc(var(--r) * 20%);
}

.fp-char-tile.is-selected {
  border-color: var(--fp-accent, #ff3d6e);
  box-shadow: 0 0 0 2px var(--fp-accent, #ff3d6e);
}

.fp-char-tile.is-selected::after {
  content: "✓";
  position: absolute;
  top: 3px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: white;
  background: var(--fp-accent, #ff3d6e);
  font-weight: bold;
}

.fp-char-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px 0;
}

.fp-char-preview[hidden] {
  display: none;
}

.fp-char-preview .sprite {
  flex: 0 0 120px;
  width: 120px;
  aspect-ratio: 1.489;
  border-radius: 10px;
  background-image: url("/assets/images/characters/character-spritesheet.jpeg");
  background-size: 500% 600%;
  background-position:
    calc(var(--c) * 25%)
    calc(var(--r) * 20%);
}

.fp-char-preview .meta strong,
.fp-char-preview .meta span {
  display: block;
}

.fp-char-preview .meta span {
  opacity: .7;
  font-size: .85em;
}

#fpCharConfirm {
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  color: white;
  background: var(--fp-accent, #ff3d6e);
  font-weight: bold;
}

#fpCharConfirm:disabled {
  opacity: .5;
  cursor: not-allowed;
}

#fpCharStatus {
  min-height: 1.4em;
  margin: 8px 0;
  text-align: center;
  font-size: .85em;
}

#fpCharStatus.err { color: #ff7777; }
#fpCharStatus.ok { color: #62e99a; }

@media (max-width: 720px) {
  .fp-char-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 420px) {
  .fp-char-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
CSS

echo "[3/5] Membuat JavaScript..."

cat > assets/js/character-select.js <<'JS'
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
JS

echo "[4/5] Mengintegrasikan login.html..."

python3 - <<'PY'
import re
from pathlib import Path

p = Path("pages/login.html")
s = p.read_text(encoding="utf-8")

if 'character-select.css' not in s:
    link = '<link rel="stylesheet" href="../assets/css/character-select.css">'
    if not re.search(r'</head\s*>', s, re.I):
        raise SystemExit("Tidak ditemukan penutup head.")
    s = re.sub(r'</head\s*>', link + '\n</head>', s, count=1, flags=re.I)

if 'character-select.js' not in s:
    script = '<script src="../assets/js/character-select.js"></script>'
    music = re.search(
        r'<script\b[^>]*src=["\'][^"\']*music\.js["\'][^>]*>\s*</script>',
        s, re.I
    )
    if music:
        pos = music.end()
        s = s[:pos] + '\n' + script + s[pos:]
    elif re.search(r'</body\s*>', s, re.I):
        s = re.sub(r'</body\s*>', script + '\n</body>', s,
                   count=1, flags=re.I)
    else:
        raise SystemExit("Tidak ditemukan lokasi untuk script.")

if 'FPCharacterSelect.open(user)' not in s:
    match = re.search(
        r'function\s+showCharacter\s*\(\s*user\s*\)\s*\{', s
    )
    if not match:
        raise SystemExit("showCharacter(user) tidak ditemukan.")

    insertion = (
        '\n    if (window.FPCharacterSelect) '
        'window.FPCharacterSelect.open(user);\n'
    )
    pos = match.end()
    s = s[:pos] + insertion + s[pos:]

p.write_text(s, encoding="utf-8")
print("Integrasi login berhasil.")
PY

echo "[5/5] Validasi..."

node --check assets/js/character-select.js

python3 - <<'PY'
import re
from pathlib import Path

s = Path("pages/login.html").read_text(encoding="utf-8")

for item in (
    "character-select.css",
    "character-select.js",
    "FPCharacterSelect.open(user)",
    'id="character-select"',
    'id="btnEnterWorld"'
):
    if item not in s:
        raise SystemExit("Validasi gagal: " + item)

ids = re.findall(r'\bid=["\']([^"\']+)["\']', s)
duplicates = sorted({x for x in ids if ids.count(x) > 1})

if duplicates:
    raise SystemExit("ID duplikat: " + ", ".join(duplicates))

print("HTML integration: PASS")
print("Duplicate IDs: NONE")
PY

git diff --check

echo
echo "======================================"
echo " CHARACTER SELECT PATCH SUCCESS"
echo "======================================"
echo "CSS: assets/css/character-select.css"
echo "JS : assets/js/character-select.js"
echo "HTML: pages/login.html"
echo "Backup: $BACKUP"
echo
echo "Patch selesai. Silakan uji login."
trap - ERR
