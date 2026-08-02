const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ini = require("ini");
const { activeServers, serverLogs } = require("./helpers");

function parseIniFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return ini.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    return {};
  }
}

function normalizeModIds(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(",");
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");
}

function buildStartupArgs(serverPath, serverName) {
  let mapName = "TheIsland";
  let sessionName = serverName;
  let modIds = "";

  const gusPath = path.join(
    serverPath,
    "ShooterGame",
    "Saved",
    "Config",
    "LinuxServer",
    "GameUserSettings.ini",
  );
  const gamePath = path.join(
    serverPath,
    "ShooterGame",
    "Saved",
    "Config",
    "LinuxServer",
    "Game.ini",
  );

  const gusConfig = parseIniFile(gusPath);
  const gameConfig = parseIniFile(gamePath);
  const serverSettings = gusConfig.ServerSettings || {};
  const sessionSettings = gusConfig.SessionSettings || {};
  const modInstaller = gameConfig.ModInstaller || gusConfig.ModInstaller || {};

  if (serverSettings.ActiveMap) mapName = serverSettings.ActiveMap;
  if (sessionSettings.SessionName) sessionName = sessionSettings.SessionName;
  else if (serverSettings.SessionName) sessionName = serverSettings.SessionName;

  modIds = normalizeModIds(
    serverSettings.ActiveMods || modInstaller.ModIDS || "",
  );

  const baseArgs = `${mapName}?listen?SessionName=${sessionName}?RCONEnabled=True?RCONPort=27020`;
  const launchArgs = modIds ? `${baseArgs}?GameModIds=${modIds}` : baseArgs;
  const serverArgs = [
    launchArgs,
    "-automanagedmods",
    "-server",
    "-log",
    "-usecache",
    "-NoBattlEye",
  ];

  return {
    launchArgs,
    serverArgs,
    mapName,
    sessionName,
    modIds,
  };
}

function launchServerProcess(server, options = {}) {
  const logger = options.logger || console.log;

  if (!server?.path) {
    logger("[Autostart] No server path was provided.");
    return { ok: false, error: "No server path was provided." };
  }

  const shooterGameBin = path.join(
    server.path,
    "ShooterGame",
    "Binaries",
    "Linux",
    "ShooterGameServer",
  );

  if (!fs.existsSync(shooterGameBin)) {
    logger(`[Autostart] Server binary files not found for ${server.name}.`);
    return { ok: false, error: "Server binary files not found." };
  }

  setTimeout(() => {
    try {
      const { launchArgs, serverArgs, mapName, sessionName, modIds } =
        buildStartupArgs(server.path, server.name);
      const formattedArgs = serverArgs
        .map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg))
        .join(" ");
      logger(
        `[StartupDebug] Server=${server.name} Binary=${shooterGameBin} Args=${formattedArgs}`,
      );
      logger(
        `[StartupDebug] Map=${mapName} Session=${sessionName} ModIds=${modIds || "<none>"}`,
      );
      logger(`[StartupDebug] Launch string=${launchArgs}`);
      const serverProcess = spawn(shooterGameBin, serverArgs, {
        cwd: path.dirname(shooterGameBin),
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      serverLogs[server.id] = [
        `[${new Date().toISOString()}] Starting server process on boot...\n`,
        `[INFO] Server process launched, waiting for ARK server startup...\n`,
      ];

      serverProcess.stdout.on("data", (data) => {
        if (!serverLogs[server.id]) serverLogs[server.id] = [];
        serverLogs[server.id].push(data.toString());
        if (serverLogs[server.id].length > 500) serverLogs[server.id].shift();
      });
      serverProcess.stderr.on("data", (data) => {
        if (!serverLogs[server.id]) serverLogs[server.id] = [];
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
        if (!serverLogs[server.id]) serverLogs[server.id] = [];
        serverLogs[server.id].push(
          `\n[Server process exited with code ${code}]\n`,
        );
        delete activeServers[server.id];
      });

      serverProcess.unref();
      activeServers[server.id] = serverProcess.pid;
      logger(
        `[Autostart] Started ${server.name} with PID ${serverProcess.pid}`,
      );
    } catch (error) {
      logger(`[Autostart] Failed to launch ${server.name}: ${error.message}`);
    }
  }, 5000);

  return { ok: true };
}

module.exports = { buildStartupArgs, launchServerProcess };
