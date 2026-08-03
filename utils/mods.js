const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
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

function getConfiguredModIds(serverPath) {
  if (!serverPath) return "";

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
  const modInstaller = gameConfig.ModInstaller || gusConfig.ModInstaller || {};

  return normalizeModIds(
    serverSettings.ActiveMods || modInstaller.ModIDS || "",
  );
}

function resolveWorkshopDir(workshopDir, serverPath) {
  const candidates = [];

  const addCandidate = (candidate) => {
    if (!candidate) return;
    const normalized = path.resolve(candidate);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (workshopDir) addCandidate(workshopDir);

  if (serverPath) {
    addCandidate(
      path.join(serverPath, "steamapps", "workshop", "content", "346110"),
    );
    addCandidate(
      path.join(
        serverPath,
        "Steam",
        "steamapps",
        "workshop",
        "content",
        "346110",
      ),
    );
  }

  const envRoots = [
    process.env.RUNTIME_HOME,
    process.env.HOME,
    process.env.STEAMHOME,
    process.env.USER_HOME,
    process.env.STEAM_ROOT,
    process.env.WORKSHOP_DIR,
    "/tmp/steamcmd-home",
    "/home/ubuntu",
    "/root",
    "/home/appuser",
  ];
  const workshopRootSuffixes = [
    path.join("Steam", "steamapps", "workshop", "content", "346110"),
    path.join("steamapps", "workshop", "content", "346110"),
    path.join(".steam", "steam", "steamapps", "workshop", "content", "346110"),
  ];

  const addRootCandidates = (root) => {
    if (!root) return;
    workshopRootSuffixes.forEach((suffix) => {
      addCandidate(path.join(root, suffix));
    });
  };

  envRoots.forEach(addRootCandidates);

  if (fs.existsSync("/home")) {
    try {
      for (const entry of fs.readdirSync("/home", { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        addRootCandidates(path.join("/home", entry.name));
      }
    } catch (err) {
      // Ignore home-directory scan failures and fall back to the explicit candidates.
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

async function downloadWorkshopMods(
  serverPath,
  serverName = "server",
  options = {},
) {
  if (!serverPath) return { ok: false, error: "No server path was provided." };

  const logger = options.logger || console.log;
  const modIds = getConfiguredModIds(serverPath);
  const modIdList = modIds
    .split(",")
    .map((modId) => modId.trim())
    .filter(Boolean);

  if (modIdList.length === 0) {
    logger(`[Mods] No workshop mod IDs configured for ${serverName}`);
    return { ok: true, downloaded: [] };
  }

  const steamcmdCandidates = [
    process.env.STEAMCMD_PATH,
    "/usr/games/steamcmd",
    "/usr/games/steamcmd.sh",
    "/usr/local/bin/steamcmd",
    "/opt/steamcmd/steamcmd.sh",
    "/opt/steamcmd/steamcmd",
  ].filter(Boolean);

  const steamcmdPath = steamcmdCandidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  });

  if (!steamcmdPath) {
    logger(
      `[Mods] SteamCMD binary not found; cannot download workshop mods for ${serverName}`,
    );
    return { ok: false, error: "SteamCMD binary not found." };
  }

  const steamHome = options.steamHome || "/tmp/steamcmd-home";
  const steamTmp = options.steamTmp || "/tmp/steamcmd-tmp";
  fs.mkdirSync(steamHome, { recursive: true });
  fs.mkdirSync(steamTmp, { recursive: true });

  const steamcmdArgs = [
    "+@sSteamCmdForcePlatformType",
    "windows",
    "+force_install_dir",
    path.resolve(serverPath),
    "+login",
    "anonymous",
    "+app_update",
    "376030",
  ];

  modIdList.forEach((modId) => {
    steamcmdArgs.push("+workshop_download_item", "346110", modId);
  });
  steamcmdArgs.push("+quit");

  logger(
    `[Mods] Downloading workshop items for ${serverName}: ${modIdList.join(", ")}`,
  );

  return new Promise((resolve, reject) => {
    const steamcmd = spawn(
      "/bin/sh",
      [
        "-lc",
        `${steamcmdPath} ${steamcmdArgs.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(" ")}`,
      ],
      {
        cwd: path.resolve(serverPath),
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

    let output = "";
    steamcmd.stdout.on("data", (data) => {
      output += data.toString();
      logger(data.toString().trim());
    });
    steamcmd.stderr.on("data", (data) => {
      output += data.toString();
      logger(`[Mods] ${data.toString().trim()}`);
    });
    steamcmd.on("error", (error) => {
      reject(error);
    });
    steamcmd.on("close", (code) => {
      if (code === 0) {
        const serverRoot = path.resolve(serverPath);
        const workshopPath = path.join(
          serverRoot,
          "steamapps",
          "workshop",
          "content",
          "346110",
        );
        const fallbackWorkshopPath = path.join(
          serverRoot,
          "Steam",
          "steamapps",
          "workshop",
          "content",
          "346110",
        );
        const resolvedWorkshopPath = fs.existsSync(workshopPath)
          ? workshopPath
          : fs.existsSync(fallbackWorkshopPath)
            ? fallbackWorkshopPath
            : null;

        resolve({
          ok: true,
          downloaded: modIdList,
          output,
          workshopPath: resolvedWorkshopPath,
        });
      } else {
        reject(new Error(`SteamCMD exited with code ${code}`));
      }
    });
  });
}

function syncServerMods(serverPath, serverName = "server", workshopDir) {
  if (!serverPath) return;

  const absServerPath = path.resolve(serverPath);
  const targetModsDir = path.join(
    absServerPath,
    "ShooterGame",
    "Content",
    "Mods",
  );
  const resolvedWorkshopDir = resolveWorkshopDir(workshopDir, absServerPath);

  if (!fs.existsSync(absServerPath)) {
    fs.mkdirSync(absServerPath, { recursive: true });
  }

  console.log(
    `[Mods] Synchronizing workshop mods for server: ${serverName} (${path.basename(absServerPath)})`,
  );

  if (!resolvedWorkshopDir) {
    console.log(
      `[Mods] Workshop directory not found; checked common Steam workshop locations.`,
    );
    return;
  }

  try {
    fs.mkdirSync(targetModsDir, { recursive: true });
  } catch (err) {
    console.error(
      `[Mods] Failed to create target mods directory:`,
      err.message,
    );
    return;
  }

  console.log(`[Mods] Using workshop directory: ${resolvedWorkshopDir}`);
  console.log(`[Mods] Target mods directory: ${targetModsDir}`);
  console.log(
    `[Mods] Target mods directory exists: ${fs.existsSync(targetModsDir)}`,
  );

  let entries;
  try {
    entries = fs.readdirSync(resolvedWorkshopDir, { withFileTypes: true });
  } catch (err) {
    console.error(`[Mods] Failed to read workshop directory:`, err.message);
    return;
  }

  console.log(
    `[Mods] Workshop entries: ${entries.map((entry) => entry.name).join(", ")}`,
  );

  for (const entry of entries) {
    const entryName = entry.name;
    const sourcePath = path.join(resolvedWorkshopDir, entryName);
    const targetPath = path.join(targetModsDir, entryName);

    try {
      if (entry.isDirectory()) {
        copyDirectoryRecursive(sourcePath, targetPath);
        console.log(
          `[ModsDebug] Ensured workshop directory ${entryName} -> ${targetPath}`,
        );
      } else if (entry.isFile()) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(
          `[ModsDebug] Ensured workshop file ${entryName} -> ${targetPath}`,
        );
      }
    } catch (err) {
      console.error(
        `[Mods] Failed to sync workshop entry ${entryName}:`,
        err.message,
      );
    }
  }

  console.log(
    `[Mods] Left existing server-side mods content intact for ${serverName}`,
  );
}

async function syncServerModsWithRetries(
  serverPath,
  serverName = "server",
  workshopDir,
  options = {},
) {
  const { attempts = 2, retryDelayMs = 1000, logger = console.log } = options;

  let syncWorkshopDir = workshopDir;

  try {
    const downloadResult = await downloadWorkshopMods(serverPath, serverName, {
      logger,
    });
    if (downloadResult?.workshopPath) {
      syncWorkshopDir = downloadResult.workshopPath;
    }
  } catch (err) {
    logger(
      `[Mods] Failed to download workshop items for ${serverName}: ${err.message}`,
    );
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      syncServerMods(serverPath, serverName, syncWorkshopDir);
      if (attempt < attempts) {
        logger(
          `[Mods] Waiting ${retryDelayMs / 1000}s before next workshop sync check (attempt ${attempt}/${attempts})`,
        );
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    } catch (err) {
      logger(`[Mods] Sync attempt ${attempt} failed:`, err.message);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}

module.exports = {
  syncServerMods,
  syncServerModsWithRetries,
  getConfiguredModIds,
  downloadWorkshopMods,
};
