const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ini = require("ini");
const {
  loadServers,
  saveServers,
  isAuthenticated,
  isAdmin,
  activeServers,
  serverLogs,
} = require("../utils/helpers");

router.post("/install/:serverId", isAuthenticated, isAdmin, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendLog = (data) =>
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
  sendLog(`Starting SteamCMD installation for ${server.name}...\n`);

  const steamcmdCandidates = [
    process.env.STEAMCMD_PATH,
    "/opt/steamcmd/steamcmd.sh",
    "/usr/local/bin/steamcmd",
    "/usr/games/steamcmd",
  ].filter(Boolean);

  const steamcmdPath = steamcmdCandidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  });

  if (!steamcmdPath) {
    sendLog(
      `ERROR: SteamCMD binary not found. Checked: ${steamcmdCandidates.join(", ")}\n`,
    );
    res.write(`data: ${JSON.stringify({ done: true, code: 127 })}\n\n`);
    res.end();
    return;
  }

  sendLog(`Using SteamCMD at ${steamcmdPath}\n`);

  const steamHome = "/tmp/steamcmd-home";
  const steamTmp = "/tmp/steamcmd-tmp";
  fs.mkdirSync(steamHome, { recursive: true });
  fs.mkdirSync(steamTmp, { recursive: true });

  const steamcmdArgs = [
    "+force_install_dir",
    server.path,
    "+login",
    "anonymous",
    "+app_update",
    "376030",
    "+validate",
    "+quit",
  ];

  sendLog(`Running command: ${steamcmdPath} ${steamcmdArgs.join(" ")}\n`);
  sendLog(`Working directory: ${server.path}\n`);

  const steamcmd = spawn(
    "/bin/sh",
    [
      "-lc",
      `${steamcmdPath} ${steamcmdArgs.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(" ")}`,
    ],
    {
      cwd: server.path,
      env: {
        ...process.env,
        HOME: steamHome,
        STEAMHOME: steamHome,
        TMPDIR: steamTmp,
        XDG_CACHE_HOME: steamHome,
        XDG_CONFIG_HOME: steamHome,
      },
    },
  );

  steamcmd.on("error", (error) => {
    sendLog(`ERROR: Failed to start SteamCMD: ${error.message}\n`);
    res.write(`data: ${JSON.stringify({ done: true, code: 1 })}\n\n`);
    res.end();
  });

  steamcmd.stdout.on("data", (data) => sendLog(data.toString()));
  steamcmd.stderr.on("data", (data) => sendLog(`ERROR: ${data.toString()}`));
  steamcmd.on("close", (code) => {
    sendLog(`\nSteamCMD process exited with code ${code}.`);
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });
});

router.get("/status/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.json({
    installed: fs.existsSync(path.join(server.path, "ShooterGame")),
    running: !!activeServers[server.id],
  });
});

router.get("/terminal/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendLogChunk = (logs) =>
    res.write(`data: ${JSON.stringify({ logs })}\n\n`);
  if (serverLogs[server.id]) sendLogChunk(serverLogs[server.id].join(""));
  else sendLogChunk("[Terminal] Server is offline or no logs available yet.\n");

  const interval = setInterval(() => {
    if (serverLogs[server.id]) sendLogChunk(serverLogs[server.id].join(""));
  }, 1000);

  req.on("close", () => clearInterval(interval));
});

router.post(
  "/control/:serverId/start",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (activeServers[server.id])
      return res.status(400).json({ error: "Server is already running." });

    const shooterGameBin = path.join(
      server.path,
      "ShooterGame",
      "Binaries",
      "Linux",
      "ShooterGameServer",
    );
    if (!fs.existsSync(shooterGameBin))
      return res.status(400).json({ error: "Server binary files not found." });

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
        if (parsed.ServerSettings?.ActiveMap)
          mapName = parsed.ServerSettings.ActiveMap;
        if (parsed.SessionSettings?.SessionName)
          sessionName = parsed.SessionSettings.SessionName;
        else if (parsed.ServerSettings?.SessionName)
          sessionName = parsed.ServerSettings.SessionName;
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

    serverLogs[server.id] = [
      `[${new Date().toISOString()}] Starting server process...\n`,
      `[INFO] Server process launched, waiting for ARK server startup...\n`,
    ];
    serverProcess.stdout.on("data", (data) => {
      serverLogs[server.id].push(data.toString());
      if (serverLogs[server.id].length > 500) serverLogs[server.id].shift();
    });
    serverProcess.stderr.on("data", (data) => {
      const text = data.toString();
      const lines = text.split(/\r?\n/);
      lines.forEach((line) => {
        if (!line) return;
        const isSteamApiWarning =
          /\[S_API FAIL\]|SteamAPI_Init\(\) failed|SteamAPI_IsSteamRunning\(\) failed|Setting breakpad minidump AppID/.test(
            line,
          );
        serverLogs[server.id].push(
          isSteamApiWarning ? `[INFO] ${line}` : `ERROR: ${line}`,
        );
      });
      if (serverLogs[server.id].length > 500) serverLogs[server.id].shift();
    });
    serverProcess.on("close", (code) => {
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

router.post("/control/:serverId/stop", isAuthenticated, isAdmin, (req, res) => {
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
});

router.post(
  "/control/:serverId/restart",
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
          if (parsed.ServerSettings?.ActiveMap)
            mapName = parsed.ServerSettings.ActiveMap;
          if (parsed.SessionSettings?.SessionName)
            sessionName = parsed.SessionSettings.SessionName;
          else if (parsed.ServerSettings?.SessionName)
            sessionName = parsed.ServerSettings.SessionName;
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

router.post(
  "/control/:serverId/autostart",
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

module.exports = router;
