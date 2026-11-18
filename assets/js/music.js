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

  Object.assign(control.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "10000",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 13px",
    border: "1px solid #303a31",
    borderRadius: "12px",
    background: "rgba(25,30,26,.96)",
    color: "#c6f36a",
    font: "11px 'DM Mono',monospace",
    boxShadow: "0 5px 20px rgba(0,0,0,.25)"
  });

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
    cursor: "pointer"
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

  control.append(toggle, label, volume);
  document.body.append(audio, control);

  console.info("[FP Music] Global music controller aktif.");
})();
