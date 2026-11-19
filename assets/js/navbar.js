
(() => {
  if (window.__FP_GLOBAL_MENU__) return;
  window.__FP_GLOBAL_MENU__ = true;

  const MENU = [
    { section: "OVERVIEW", items: [
      ["Dashboard", "dashboard.html"]
    ]},
    { section: "WORKSPACE", items: [
      ["Marketplace", "marketplace.html"],
      ["Scope", "scope.html"],
      ["Create Design", "create-design.html"],
      ["Campaigns", "campaigns.html"],
      ["Lab Konveksi", "lab-konveksibos.html"],
      ["Workforce", "workforce.html"],
      ["Your Loker", "your-loker.html"]
    ]},
    { section: "MANAGEMENT", items: [
      ["Employees", "employees.html"],
      ["Equipment", "equipment.html"]
    ]},
    { section: "FINANCIAL", items: [
      ["Wallet", "wallet.html"],
      ["Transactions", "transactions.html"],
      ["Invoices", "invoices.html"]
    ]},
    { section: "ACCOUNT", items: [
      ["Create Company", "create-company.html"],
      ["Profile", "profile.html"],
      ["Settings", "settings.html"]
    ]}
  ];

  const removeMenu = () => {
    document.getElementById("fp-global-menu")?.remove();
    document.getElementById("fp-menu-overlay")?.remove();
    document.getElementById("fp-menu-button")?.remove();
  };

  function createMenu() {
    if (document.getElementById("fp-global-menu")) return;

    const button = document.createElement("button");
    button.id = "fp-menu-button";
    button.type = "button";
    button.setAttribute("aria-label", "Open menu");
    button.innerHTML = "☰";

    const overlay = document.createElement("div");
    overlay.id = "fp-menu-overlay";

    const nav = document.createElement("aside");
    nav.id = "fp-global-menu";

    nav.innerHTML = `
      <div class="fp-menu-brand">
        <div class="fp-menu-logo">FP</div>
        <div>
          <strong>FastProduction</strong>
          <small>Production System</small>
        </div>
        <button class="fp-menu-close" type="button">×</button>
      </div>
      <div class="fp-menu-content"></div>
      <div class="fp-menu-footer">
        <button class="fp-menu-logout" type="button">
          ↪ Logout
        </button>
      </div>
    `;

    const content = nav.querySelector(".fp-menu-content");
    const current = location.pathname.split("/").pop();

    MENU.forEach(group => {
      const section = document.createElement("section");
      section.className = "fp-menu-section";

      const heading = document.createElement("div");
      heading.className = "fp-menu-heading";
      heading.textContent = group.section;
      section.appendChild(heading);

      group.items.forEach(([label, file]) => {
        const link = document.createElement("a");
        link.className = "fp-menu-link";
        link.textContent = label;
        link.href = new URL(file, location.href).href;

        if (current === file) link.classList.add("active");

        section.appendChild(link);
      });

      content.appendChild(section);
    });

    const close = () => {
      nav.classList.remove("open");
      overlay.classList.remove("open");
    };

    const open = () => {
      nav.classList.add("open");
      overlay.classList.add("open");
    };

    button.addEventListener("click", open);
    overlay.addEventListener("click", close);
    nav.querySelector(".fp-menu-close").addEventListener("click", close);

    nav.querySelector(".fp-menu-logout").addEventListener("click", async () => {
      const logoutButton = nav.querySelector(".fp-menu-logout");
      logoutButton.disabled = true;
      logoutButton.textContent = "Logging out...";

      try {
        await window.FPAuth.logout();
        removeMenu();
        location.href = new URL("login.html", location.href).href;
      } catch (error) {
        console.error("Logout gagal:", error);
        logoutButton.disabled = false;
        logoutButton.textContent = "↪ Logout";
        alert("Logout gagal. Coba lagi.");
      }
    });

    const navActions = document.createElement("div");
    navActions.id = "fp-nav-actions";
    navActions.style.cssText = "position:fixed;top:16px;left:62px;z-index:99990;display:flex;align-items:center;";
    navActions.appendChild(button);
    document.body.append(navActions, overlay, nav);

    if (window.FPMusic?.mount) window.FPMusic.mount(navActions);
  }

  async function checkAuth() {
    try {
      if (!window.FPAuth) {
        removeMenu();
        return;
      }

      const session = await window.FPAuth.getSession();

      if (session?.user) createMenu();
      else removeMenu();

    } catch (error) {
      console.error("Global menu auth check:", error);
      removeMenu();
    }
  }

  async function start() {
    await checkAuth();

    if (window.FPAuth?.onChange) {
      window.FPAuth.onChange((_event, session) => {
        if (session?.user) createMenu();
        else removeMenu();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
