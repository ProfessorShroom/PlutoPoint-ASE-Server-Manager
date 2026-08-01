let currentServerId = null;
let serversList = [];
let loggedInUserData = null;
let terminalEventSource = null;

const commonDinos = [
  "Achatina_Character_BP_C",
  "Allo_Character_BP_C",
  "Ankylo_Character_BP_C",
  "Argent_Character_BP_C",
  "Baryonyx_Character_BP_C",
  "Basilosaurus_Character_BP_C",
  "Carno_Character_BP_C",
  "Daeodon_Character_BP_C",
  "Direbear_Character_BP_C",
  "Direwolf_Character_BP_C",
  "Dodo_Character_BP_C",
  "Doed_Character_BP_C",
  "Equus_Character_BP_C",
  "Galli_Character_BP_C",
  "Gigant_Character_BP_C",
  "Griffin_Character_BP_C",
  "Iguanodon_Character_BP_C",
  "Mammoth_Character_BP_C",
  "Megalodon_Character_BP_C",
  "Megalosaurus_Character_BP_C",
  "Megatherium_Character_BP_C",
  "Moschops_Character_BP_C",
  "Otter_Character_BP_C",
  "OviRaptor_Character_BP_C",
  "Paracer_Character_BP_C",
  "Para_Character_BP_C",
  "Plesiosaur_Character_BP_C",
  "Procoptodon_Character_BP_C",
  "Ptero_Character_BP_C",
  "Quetz_Character_BP_C",
  "Raptor_Character_BP_C",
  "Rex_Character_BP_C",
  "RockDrake_Character_BP_C",
  "Saber_Character_BP_C",
  "Sarco_Character_BP_C",
  "Spino_Character_BP_C",
  "Stego_Character_BP_C",
  "Tapejara_Character_BP_C",
  "TerrorBird_Character_BP_C",
  "Thylacoleo_Character_BP_C",
  "Trike_Character_BP_C",
  "Tropeognathus_Character_BP_C",
  "Tusoteuthis_Character_BP_C",
  "Yutyrannus_Character_BP_C",
];
async function toggleAutoStart(autoStart) {
  if (!currentServerId) return;
  const res = await fetch(`/api/control/${currentServerId}/autostart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoStart }),
  });

  if (res.ok) {
    // Update local state so it persists if you switch tabs
    const server = serversList.find((s) => s.id === currentServerId);
    if (server) server.autoStart = autoStart;
  } else {
    const data = await res.json();
    alert(data.error);
  }
}

// --- BACKUPS JAVASCRIPT LOGIC ---

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

// Modify the existing switchServer function to also load the backups tab
const originalSwitchServer = switchServer;
switchServer = function (id) {
  originalSwitchServer(id);
  loadBackups();
};

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
      // If the currently viewed server was deleted, clear currentServerId
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
    // Create a wrapper container for the server item and its delete button
    const wrapper = document.createElement("div");
    wrapper.className = `flex items-center justify-between w-full rounded text-sm font-medium transition ${s.id === currentServerId ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"}`;

    // Server selection button
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-left px-3 py-2 flex-1 truncate focus:outline-none";
    btn.innerText = s.name;
    btn.onclick = () => switchServer(s.id);

    // Delete button next to the server name
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className =
      "px-2.5 py-2 text-slate-400 hover:text-red-400 transition focus:outline-none";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "Delete server";
    deleteBtn.onclick = (e) => {
      e.stopPropagation(); // Prevent switching to the server when clicking delete
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

function renderNpcReplacements(items) {
  const container = document.getElementById("npc-replacements-container");
  container.innerHTML = "";
  items.forEach((item) => addNpcReplacementRow(item.from, item.to));
}

function addNpcReplacementRow(fromVal = "", toVal = "") {
  const container = document.getElementById("npc-replacements-container");
  const row = document.createElement("div");
  row.className =
    "flex items-center space-x-2 bg-slate-900 p-2 rounded border border-slate-700";

  let fromOptionsHtml = commonDinos
    .map(
      (d) =>
        `<option value="${d}" ${d === fromVal ? "selected" : ""}>${d}</option>`,
    )
    .join("");
  let toOptionsHtml =
    `<option value="" ${!toVal ? "selected" : ""}>-- No Spawn / Despawn --</option>` +
    commonDinos
      .map(
        (d) =>
          `<option value="${d}" ${d === toVal ? "selected" : ""}>${d}</option>`,
      )
      .join("");

  row.innerHTML = `
                <select class="npc-from bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm flex-1">
                    ${fromOptionsHtml}
                </select>
                <span class="text-xs text-slate-400">➔ replace with</span>
                <select class="npc-to bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm flex-1">
                    ${toOptionsHtml}
                </select>
                <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 font-bold px-2">&times;</button>
            `;
  container.appendChild(row);
}

function renderEngramEntries(items) {
  const container = document.getElementById("engram-entries-container");
  container.innerHTML = "";
  items.forEach((item) =>
    addEngramEntryRow(
      item.className,
      item.level,
      item.points,
      item.hidden,
      item.removePreReq,
    ),
  );
}

function addEngramEntryRow(
  className = "",
  level = 1,
  points = 1,
  hidden = false,
  removePreReq = false,
) {
  const container = document.getElementById("engram-entries-container");
  const row = document.createElement("div");
  row.className =
    "grid grid-cols-1 md:grid-cols-6 gap-2 bg-slate-900 p-3 rounded border border-slate-700 items-center";
  row.innerHTML = `
                <div class="md:col-span-2">
                    <label class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Engram Class Name</label>
                    <input type="text" class="engram-class w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="EngramEntry_DinoSkillReset_C" value="${className}">
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Level Requirement</label>
                    <input type="number" class="engram-level w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="1" value="${level}">
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Engram Points Cost</label>
                    <input type="number" class="engram-points w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="1" value="${points}">
                </div>
                <div class="flex flex-col justify-center space-y-1 text-xs pt-4">
                    <label class="flex items-center space-x-1.5"><input type="checkbox" class="engram-hidden" ${hidden ? "checked" : ""}> <span class="text-slate-300">Engram Hidden</span></label>
                    <label class="flex items-center space-x-1.5"><input type="checkbox" class="engram-prereq" ${removePreReq ? "checked" : ""}> <span class="text-slate-300">Remove PreReq</span></label>
                </div>
                <div class="text-right pt-4">
                    <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-400 hover:text-red-300 text-xs font-semibold">Remove</button>
                </div>
            `;
  container.appendChild(row);
}

function renderCraftingCosts(items) {
  const container = document.getElementById("crafting-costs-container");
  container.innerHTML = "";
  items.forEach((item) => addCraftingCostRow(item.itemClass, item.resources));
}

function addCraftingCostRow(itemClass = "", resources = []) {
  const container = document.getElementById("crafting-costs-container");
  const row = document.createElement("div");
  row.className = "bg-slate-900 p-3 rounded border border-slate-700 space-y-2";

  let resHtml = resources
    .map(
      (r) => `
                <div class="flex items-center space-x-2 text-xs resource-row">
                    <input type="text" class="res-type bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white flex-1" placeholder="ResourceItemTypeString" value="${r.type}">
                    <input type="number" step="any" class="res-amount bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white w-24" placeholder="Amount" value="${r.amount}">
                    <button type="button" onclick="this.parentElement.remove()" class="text-red-400 font-bold px-1">&times;</button>
                </div>
            `,
    )
    .join("");

  row.innerHTML = `
                <div class="flex items-center space-x-2">
                    <input type="text" class="craft-item-class w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm" placeholder="ItemClassString (e.g. PrimalItemConsumable_DinoSkillReset_C)" value="${itemClass}">
                    <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-400 hover:text-red-300 text-xs">Delete Override</button>
                </div>
                <div class="space-y-1 pl-4 border-l border-slate-700 resource-list">
                    <div class="text-xs font-semibold text-slate-400">Required Resources:</div>
                    ${resHtml}
                    <button type="button" onclick="addResourceRequirement(this)" class="text-cyan-400 hover:underline text-xs">+ Add Resource Requirement</button>
                </div>
            `;
  container.appendChild(row);
}

function addResourceRequirement(btn) {
  const list = btn.parentElement;
  const div = document.createElement("div");
  div.className = "flex items-center space-x-2 text-xs resource-row";
  div.innerHTML = `
                <input type="text" class="res-type bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white flex-1" placeholder="ResourceItemTypeString">
                <input type="number" step="any" class="res-amount bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white w-24" placeholder="Amount" value="1">
                <button type="button" onclick="this.parentElement.remove()" class="text-red-400 font-bold px-1">&times;</button>
            `;
  list.insertBefore(div, btn);
}

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

  // 1. Gather NPC Replacements
  payload.npcReplacements = [];
  document
    .querySelectorAll("#npc-replacements-container > div")
    .forEach((row) => {
      const from = row.querySelector(".npc-from").value;
      const to = row.querySelector(".npc-to").value;
      payload.npcReplacements.push({ from, to });
    });

  // 2. Gather Engram Entries
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

  // 3. Gather Crafting Costs
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

  // 4. Send a single unified request safely
  try {
    const response = await fetch(`/api/settings/${currentServerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (response.ok) {
      alert(result.message || "Settings saved successfully!");

      // Instantly update the sidebar name if it was changed
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
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.replace("data: ", ""));
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
    logOutput.innerText += `\nERROR: Failed to connect to installation stream.\n`;
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

checkAuth();

setInterval(() => {
  if (
    !document.getElementById("app-view").classList.contains("hidden") &&
    currentServerId
  ) {
    loadDashboardData();
  }
}, 3000);
