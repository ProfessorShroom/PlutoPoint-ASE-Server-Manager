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
