(() => {
  if (window.FPTransitionLoaded) return;
  window.FPTransitionLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    #fp-transition-loader,
    #fp-transition-character {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      pointer-events: none;
      opacity: 0;
      transition: opacity .2s ease;
    }

    #fp-transition-loader {
      gap: 14px;
      font-family: Arial, sans-serif;
    }

    #fp-transition-loader.active,
    #fp-transition-character.active {
      opacity: 1;
    }

    .fp-loader-logo {
      font-size: 23px;
      font-weight: 900;
      letter-spacing: 2px;
      color: var(--text, #f1f1f1);
    }

    .fp-loader-logo span {
      color: var(--accent, #b5d66b);
    }

    .fp-loader-track {
      width: min(220px, 65vw);
      height: 5px;
      border-radius: 10px;
      overflow: hidden;
      background: rgba(128,128,128,.25);
    }

    .fp-loader-progress {
      width: 0;
      height: 100%;
      background: var(--accent, #b5d66b);
      transition: width .55s ease;
    }

    .fp-loader-label {
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--text, #f1f1f1);
    }

    #fp-transition-character {
      gap: 12px;
      font-family: Arial, sans-serif;
      transform: scale(.94);
      transition: opacity .25s ease, transform .25s ease;
    }

    #fp-transition-character.active {
      transform: scale(1);
    }

    .fp-character-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 25px 30px;
      min-width: 220px;
      border-radius: 12px;
      background: var(--surface, #171b18);
      border: 1px solid var(--border, #414941);
      box-shadow: 0 10px 30px rgba(0,0,0,.25);
    }

    .fp-character-avatar {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 42px;
      color: var(--accent, #b5d66b);
      background: var(--surface-2, #242a25);
      border: 1px solid var(--border, #414941);
    }

    .fp-character-name {
      font-size: 19px;
      font-weight: 700;
      color: var(--text, #f1f1f1);
      text-align: center;
      overflow-wrap: anywhere;
    }

    .fp-character-role {
      font-size: 10px;
      letter-spacing: 1.5px;
      color: var(--muted, #999);
    }
  `;
  document.head.appendChild(style);

  const loader = document.createElement('div');
  loader.id = 'fp-transition-loader';
  loader.innerHTML = `
    <div class="fp-loader-logo">FAST<span>PRODUCTION</span></div>
    <div class="fp-loader-track">
      <div class="fp-loader-progress"></div>
    </div>
    <div class="fp-loader-label">LOADING WORKSPACE...</div>
  `;

  const character = document.createElement('div');
  character.id = 'fp-transition-character';
  character.innerHTML = `
    <div class="fp-character-card">
      <div class="fp-character-avatar">&#128100;</div>
      <div class="fp-character-name">Fashion Architect</div>
      <div class="fp-character-role">MANUFACTURER / LEVEL 1</div>
    </div>
  `;

  document.body.append(loader, character);

  const progress = loader.querySelector('.fp-loader-progress');
  const nameElement = character.querySelector('.fp-character-name');

  let transitioning = false;

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || transitioning) return;

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey ||
      link.target === '_blank' ||
      link.hasAttribute('download')
    ) return;

    const url = new URL(link.href, location.href);

    if (
      url.origin !== location.origin ||
      url.pathname === location.pathname ||
      url.hash ||
      !url.pathname.endsWith('.html')
    ) return;

    event.preventDefault();
    transitioning = true;

    try {
      const savedName = sessionStorage.getItem('fp_character_name');
      if (savedName) nameElement.textContent = savedName;
    } catch (_) {}

    loader.classList.add('active');
    progress.style.width = '100%';

    setTimeout(() => {
      loader.classList.remove('active');
      character.classList.add('active');

      setTimeout(() => {
        location.href = url.href;
      }, 450);
    }, 650);
  }, true);
})();
