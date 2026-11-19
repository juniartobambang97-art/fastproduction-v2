(() => {
  if (window.__FP_MUSIC_INITIALIZED__) return;
  window.__FP_MUSIC_INITIALIZED__ = true;

  const script = document.currentScript;
  const audioURL = new URL(
    "../audio/Before_the_Journey_Starts.mp3",
    script.src
  ).href;

  const audio = document.createElement("audio");
  audio.id = "fp-background-music";
  audio.src = audioURL;
  audio.loop = true;
  audio.preload = "metadata";

  let savedVolume = 0.35;

  try {
    const stored = localStorage.getItem("fp_music_volume");
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) {
        savedVolume = Math.min(1, Math.max(0, parsed));
      }
    }
  } catch (error) {
    console.warn("[FP Music] Penyimpanan volume tidak tersedia.");
  }

  audio.volume = savedVolume;

  const control = document.createElement("div");
  control.id = "fp-music-control";
  control.style.cssText = "display:flex;align-items:center;gap:5px;margin-left:8px;position:relative;";

  const settings = document.createElement("div");
  settings.id = "fp-music-settings";
  settings.style.cssText = "display:none;position:absolute;top:44px;right:0;z-index:100001;align-items:center;gap:8px;padding:9px 11px;border:1px solid #303a31;border-radius:9px;background:#19211c;color:#c6f36a;font:10px 'DM Mono',monospace;box-shadow:0 5px 20px rgba(0,0,0,.3);";

  const toggle = document.createElement("button");
  toggle.id = "fp-music-toggle";
  toggle.type = "button";
  toggle.textContent = "▶";
  toggle.setAttribute("aria-label", "Play music");
  toggle.setAttribute("aria-pressed", "false");

  Object.assign(toggle.style, {
    background: "none",
    border: "0",
    color: "#c6f36a",
    fontSize: "17px",
    cursor: "pointer",
    color: "#c6f36a",
    border: "1px solid #303a31",
    borderRadius: "7px",
    width: "38px",
    height: "38px",
    background: "#121714"
  });

  const label = document.createElement("span");
  label.id = "fp-music-label";
  label.textContent = "MUSIC OFF";

  const volume = document.createElement("input");
  volume.id = "fp-music-volume";
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.05";
  volume.value = String(savedVolume);
  volume.setAttribute("aria-label", "Music volume");

  Object.assign(volume.style, {
    width: "65px",
    accentColor: "#c6f36a",
    cursor: "pointer"
  });

  toggle.addEventListener("click", async () => {
    if (audio.paused) {
      try {
        await audio.play();
        toggle.textContent = "Ⅱ";
        toggle.setAttribute("aria-label", "Pause music");
        toggle.setAttribute("aria-pressed", "true");
        label.textContent = "MUSIC ON";
      } catch (error) {
        label.textContent = "PLAY FAILED";
        console.error("[FP Music] Playback gagal:", error);
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("pause", () => {
    toggle.textContent = "▶";
    toggle.setAttribute("aria-label", "Play music");
    toggle.setAttribute("aria-pressed", "false");
    label.textContent = "MUSIC OFF";
  });

  audio.addEventListener("play", () => {
    toggle.textContent = "Ⅱ";
    toggle.setAttribute("aria-label", "Pause music");
    toggle.setAttribute("aria-pressed", "true");
    label.textContent = "MUSIC ON";
  });

  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);

    try {
      localStorage.setItem("fp_music_volume", volume.value);
    } catch (error) {
      console.warn("[FP Music] Volume tidak dapat disimpan.");
    }
  });

  audio.addEventListener("error", () => {
    label.textContent = "AUDIO ERROR";
    console.error("[FP Music] File audio gagal dimuat:", audioURL);
  });

  const volumeLabel = document.createElement("span");
  volumeLabel.textContent = "VOL";
  volumeLabel.style.cssText = "color:#89958c;";

  settings.append(label, volumeLabel, volume);
  control.append(toggle, settings);
  document.body.append(audio);

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    settings.style.display = settings.style.display === "flex" ? "none" : "flex";
  });

  settings.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", () => {
    settings.style.display = "none";
  });

  window.FPMusic = {
    mount(target) {
      if (target && !target.contains(control)) target.appendChild(control);
    }
  };

  const existingNav = document.getElementById("fp-menu-button");
  if (existingNav?.parentElement) window.FPMusic.mount(existingNav.parentElement);

  console.info("[FP Music] Global music controller aktif.");
})();
