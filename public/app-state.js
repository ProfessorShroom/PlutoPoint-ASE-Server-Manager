async function saveSettings(e) {
  e.preventDefault();
  if (!currentServerId) return;

  const inputs = document.querySelectorAll(
    "#settings-form input, #settings-form select",
  );
  const payload = {};

  inputs.forEach((i) => {
    if (i.id.startsWith("cfg-")) {
      const key = i.id.replace("cfg-", "");
      if (i.type === "checkbox") payload[key] = i.checked;
      else payload[key] = i.value;
    }
  });

  payload.npcReplacements = [];
  document
    .querySelectorAll("#npc-replacements-container > div")
    .forEach((row) => {
      const from = row.querySelector(".npc-from").value;
      const to = row.querySelector(".npc-to").value;
      payload.npcReplacements.push({ from, to });
    });

  payload.engramEntries = [];
  document
    .querySelectorAll("#engram-entries-container > div")
    .forEach((row) => {
      payload.engramEntries.push({
        className: row.querySelector(".engram-class").value,
        level: row.querySelector(".engram-level").value,
        points: row.querySelector(".engram-points").value,
        hidden: row.querySelector(".engram-hidden").checked,
        removePreReq: row.querySelector(".engram-prereq").checked,
      });
    });

  payload.craftingCosts = [];
  document
    .querySelectorAll("#crafting-costs-container > div")
    .forEach((card) => {
      const itemClass = card.querySelector(".craft-item-class").value;
      const resources = [];
      card.querySelectorAll(".resource-row").forEach((resRow) => {
        resources.push({
          type: resRow.querySelector(".res-type").value,
          amount: resRow.querySelector(".res-amount").value,
        });
      });
      if (itemClass) {
        payload.craftingCosts.push({ itemClass, resources });
      }
    });

  try {
    const response = await fetch(`/api/settings/${currentServerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (response.ok) {
      alert(result.message || "Settings saved successfully!");

      const newName = document.getElementById("cfg-sessionName").value;
      if (newName) {
        const sidebarElement =
          document.querySelector(`[data-server-id="${currentServerId}"]`) ||
          document.getElementById(`server-nav-${currentServerId}`);
        if (sidebarElement) {
          sidebarElement.textContent = newName;
        }
      }
    } else {
      alert(result.error || "Failed to save settings.");
    }
  } catch (err) {
    console.error("Error saving settings:", err);
    alert("An error occurred while saving settings.");
  }
}

async function loadSettingsData() {
  if (!currentServerId) return;
  const res = await fetch(`/api/settings/${currentServerId}`);
  if (!res.ok) return;
  const data = await res.json();
  for (const key in data) {
    const el = document.getElementById(`cfg-${key}`);
    if (el) {
      if (el.type === "checkbox") el.checked = data[key];
      else el.value = data[key];
    }
  }

  renderNpcReplacements(data.npcReplacements || []);
  renderEngramEntries(data.engramEntries || []);
  renderCraftingCosts(data.craftingCosts || []);
}

async function loadBackups() {
  if (!currentServerId) return;
  const res = await fetch(`/api/backups/${currentServerId}`);
  if (!res.ok) return;

  const data = await res.json();
  document.getElementById("backup-frequency").value = data.frequency || 0;
  document.getElementById("backup-retention").value = data.retention || 0;

  const container = document.getElementById("backup-list");
  container.innerHTML = "";

  if (data.backups.length === 0) {
    container.innerHTML =
      '<p class="text-slate-400 text-sm">No backups found.</p>';
    return;
  }

  data.backups.forEach((b) => {
    const date = new Date(b.time).toLocaleString();
    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between bg-slate-900 p-3 rounded border border-slate-700";
    row.innerHTML = `
      <div>
        <div class="text-sm font-bold text-white">${b.file}</div>
        <div class="text-xs text-slate-400">${date}</div>
      </div>
      <div class="space-x-2">
        <button onclick="restoreBackup('${b.file}')" class="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded transition">Restore</button>
        <button onclick="deleteBackup('${b.file}')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded transition">Delete</button>
      </div>
    `;
    container.appendChild(row);
  });
}

async function triggerBackup() {
  if (!currentServerId) return;
  const btn = event.target;
  btn.innerText = "Creating...";
  btn.disabled = true;

  const res = await fetch(`/api/backups/${currentServerId}`, {
    method: "POST",
  });
  const data = await res.json();

  btn.innerText = "Create Backup Now";
  btn.disabled = false;

  if (res.ok) {
    alert("Backup created successfully!");
    loadBackups();
  } else {
    alert(data.error || "Failed to create backup.");
  }
}

async function restoreBackup(file) {
  if (!currentServerId) return;
  if (
    !confirm(
      `Are you sure you want to restore ${file}? This will overwrite all current saves and configurations, and the server MUST be stopped first.`,
    )
  )
    return;

  const res = await fetch(`/api/backups/${currentServerId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file }),
  });

  const data = await res.json();
  if (res.ok) {
    alert("Backup restored successfully!");
  } else {
    alert(data.error || "Failed to restore backup.");
  }
}

async function deleteBackup(file) {
  if (!currentServerId) return;
  if (!confirm(`Delete backup ${file}?`)) return;

  await fetch(`/api/backups/${currentServerId}/${file}`, {
    method: "DELETE",
  });
  loadBackups();
}

async function saveBackupSettings(e) {
  e.preventDefault();
  if (!currentServerId) return;

  const frequency = document.getElementById("backup-frequency").value;
  const retention = document.getElementById("backup-retention").value;

  const res = await fetch(`/api/backups/${currentServerId}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frequency, retention }),
  });

  const data = await res.json();
  if (res.ok) alert("Schedule saved!");
  else alert(data.error);
}

async function deleteSpecificServer(serverId, serverName) {
  if (
    !confirm(
      `Are you sure you want to delete "${serverName}"? This will stop the server and remove its configuration.`,
    )
  ) {
    return;
  }

  try {
    const res = await fetch(`/api/servers/${serverId}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (res.ok) {
      alert(data.message || "Server deleted successfully.");
      if (currentServerId === serverId) {
        currentServerId = null;
      }
      loadServers();
    } else {
      alert(data.error || "Failed to delete server.");
    }
  } catch (err) {
    console.error("Error deleting server:", err);
    alert("An error occurred while deleting the server.");
  }
}

async function checkAuth() {
  const res = await fetch("/api/auth/me");
  const data = await res.json();
  if (data.loggedIn) {
    loggedInUserData = data.user;
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("app-view").classList.remove("hidden");
    document.getElementById("current-user").innerText =
      `${data.user.username} (${data.user.isAdmin ? "Admin" : "User"})`;
    document.getElementById("account-username").value = data.user.username;
    if (data.user.isAdmin)
      document.getElementById("nav-users").classList.remove("hidden");
    loadServers();
    loadVersionInfo();
  } else {
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("app-view").classList.add("hidden");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  const errDiv = document.getElementById("login-error");

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (data.success) {
    errDiv.classList.add("hidden");
    checkAuth();
  } else {
    errDiv.innerText = data.error || "Login failed";
    errDiv.classList.remove("hidden");
  }
}

async function handleLogout() {
  if (terminalEventSource) terminalEventSource.close();
  await fetch("/api/logout", { method: "POST" });
  checkAuth();
}

async function loadServers() {
  const res = await fetch("/api/servers");
  serversList = await res.json();
  const container = document.getElementById("server-list");
  container.innerHTML = "";

  if (serversList.length === 0) {
    currentServerId = null;
    document.getElementById("no-servers-state").classList.remove("hidden");
    document.getElementById("tab-dashboard").classList.add("hidden");
    document.getElementById("tab-settings").classList.add("hidden");
    return;
  }

  document.getElementById("no-servers-state").classList.add("hidden");
  if (!currentServerId || !serversList.some((s) => s.id === currentServerId)) {
    currentServerId = serversList[0].id;
  }

  serversList.forEach((s) => {
    const wrapper = document.createElement("div");
    wrapper.className = `flex items-center justify-between w-full rounded text-sm font-medium transition ${s.id === currentServerId ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-left px-3 py-2 flex-1 truncate focus:outline-none";
    btn.innerText = s.name;
    btn.onclick = () => switchServer(s.id);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className =
      "px-2.5 py-2 text-slate-400 hover:text-red-400 transition focus:outline-none";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "Delete server";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteSpecificServer(s.id, s.name);
    };

    wrapper.appendChild(btn);
    wrapper.appendChild(deleteBtn);
    container.appendChild(wrapper);
  });

  loadDashboardData();
  loadSettingsData();
  initTerminalStream();
  loadBackups();
}

function switchServer(id) {
  currentServerId = id;
  loadServers();
}

async function loadVersionInfo() {
  const versionEl = document.getElementById("app-version");
  versionEl.innerText = "Loading version...";

  try {
    const res = await fetch("/api/version");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load version");

    versionEl.innerText = `Version: ${data.version}`;
    if (data.updateAvailable) {
      const updateText = document.createElement("div");
      updateText.className = "text-xs text-amber-300 mt-1";
      updateText.innerText = `New Docker image available: ${data.latestDockerTag}`;
      versionEl.appendChild(updateText);
    }
  } catch (err) {
    versionEl.innerText = "Version info unavailable";
  }
}

function openAddServerModal() {
  document.getElementById("server-modal").classList.remove("hidden");
}

function closeAddServerModal() {
  document.getElementById("server-modal").classList.add("hidden");
}

async function createServer(e) {
  e.preventDefault();
  const name = document.getElementById("modal-server-name").value;
  const pathVal = document.getElementById("modal-server-path").value;
  const autoStart = document.getElementById("modal-server-autostart").checked;

  const res = await fetch("/api/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, path: pathVal, autoStart }),
  });
  const data = await res.json();
  if (res.ok) {
    closeAddServerModal();
    e.target.reset();
    loadServers();
  } else {
    alert(data.error);
  }
}

async function loadDashboardData() {
  if (!currentServerId) return;
  const res = await fetch(`/api/status/${currentServerId}`);
  if (!res.ok) return;
  const data = await res.json();

  const badge = document.getElementById("server-status-badge");
  if (data.running) {
    badge.className =
      "px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    badge.innerText = "Status: Running";
  } else {
    badge.className =
      "px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30";
    badge.innerText = "Status: Offline";
  }

  const statusText = document.getElementById("install-status-text");
  const btnInstall = document.getElementById("btn-install");
  const autoStartToggle = document.getElementById("dashboard-server-autostart");
  if (autoStartToggle) {
    const server = serversList.find((s) => s.id === currentServerId);
    autoStartToggle.checked = !!server?.autoStart;
  }
  if (data.installed) {
    statusText.innerText = "Server files are installed and ready.";
    btnInstall.classList.remove("hidden");
    btnInstall.innerText = "Validate / Update Files";
  } else {
    statusText.innerText =
      "Server files are missing. SteamCMD installation required.";
    btnInstall.classList.remove("hidden");
    btnInstall.innerText = "Install Server via SteamCMD";
  }
}

function initTerminalStream() {
  if (terminalEventSource) {
    terminalEventSource.close();
  }
  if (!currentServerId) return;

  terminalEventSource = new EventSource(`/api/terminal/${currentServerId}`);
  const terminalOutput = document.getElementById("server-terminal-output");

  terminalEventSource.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      if (data.logs) {
        const isAtBottom =
          terminalOutput.scrollHeight - terminalOutput.scrollTop <=
          terminalOutput.clientHeight + 50;
        terminalOutput.innerText = data.logs;
        if (isAtBottom) {
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
      }
    } catch (e) {
      console.error("Error parsing terminal stream", e);
    }
  };
}

function clearTerminalView() {
  document.getElementById("server-terminal-output").innerText = "";
}

const originalSwitchServer = switchServer;
switchServer = function (id) {
  originalSwitchServer(id);
  loadBackups();
};

checkAuth();

setInterval(() => {
  if (
    !document.getElementById("app-view").classList.contains("hidden") &&
    currentServerId
  ) {
    loadDashboardData();
  }
}, 3000);
