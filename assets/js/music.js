(() => {
  if (window.__FP_MUSIC_INITIALIZED__) return;
  window.__FP_MUSIC_INITIALIZED__ = true;

  const audio = new Audio(
    new URL("../audio/Before_the_Journey_Starts.mp3", import.meta.url).href
  );

  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.4;

  let playing = false;

  function updateButton(button) {
    if (!button) return;
    button.textContent = playing ? "♫" : "♪";
    button.title = playing ? "Pause music" : "Play music";
    button.setAttribute("aria-pressed", String(playing));
    button.style.color = playing ? "#c6f36a" : "#a0aaa2";
  }

  window.FPMusic = {
    async toggle(button) {
      try {
        if (audio.paused) {
          await audio.play();
          playing = true;
        } else {
          audio.pause();
          playing = false;
        }
        updateButton(button);
      } catch (error) {
        playing = false;
        updateButton(button);
        console.error("[FP Music] Audio gagal diputar:", error);
      }
    },

    updateButton
  };

  audio.addEventListener("play", () => { playing = true; });
  audio.addEventListener("pause", () => { playing = false; });

  console.info("[FP Music] Audio engine siap.");
})();
