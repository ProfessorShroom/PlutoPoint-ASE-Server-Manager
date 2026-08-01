const express = require("express");
const session = require("express-session");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const BACKUP_DIR = "/backup";
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const path = require("path");
const ini = require("ini");
const os = require("os");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "ark-manager-super-secret-key",
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(express.static("public"));

const DATA_DIR = "/data";
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return hash === originalHash;
}

if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [
    {
      username: "ark",
      password: hashPassword("survival"),
      isAdmin: true,
    },
  ];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

if (!fs.existsSync(SERVERS_FILE)) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify([], null, 2));
}

// In-memory process tracking for active ARK servers
const activeServers = {};
const serverLogs = {};

function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function loadServers() {
  return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf-8"));
}
function saveServers(servers) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
}

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Unauthorized. Please log in." });
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) return next();
  res.status(403).json({ error: "Forbidden: Admins only." });
}

// --- BACKUP SYSTEM LOGIC ---

function getBackups(serverId) {
  const dir = path.join(BACKUP_DIR, serverId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => ({
      file: f,
      time: fs.statSync(path.join(dir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time); // Newest first
}

function createBackup(serverId, callback) {
  const servers = loadServers();
  const server = servers.find((s) => s.id === serverId);
  if (!server) return callback("Server not found");

  const serverBackupDir = path.join(BACKUP_DIR, serverId);
  if (!fs.existsSync(serverBackupDir))
    fs.mkdirSync(serverBackupDir, { recursive: true });

  const targetDir = path.join(server.path, "ShooterGame", "Saved");
  if (!fs.existsSync(targetDir))
    return callback("Server save directory not found.");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(serverBackupDir, `backup_${timestamp}.zip`);

  // CD into the directory so the zip structure is clean, then archive all save/config data
  exec(
    `cd "${targetDir}" && 7z a -tzip "${backupFile}" "*"`,
    (error, stdout, stderr) => {
      if (error) return callback(error.message);

      // Enforce Retention Policy
      if (server.backupRetention && server.backupRetention > 0) {
        const backups = getBackups(serverId);
        if (backups.length > server.backupRetention) {
          const toDelete = backups.slice(server.backupRetention);
          toDelete.forEach((b) => {
            try {
              fs.unlinkSync(path.join(serverBackupDir, b.file));
            } catch (e) {}
          });
        }
      }

      server.lastBackup = Date.now();
      saveServers(servers);
      callback(null, backupFile);
    },
  );
}

// Check for scheduled backups every 5 minutes
setInterval(
  () => {
    const servers = loadServers();
    const now = Date.now();
    servers.forEach((server) => {
      if (server.backupFrequency && server.backupFrequency > 0) {
        const msFreq = server.backupFrequency * 60 * 60 * 1000; // Frequency is in hours
        if (!server.lastBackup || now - server.lastBackup >= msFreq) {
          createBackup(server.id, (err) => {
            if (err)
              console.error(`Scheduled backup failed for ${server.id}: ${err}`);
          });
        }
      }
    });
  },
  5 * 60 * 1000,
);

// --- BACKUP ENDPOINTS ---

app.get("/api/backups/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.json({
    backups: getBackups(server.id),
    frequency: server.backupFrequency || 0,
    retention: server.backupRetention || 0,
  });
});

app.post("/api/backups/:serverId", isAuthenticated, isAdmin, (req, res) => {
  createBackup(req.params.serverId, (err, file) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "Backup created successfully", file });
  });
});

app.post(
  "/api/backups/:serverId/restore",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const { file } = req.body;
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (activeServers[server.id]) {
      return res
        .status(400)
        .json({ error: "Server must be stopped before restoring a backup." });
    }

    const backupPath = path.join(BACKUP_DIR, server.id, file);
    if (!fs.existsSync(backupPath))
      return res.status(404).json({ error: "Backup file not found." });

    const targetDir = path.join(server.path, "ShooterGame", "Saved");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Overwrite existing files with the backup contents
    exec(
      `7z x -aoa -o"${targetDir}" "${backupPath}"`,
      (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Backup restored successfully!" });
      },
    );
  },
);

app.delete(
  "/api/backups/:serverId/:file",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const backupPath = path.join(
      BACKUP_DIR,
      req.params.serverId,
      req.params.file,
    );
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    res.json({ message: "Backup deleted" });
  },
);

app.post(
  "/api/backups/:serverId/settings",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const { frequency, retention } = req.body;
    let servers = loadServers();
    let server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    server.backupFrequency = parseFloat(frequency) || 0;
    server.backupRetention = parseInt(retention, 10) || 0;
    saveServers(servers);
    res.json({ message: "Backup schedule updated!" });
  },
);

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.username === username);

  if (user && verifyPassword(password, user.password)) {
    req.session.user = { username: user.username, isAdmin: user.isAdmin };
    res.json({ success: true, isAdmin: user.isAdmin });
  } else {
    res
      .status(401)
      .json({ success: false, error: "Invalid username or password" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

app.get("/api/users", isAuthenticated, isAdmin, (req, res) => {
  res.json(
    loadUsers().map((u) => ({ username: u.username, isAdmin: u.isAdmin })),
  );
});

app.post("/api/users", isAuthenticated, isAdmin, (req, res) => {
  const { username, password, isAdminUser } = req.body;
  let users = loadUsers();
  if (users.some((u) => u.username === username))
    return res.status(400).json({ error: "Username already exists" });

  // Hash the password before saving
  users.push({
    username,
    password: hashPassword(password),
    isAdmin: !!isAdminUser,
  });

  saveUsers(users);
  res.json({ message: "User created successfully!" });
});

app.put("/api/users/me", isAuthenticated, (req, res) => {
  const { username, password } = req.body;
  let users = loadUsers();
  const userIndex = users.findIndex(
    (u) => u.username === req.session.user.username,
  );
  if (userIndex === -1)
    return res.status(404).json({ error: "User not found." });

  if (username && username !== users[userIndex].username) {
    if (users.some((u) => u.username === username))
      return res.status(400).json({ error: "Username already taken." });
    users[userIndex].username = username;
    req.session.user.username = username;
  }
  if (password) {
    // Hash the new password before updating
    users[userIndex].password = hashPassword(password);
  }

  saveUsers(users);
  res.json({ message: "Account updated successfully!" });
});

app.get("/api/servers", isAuthenticated, (req, res) => {
  res.json(loadServers());
});

app.post("/api/servers", isAuthenticated, isAdmin, (req, res) => {
  const { name, path: serverPath, autoStart } = req.body;
  let servers = loadServers();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  if (servers.some((s) => s.id === id))
    return res.status(400).json({ error: "Server identifier conflict." });
  if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath, { recursive: true });

  servers.push({ id, name, path: serverPath, autoStart: !!autoStart });
  saveServers(servers);
  res.json({ message: "Server added successfully!" });
});

app.post("/api/install/:serverId", isAuthenticated, isAdmin, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendLog = (data) => {
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
  };

  sendLog(`Starting SteamCMD installation for ${server.name}...\n`);

  const steamcmd = spawn("/usr/games/steamcmd", [
    "+force_install_dir",
    server.path,
    "+login",
    "anonymous",
    "+app_update",
    "376030",
    "+validate",
    "+quit",
  ]);

  steamcmd.stdout.on("data", (data) => {
    sendLog(data.toString());
  });

  steamcmd.stderr.on("data", (data) => {
    sendLog(`ERROR: ${data.toString()}`);
  });

  steamcmd.on("close", (code) => {
    sendLog(`\nSteamCMD process exited with code ${code}.`);
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });
});

app.get("/api/status/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const shooterGamePath = path.join(server.path, "ShooterGame");
  const installed = fs.existsSync(shooterGamePath);
  const running = !!activeServers[server.id];

  res.json({
    installed,
    running,
  });
});

// Live terminal SSE stream endpoint
app.get("/api/terminal/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendLogChunk = (logs) => {
    res.write(`data: ${JSON.stringify({ logs })}\n\n`);
  };

  if (serverLogs[server.id]) {
    sendLogChunk(serverLogs[server.id].join(""));
  } else {
    sendLogChunk("[Terminal] Server is offline or no logs available yet.\n");
  }

  const interval = setInterval(() => {
    if (serverLogs[server.id]) {
      sendLogChunk(serverLogs[server.id].join(""));
    }
  }, 1000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// Server Process Control Endpoints (Start, Stop, Restart)
app.post(
  "/api/control/:serverId/start",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (activeServers[server.id]) {
      return res.status(400).json({ error: "Server is already running." });
    }

    const shooterGameBin = path.join(
      server.path,
      "ShooterGame",
      "Binaries",
      "Linux",
      "ShooterGameServer",
    );
    if (!fs.existsSync(shooterGameBin)) {
      return res.status(400).json({
        error:
          "Server binary files not found. Ensure SteamCMD installation is complete.",
      });
    }

    let mapName = "TheIsland";
    let sessionName = server.name; // Fallback to default server name
    const gusPath = path.join(
      server.path,
      "ShooterGame",
      "Saved",
      "Config",
      "LinuxServer",
      "GameUserSettings.ini",
    );
    try {
      if (fs.existsSync(gusPath)) {
        const parsed = ini.parse(fs.readFileSync(gusPath, "utf-8"));
        if (parsed.ServerSettings && parsed.ServerSettings.ActiveMap) {
          mapName = parsed.ServerSettings.ActiveMap;
        }
        if (parsed.SessionSettings && parsed.SessionSettings.SessionName) {
          sessionName = parsed.SessionSettings.SessionName;
        } else if (parsed.ServerSettings && parsed.ServerSettings.SessionName) {
          sessionName = parsed.ServerSettings.SessionName;
        }
      }
    } catch (e) {}

    const args = [
      `${mapName}?listen?SessionName=${sessionName}?RCONEnabled=True?RCONPort=27020`,
    ];

    serverLogs[server.id] = [
      `[${new Date().toISOString()}] Starting server process...\n`,
    ];

    const serverProcess = spawn(shooterGameBin, args, {
      cwd: path.dirname(shooterGameBin),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (data) => {
      if (!serverLogs[server.id]) serverLogs[server.id] = [];
      serverLogs[server.id].push(data.toString());
      if (serverLogs[server.id].length > 500) serverLogs[server.id].shift();
    });

    serverProcess.stderr.on("data", (data) => {
      if (!serverLogs[server.id]) serverLogs[server.id] = [];
      serverLogs[server.id].push(`ERROR: ${data.toString()}`);
      if (serverLogs[server.id].length > 500) serverLogs[server.id].shift();
    });

    serverProcess.on("close", (code) => {
      if (!serverLogs[server.id]) serverLogs[server.id] = [];
      serverLogs[server.id].push(
        `\n[Server process exited with code ${code}]\n`,
      );
      delete activeServers[server.id];
    });

    serverProcess.unref();
    activeServers[server.id] = serverProcess.pid;

    res.json({ message: "Server started successfully!" });
  },
);

app.post(
  "/api/control/:serverId/stop",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (!activeServers[server.id]) {
      const killer = spawn("pkill", ["-f", server.path]);
      killer.on("close", () => {
        if (serverLogs[server.id])
          serverLogs[server.id].push(
            "\n[Server stopped via force kill signal]\n",
          );
        res.json({ message: "Server stop signal sent." });
      });
      return;
    }

    try {
      process.kill(activeServers[server.id], "SIGTERM");
      delete activeServers[server.id];
      if (serverLogs[server.id])
        serverLogs[server.id].push("\n[Server stopped successfully]\n");
      res.json({ message: "Server stopped successfully!" });
    } catch (e) {
      res.status(500).json({ error: "Failed to stop server process." });
    }
  },
);

app.post(
  "/api/control/:serverId/restart",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (activeServers[server.id]) {
      try {
        process.kill(activeServers[server.id], "SIGTERM");
        delete activeServers[server.id];
      } catch (e) {}
    } else {
      spawn("pkill", ["-f", server.path]);
    }

    if (serverLogs[server.id])
      serverLogs[server.id].push("\n[Restarting server...]\n");

    setTimeout(() => {
      const shooterGameBin = path.join(
        server.path,
        "ShooterGame",
        "Binaries",
        "Linux",
        "ShooterGameServer",
      );
      if (!fs.existsSync(shooterGameBin)) return;

      let mapName = "TheIsland";
      let sessionName = server.name;
      const gusPath = path.join(
        server.path,
        "ShooterGame",
        "Saved",
        "Config",
        "LinuxServer",
        "GameUserSettings.ini",
      );
      try {
        if (fs.existsSync(gusPath)) {
          const parsed = ini.parse(fs.readFileSync(gusPath, "utf-8"));
          if (parsed.ServerSettings && parsed.ServerSettings.ActiveMap) {
            mapName = parsed.ServerSettings.ActiveMap;
          }
          if (parsed.SessionSettings && parsed.SessionSettings.SessionName) {
            sessionName = parsed.SessionSettings.SessionName;
          } else if (
            parsed.ServerSettings &&
            parsed.ServerSettings.SessionName
          ) {
            sessionName = parsed.ServerSettings.SessionName;
          }
        }
      } catch (e) {}

      const serverProcess = spawn(
        shooterGameBin,
        [
          `${mapName}?listen?SessionName=${sessionName}?RCONEnabled=True?RCONPort=27020`,
        ],
        {
          cwd: path.dirname(shooterGameBin),
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      serverProcess.stdout.on("data", (data) => {
        if (!serverLogs[server.id]) serverLogs[server.id] = [];
        serverLogs[server.id].push(data.toString());
        if (serverLogs[server.id].length > 500) serverLogs[server.id].shift();
      });
      serverProcess.on("close", (code) => {
        if (!serverLogs[server.id]) serverLogs[server.id] = [];
        serverLogs[server.id].push(
          `\n[Server process exited with code ${code}]\n`,
        );
        delete activeServers[server.id];
      });

      serverProcess.unref();
      activeServers[server.id] = serverProcess.pid;
    }, 2000);

    res.json({ message: "Server restarting..." });
  },
);

app.get("/api/settings/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const configDir = path.join(
    server.path,
    "ShooterGame/Saved/Config/LinuxServer",
  );
  const gusPath = path.join(configDir, "GameUserSettings.ini");
  const gamePath = path.join(configDir, "Game.ini");

  let gusConfig = {};
  let gameConfig = {};

  try {
    if (fs.existsSync(gusPath))
      gusConfig = ini.parse(fs.readFileSync(gusPath, "utf-8"));
    if (fs.existsSync(gamePath))
      gameConfig = ini.parse(fs.readFileSync(gamePath, "utf-8"));
  } catch (e) {}

  const ss = gusConfig.ServerSettings || {};
  const gm = gameConfig["/script/shootergame.shootergamemode"] || {};
  const gs = gusConfig["/Script/Engine.GameSession"] || {};
  const session = gusConfig.SessionSettings || {};
  const motd = gusConfig.MessageOfTheDay || {};
  const modInstaller = gameConfig.ModInstaller || gusConfig.ModInstaller || {};

  let modIdsArray = [];
  if (modInstaller.ModIDS) {
    modIdsArray = Array.isArray(modInstaller.ModIDS)
      ? modInstaller.ModIDS
      : [modInstaller.ModIDS];
  } else if (ss.ActiveMods) {
    modIdsArray = ss.ActiveMods.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  const modIdsStr = modIdsArray.join(", ");

  const isTrue = (val) => val === "True" || val === true;

  let npcReplacements = [];
  if (gm.NPCReplacements) {
    const rawArr = Array.isArray(gm.NPCReplacements)
      ? gm.NPCReplacements
      : [gm.NPCReplacements];
    rawArr.forEach((entry) => {
      const match = entry.match(
        /FromClassName="([^"]+)",ToClassName="([^"]*)"/,
      );
      if (match) {
        npcReplacements.push({ from: match[1], to: match[2] });
      } else {
        const parts = entry.split(",");
        if (parts.length >= 2) {
          npcReplacements.push({ from: parts[0].trim(), to: parts[1].trim() });
        } else if (parts.length === 1) {
          npcReplacements.push({ from: parts[0].trim(), to: "" });
        }
      }
    });
  }

  let engramEntries = [];
  if (gm.OverrideNamedEngramEntries) {
    const rawArr = Array.isArray(gm.OverrideNamedEngramEntries)
      ? gm.OverrideNamedEngramEntries
      : [gm.OverrideNamedEngramEntries];
    rawArr.forEach((entry) => {
      const classNameMatch = entry.match(/EngramClassName="([^"]+)"/);
      const levelMatch = entry.match(/EngramLevelRequirement=(\d+)/);
      const pointsMatch = entry.match(/EngramPointsCost=(\d+)/);
      const hiddenMatch =
        entry.match(/EngramHidden=(True|False)/i) ||
        entry.match(/bHideInEngramViewer=(True|False)/i);
      const preReqMatch =
        entry.match(/RemoveEngramPreReq=(True|False)/i) ||
        entry.match(/bRemoveEngramPrerequisite=(True|False)/i);
      if (classNameMatch) {
        engramEntries.push({
          className: classNameMatch[1],
          level: levelMatch ? parseInt(levelMatch[1], 10) : 1,
          points: pointsMatch ? parseInt(pointsMatch[1], 10) : 1,
          hidden: hiddenMatch ? isTrue(hiddenMatch[1]) : false,
          removePreReq: preReqMatch ? isTrue(preReqMatch[1]) : false,
        });
      }
    });
  }

  let craftingCosts = [];
  if (gm.ConfigOverrideItemCraftingCosts) {
    const rawArr = Array.isArray(gm.ConfigOverrideItemCraftingCosts)
      ? gm.ConfigOverrideItemCraftingCosts
      : [gm.ConfigOverrideItemCraftingCosts];
    const costMap = {};
    rawArr.forEach((entry) => {
      const itemClassMatch = entry.match(/ItemClassString="([^"]+)"/);
      if (itemClassMatch) {
        const itemClass = itemClassMatch[1];
        if (!costMap[itemClass]) costMap[itemClass] = [];
        const resRegex =
          /ResourceItemTypeString="([^"]+)",(?:BaseResourceRequirement|ResourceQuantity)=([\d.]+)/g;
        let resMatch;
        while ((resMatch = resRegex.exec(entry)) !== null) {
          costMap[itemClass].push({
            type: resMatch[1],
            amount: parseFloat(resMatch[2]),
          });
        }
      }
    });
    for (const [itemClass, resources] of Object.entries(costMap)) {
      craftingCosts.push({ itemClass, resources });
    }
  }

  // --- NEW HELPER FUNCTION ---
  // Looks for a key case-insensitively across multiple config objects, ignores empty strings.
  const getVal = (sources, key, defaultVal) => {
    const lowerKey = key.toLowerCase();
    for (const source of sources) {
      if (!source) continue;
      const foundKey = Object.keys(source).find(
        (k) => k.toLowerCase() === lowerKey,
      );
      if (
        foundKey !== undefined &&
        source[foundKey] !== undefined &&
        source[foundKey] !== ""
      ) {
        return source[foundKey];
      }
    }
    return defaultVal;
  };

  res.json({
    serverMap: getVal([ss], "ActiveMap", "TheIsland"),
    sessionName: getVal([session, ss, gusConfig], "SessionName", ""),
    serverPassword: getVal([ss], "ServerPassword", ""),
    serverAdminPassword: getVal([ss], "ServerAdminPassword", ""),
    maxPlayers: getVal([gs, ss], "MaxPlayers", 70),
    difficultyOffset: getVal([ss], "DifficultyOffset", 1.0),
    overrideOfficialDifficulty: getVal([ss], "OverrideOfficialDifficulty", 1.0),
    maxTamedDinos: getVal([ss], "MaxTamedDinos", 5000),
    itemStackSizeMultiplier: getVal([ss], "ItemStackSizeMultiplier", 1.0),
    autoSavePeriodMinutes: getVal([ss], "AutoSavePeriodMinutes", 15.0),

    motdMessage: getVal([motd], "Message", ""),
    motdDuration: getVal([motd], "Duration", 5),

    serverPVE: isTrue(getVal([ss], "ServerPVE")),
    serverHardcore: isTrue(getVal([ss], "ServerHardcore")),
    noTributeDownloads: isTrue(getVal([ss], "NoTributeDownloads")),
    allowFlyerCarryPvE: isTrue(getVal([ss], "AllowFlyerCarryPvE")),
    globalVoiceChat: isTrue(getVal([ss], "GlobalVoiceChat")),
    proximityChat: isTrue(getVal([ss], "ProximityChat")),
    allowThirdPersonPlayer: isTrue(getVal([ss], "AllowThirdPersonPlayer")),
    showMapPlayerLocation: isTrue(getVal([ss], "ShowMapPlayerLocation")),
    enablePvPGamma: isTrue(getVal([ss], "EnablePvPGamma")),
    disableStructurePlacementCollision: isTrue(
      getVal([ss, gm], "DisableStructurePlacementCollision") ||
        getVal([ss, gm], "bDisableStructurePlacementCollision"),
    ),
    rconEnabled: isTrue(getVal([ss], "RCONEnabled")),
    rconPort: getVal([ss], "RCONPort", 27020),
    serverCrosshair: isTrue(getVal([ss], "ServerCrosshair")),
    serverForceNoHUD: isTrue(getVal([ss], "ServerForceNoHUD")),
    allowHitMarkers: isTrue(getVal([ss], "AllowHitMarkers")),
    bDisableFriendlyFire: isTrue(getVal([gm, ss], "bDisableFriendlyFire")),
    bAllowUnlimitedRespecs: isTrue(getVal([gm, ss], "bAllowUnlimitedRespecs")),
    bUseCorpseLocator: isTrue(getVal([gm, ss], "bUseCorpseLocator")),
    allowAnyoneBabyImprintCuddle: isTrue(
      getVal([ss], "AllowAnyoneBabyImprintCuddle"),
    ),
    overrideStructurePlatformPrevention: isTrue(
      getVal([ss], "OverrideStructurePlatformPrevention"),
    ),

    mods: modIdsStr,

    tamingSpeedMultiplier: getVal([ss, gm], "TamingSpeedMultiplier", 1.0),
    harvestAmountMultiplier: getVal([ss, gm], "HarvestAmountMultiplier", 1.0),
    harvestHealthMultiplier: getVal([ss, gm], "HarvestHealthMultiplier", 1.0),
    genericXPMultiplier: getVal([ss, gm], "GenericXPMultiplier", 1.0),
    craftXPMultiplier: getVal([ss, gm], "CraftXPMultiplier", 1.0),
    harvestXPMultiplier: getVal([ss, gm], "HarvestXPMultiplier", 1.0),
    killXPMultiplier: getVal([ss, gm], "KillXPMultiplier", 1.0),
    specialXPMultiplier: getVal([ss, gm], "SpecialXPMultiplier", 1.0),
    craftingSkillBonusMultiplier: getVal(
      [ss, gm],
      "CraftingSkillBonusMultiplier",
      1.0,
    ),
    layEggIntervalMultiplier: getVal([ss, gm], "LayEggIntervalMultiplier", 1.0),
    matingIntervalMultiplier: getVal([ss, gm], "MatingIntervalMultiplier", 1.0),
    eggHatchSpeedMultiplier: getVal([ss, gm], "EggHatchSpeedMultiplier", 1.0),
    babyMatureSpeedMultiplier: getVal(
      [ss, gm],
      "BabyMatureSpeedMultiplier",
      1.0,
    ),
    babyFoodConsumptionSpeedMultiplier: getVal(
      [ss, gm],
      "BabyFoodConsumptionSpeedMultiplier",
      1.0,
    ),
    babyCuddleIntervalMultiplier: getVal(
      [ss, gm],
      "BabyCuddleIntervalMultiplier",
      1.0,
    ),
    nightTimeSpeedScale: getVal([ss, gm], "NightTimeSpeedScale", 1.0),
    dayTimeSpeedScale: getVal([ss, gm], "DayTimeSpeedScale", 1.0),
    resourcesRespawnPeriodMultiplier: getVal(
      [ss, gm],
      "ResourcesRespawnPeriodMultiplier",
      1.0,
    ),
    playerDamageMultiplier: getVal([ss, gm], "PlayerDamageMultiplier", 1.0),
    dinoDamageMultiplier: getVal([ss, gm], "DinoDamageMultiplier", 1.0),
    tamedDinoDamageMultiplier: getVal(
      [ss, gm],
      "TamedDinoDamageMultiplier",
      1.0,
    ),
    dinoResistanceMultiplier: getVal([ss, gm], "DinoResistanceMultiplier", 1.0),
    tamedDinoResistanceMultiplier: getVal(
      [ss, gm],
      "TamedDinoResistanceMultiplier",
      1.0,
    ),
    structureDamageMultiplier: getVal(
      [ss, gm],
      "StructureDamageMultiplier",
      1.0,
    ),
    structureResistanceMultiplier: getVal(
      [ss, gm],
      "StructureResistanceMultiplier",
      1.0,
    ),
    playerHarvestingDamageMultiplier: getVal(
      [ss, gm],
      "PlayerHarvestingDamageMultiplier",
      1.0,
    ),
    dinoHarvestingDamageMultiplier: getVal(
      [ss, gm],
      "DinoHarvestingDamageMultiplier",
      1.0,
    ),
    wildDinoCharacterFoodDrainMultiplier: getVal(
      [ss, gm],
      "WildDinoCharacterFoodDrainMultiplier",
      1.0,
    ),
    globalSpoilingTimeMultiplier: getVal(
      [ss, gm],
      "GlobalSpoilingTimeMultiplier",
      1.0,
    ),
    cropGrowthSpeedMultiplier: getVal(
      [ss, gm],
      "CropGrowthSpeedMultiplier",
      1.0,
    ),
    cropDecaySpeedMultiplier: getVal([ss, gm], "CropDecaySpeedMultiplier", 1.0),
    supplyCrateLootQualityMultiplier: getVal(
      [ss, gm],
      "SupplyCrateLootQualityMultiplier",
      1.0,
    ),
    fishingLootQualityMultiplier: getVal(
      [ss, gm],
      "FishingLootQualityMultiplier",
      1.0,
    ),

    npcReplacements,
    engramEntries,
    craftingCosts,
  });
});

// Endpoint to delete a server configuration
app.delete("/api/servers/:serverId", isAuthenticated, isAdmin, (req, res) => {
  let servers = loadServers();
  const serverIndex = servers.findIndex((s) => s.id === req.params.serverId);
  if (serverIndex === -1)
    return res.status(404).json({ error: "Server not found" });

  if (activeServers[req.params.serverId]) {
    try {
      process.kill(activeServers[req.params.serverId], "SIGTERM");
      delete activeServers[req.params.serverId];
    } catch (e) {}
  }

  servers.splice(serverIndex, 1);
  saveServers(servers);
  res.json({ message: "Server deleted successfully." });
});

app.post("/api/settings/:serverId", isAuthenticated, isAdmin, (req, res) => {
  const servers = loadServers();
  const serverIndex = servers.findIndex((s) => s.id === req.params.serverId);
  if (serverIndex === -1)
    return res.status(404).json({ error: "Server not found" });
  const server = servers[serverIndex];

  const configDir = path.join(
    server.path,
    "ShooterGame/Saved/Config/LinuxServer",
  );
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const gusPath = path.join(configDir, "GameUserSettings.ini");
  const gamePath = path.join(configDir, "Game.ini");

  let gusConfig = {};
  let gameConfig = {};

  try {
    if (fs.existsSync(gusPath))
      gusConfig = ini.parse(fs.readFileSync(gusPath, "utf-8"));
    if (fs.existsSync(gamePath))
      gameConfig = ini.parse(fs.readFileSync(gamePath, "utf-8"));
  } catch (e) {}

  if (!gusConfig.ServerSettings) gusConfig.ServerSettings = {};
  if (!gusConfig["/Script/Engine.GameSession"])
    gusConfig["/Script/Engine.GameSession"] = {};
  if (!gusConfig.SessionSettings) gusConfig.SessionSettings = {};
  if (!gusConfig.MessageOfTheDay) gusConfig.MessageOfTheDay = {};
  if (!gameConfig["/script/shootergame.shootergamemode"])
    gameConfig["/script/shootergame.shootergamemode"] = {};

  const body = req.body;
  const ss = gusConfig.ServerSettings;
  const gs = gusConfig["/Script/Engine.GameSession"];
  const session = gusConfig.SessionSettings;
  const motd = gusConfig.MessageOfTheDay;
  const gm = gameConfig["/script/shootergame.shootergamemode"];

  if (body.sessionName !== undefined && body.sessionName.trim() !== "") {
    ss.SessionName = body.sessionName;
    session.SessionName = body.sessionName;

    server.name = body.sessionName;
    saveServers(servers);
  }

  if (body.serverMap !== undefined) ss.ActiveMap = body.serverMap;
  if (body.serverPassword !== undefined)
    ss.ServerPassword = body.serverPassword;
  if (body.serverAdminPassword !== undefined)
    ss.ServerAdminPassword = body.serverAdminPassword;
  if (body.maxPlayers !== undefined) {
    ss.MaxPlayers = body.maxPlayers;
    gs.MaxPlayers = body.maxPlayers;
  }
  if (body.rconPort !== undefined) ss.RCONPort = body.rconPort;
  if (body.difficultyOffset !== undefined)
    ss.DifficultyOffset = body.difficultyOffset;
  if (body.overrideOfficialDifficulty !== undefined)
    ss.OverrideOfficialDifficulty = body.overrideOfficialDifficulty;
  if (body.maxTamedDinos !== undefined) ss.MaxTamedDinos = body.maxTamedDinos;
  if (body.itemStackSizeMultiplier !== undefined)
    ss.ItemStackSizeMultiplier = body.itemStackSizeMultiplier;
  if (body.autoSavePeriodMinutes !== undefined)
    ss.AutoSavePeriodMinutes = body.autoSavePeriodMinutes;

  if (body.motdMessage !== undefined) motd.Message = body.motdMessage;
  if (body.motdDuration !== undefined) motd.Duration = body.motdDuration;

  // --- 1. GAMEUSERSETTINGS.INI MULTIPLIERS ---
  const gusMultipliers = {
    tamingSpeedMultiplier: "TamingSpeedMultiplier",
    harvestAmountMultiplier: "HarvestAmountMultiplier",
    harvestHealthMultiplier: "HarvestHealthMultiplier",
    nightTimeSpeedScale: "NightTimeSpeedScale",
    dayTimeSpeedScale: "DayTimeSpeedScale",
    resourcesRespawnPeriodMultiplier: "ResourcesRespawnPeriodMultiplier",
    playerDamageMultiplier: "PlayerDamageMultiplier",
    dinoDamageMultiplier: "DinoDamageMultiplier",
    tamedDinoDamageMultiplier: "TamedDinoDamageMultiplier",
    dinoResistanceMultiplier: "DinoResistanceMultiplier",
    tamedDinoResistanceMultiplier: "TamedDinoResistanceMultiplier",
    structureDamageMultiplier: "StructureDamageMultiplier",
    structureResistanceMultiplier: "StructureResistanceMultiplier",
    playerHarvestingDamageMultiplier: "PlayerHarvestingDamageMultiplier",
    dinoHarvestingDamageMultiplier: "DinoHarvestingDamageMultiplier",
    globalSpoilingTimeMultiplier: "GlobalSpoilingTimeMultiplier",
    cropGrowthSpeedMultiplier: "CropGrowthSpeedMultiplier",
    cropDecaySpeedMultiplier: "CropDecaySpeedMultiplier",
    supplyCrateLootQualityMultiplier: "SupplyCrateLootQualityMultiplier",
    fishingLootQualityMultiplier: "FishingLootQualityMultiplier",
  };

  // --- 2. GAME.INI MULTIPLIERS ---
  const gameMultipliers = {
    genericXPMultiplier: "GenericXPMultiplier",
    craftXPMultiplier: "CraftXPMultiplier",
    harvestXPMultiplier: "HarvestXPMultiplier",
    killXPMultiplier: "KillXPMultiplier",
    specialXPMultiplier: "SpecialXPMultiplier",
    craftingSkillBonusMultiplier: "CraftingSkillBonusMultiplier",
    layEggIntervalMultiplier: "LayEggIntervalMultiplier",
    matingIntervalMultiplier: "MatingIntervalMultiplier",
    eggHatchSpeedMultiplier: "EggHatchSpeedMultiplier",
    babyMatureSpeedMultiplier: "BabyMatureSpeedMultiplier",
    babyFoodConsumptionSpeedMultiplier: "BabyFoodConsumptionSpeedMultiplier",
    babyCuddleIntervalMultiplier: "BabyCuddleIntervalMultiplier",
    wildDinoCharacterFoodDrainMultiplier:
      "WildDinoCharacterFoodDrainMultiplier",
  };

  // Assign properly capitalized keys to GameUserSettings.ini [ServerSettings]
  for (const [frontendKey, iniKey] of Object.entries(gusMultipliers)) {
    if (body[frontendKey] !== undefined) {
      ss[iniKey] = body[frontendKey];
    }
  }

  // Assign properly capitalized keys to Game.ini
  for (const [frontendKey, iniKey] of Object.entries(gameMultipliers)) {
    if (body[frontendKey] !== undefined) {
      gm[iniKey] = body[frontendKey];
    }
  }

  const boolMap = {
    serverPVE: "ServerPVE",
    serverHardcore: "ServerHardcore",
    noTributeDownloads: "NoTributeDownloads",
    allowFlyerCarryPvE: "AllowFlyerCarryPvE",
    globalVoiceChat: "GlobalVoiceChat",
    proximityChat: "ProximityChat",
    allowThirdPersonPlayer: "AllowThirdPersonPlayer",
    showMapPlayerLocation: "ShowMapPlayerLocation",
    enablePvPGamma: "EnablePvPGamma",
    disableStructurePlacementCollision: "DisableStructurePlacementCollision",
    rconEnabled: "RCONEnabled",
    serverCrosshair: "ServerCrosshair",
    serverForceNoHUD: "ServerForceNoHUD",
    allowHitMarkers: "AllowHitMarkers",
    allowAnyoneBabyImprintCuddle: "AllowAnyoneBabyImprintCuddle",
    overrideStructurePlatformPrevention: "OverrideStructurePlatformPrevention",
  };

  for (const [frontendKey, iniKey] of Object.entries(boolMap)) {
    if (body[frontendKey] !== undefined) {
      ss[iniKey] = body[frontendKey] ? "True" : "False";
    }
  }

  if (body.disableStructurePlacementCollision !== undefined) {
    gm.bDisableStructurePlacementCollision =
      body.disableStructurePlacementCollision ? "True" : "False";
  }
  if (body.bDisableFriendlyFire !== undefined) {
    gm.bDisableFriendlyFire = body.bDisableFriendlyFire ? "True" : "False";
  }
  if (body.bAllowUnlimitedRespecs !== undefined) {
    gm.bAllowUnlimitedRespecs = body.bAllowUnlimitedRespecs ? "True" : "False";
  }
  if (body.bUseCorpseLocator !== undefined) {
    gm.bUseCorpseLocator = body.bUseCorpseLocator ? "True" : "False";
  }

  if (body.mods !== undefined) {
    ss.ActiveMods = body.mods;

    const modIdsArray = body.mods
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (modIdsArray.length > 0) {
      gameConfig["ModInstaller"] = {
        ModIDS: modIdsArray,
      };
    } else {
      delete gameConfig["ModInstaller"];
    }
  }
  if (body.npcReplacements && Array.isArray(body.npcReplacements)) {
    gm.NPCReplacements = body.npcReplacements.map(
      (r) => `FromClassName="${r.from}",ToClassName="${r.to}"`,
    );
  } else {
    delete gm.NPCReplacements;
  }

  if (body.engramEntries && Array.isArray(body.engramEntries)) {
    gm.OverrideNamedEngramEntries = body.engramEntries.map(
      (e) =>
        `EngramClassName="${e.className}",EngramLevelRequirement=${e.level},EngramPointsCost=${e.points},EngramHidden=${e.hidden ? "True" : "False"},RemoveEngramPreReq=${e.removePreReq ? "True" : "False"}`,
    );
  } else {
    delete gm.OverrideNamedEngramEntries;
  }

  if (body.craftingCosts && Array.isArray(body.craftingCosts)) {
    gm.ConfigOverrideItemCraftingCosts = body.craftingCosts.map((c) => {
      const resStrs = c.resources
        .map(
          (r) =>
            `ResourceItemTypeString="${r.type}",BaseResourceRequirement=${r.amount},bCraftUsingSoloCrafting=False`,
        )
        .join(",");
      return `ItemClassString="${c.itemClass}",(${resStrs})`;
    });
  } else {
    delete gm.ConfigOverrideItemCraftingCosts;
  }

  try {
    let rawGusData = ini.stringify(gusConfig);
    // Strip out the backslashes that the INI library adds before periods
    rawGusData = rawGusData.replace(/\\\./g, ".");

    fs.writeFileSync(gusPath, rawGusData, "utf-8");

    // Custom stringifier for Game.ini to handle repeated ModIDS keys without brackets
    let gameIniContent = "";
    for (const [section, keys] of Object.entries(gameConfig)) {
      gameIniContent += `[${section}]\n`;
      for (const [key, val] of Object.entries(keys)) {
        if (key === "ModIDS" && Array.isArray(val)) {
          val.forEach((modId) => {
            gameIniContent += `ModIDS=${modId}\n`;
          });
        } else if (Array.isArray(val)) {
          val.forEach((item) => {
            gameIniContent += `${key}=${item}\n`;
          });
        } else {
          gameIniContent += `${key}=${val}\n`;
        }
      }
      gameIniContent += "\n";
    }

    fs.writeFileSync(gamePath, gameIniContent.trim());
    res.json({ message: "Settings saved successfully!" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to write configuration files to disk." });
  }
});

// Endpoint to toggle autostart from the UI
app.post(
  "/api/control/:serverId/autostart",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    let servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    server.autoStart = !server.autoStart;
    saveServers(servers);
    res.json({ success: true, autoStart: server.autoStart });
  },
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ARK Manager server running on port ${PORT}`);
});
