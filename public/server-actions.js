async function toggleAutoStart(autoStart) {
  if (!currentServerId) return;
  const res = await fetch(`/api/control/${currentServerId}/autostart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoStart }),
  });

  if (res.ok) {
    const server = serversList.find((s) => s.id === currentServerId);
    if (server) server.autoStart = autoStart;
    const toggle = document.getElementById("dashboard-server-autostart");
    if (toggle) toggle.checked = autoStart;
  } else {
    const data = await res.json();
    alert(data.error);
  }
}

async function installServer() {
  if (!currentServerId) return;
  if (!confirm("Start SteamCMD installation process?")) return;

  const btnInstall = document.getElementById("btn-install");
  const progressContainer = document.getElementById(
    "install-progress-container",
  );
  const logOutput = document.getElementById("install-log-output");

  btnInstall.disabled = true;
  btnInstall.classList.add("opacity-50", "cursor-not-allowed");
  progressContainer.classList.remove("hidden");
  logOutput.innerText = "Connecting to installation stream...\n";

  try {
    const response = await fetch(`/api/install/${currentServerId}`, {
      method: "POST",
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.replace(/^data:\s*/, ""));
            if (data.log) {
              logOutput.innerText += data.log;
              logOutput.scrollTop = logOutput.scrollHeight;
            }
            if (data.done) {
              logOutput.innerText += `\n[Installation finished with exit code ${data.code}]\n`;
              btnInstall.disabled = false;
              btnInstall.classList.remove("opacity-50", "cursor-not-allowed");
              loadDashboardData();
            }
          } catch (err) {
            console.error("Error parsing SSE chunk", err);
          }
        }
      }
    }
  } catch (error) {
    logOutput.innerText +=
      "\nERROR: Failed to connect to installation stream.\n";
    btnInstall.disabled = false;
    btnInstall.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

async function updateCurrentAccount(e) {
  e.preventDefault();
  const username = document.getElementById("account-username").value;
  const password = document.getElementById("account-password").value;

  const payload = { username };
  if (password) payload.password = password;

  const res = await fetch("/api/users/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  alert(data.message || data.error);
  if (res.ok) {
    document.getElementById("account-password").value = "";
    checkAuth();
  }
}

async function controlServer(action) {
  if (!currentServerId) return;
  const res = await fetch(`/api/control/${currentServerId}/${action}`, {
    method: "POST",
  });
  const data = await res.json();
  alert(data.message || data.error);
  loadDashboardData();
}

async function createUser(e) {
  e.preventDefault();
  const username = document.getElementById("new-username").value;
  const password = document.getElementById("new-password").value;
  const isAdminUser = document.getElementById("new-isadmin").checked;

  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, isAdminUser }),
  });
  const data = await res.json();
  alert(data.message || data.error);
  if (res.ok) e.target.reset();
}

function switchTab(tab) {
  if (!currentServerId && tab !== "users") return;
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.add("hidden"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((el) => el.classList.remove("text-cyan-400", "font-bold"));

  const targetTab = document.getElementById(`tab-${tab}`);
  if (targetTab) targetTab.classList.remove("hidden");

  const btn = document.querySelector(`[data-tab="${tab}"]`);
  if (btn) btn.classList.add("text-cyan-400", "font-bold");
}
