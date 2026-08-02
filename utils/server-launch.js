const fs = require("fs");
const path = require("path");
const ini = require("ini");

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

  return {
    launchArgs,
    serverArgs: [launchArgs, "-server", "-log", "-usecache", "-NoBattlEye"],
  };
}

module.exports = { buildStartupArgs };
