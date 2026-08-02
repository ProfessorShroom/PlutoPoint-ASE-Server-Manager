const fs = require("fs");
const path = require("path");

function resolveWorkshopDir(workshopDir) {
  const candidates = [];

  const addCandidate = (candidate) => {
    if (!candidate) return;
    const normalized = path.resolve(candidate);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (workshopDir) addCandidate(workshopDir);

  const envRoots = [
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

function syncServerMods(serverPath, serverName = "server", workshopDir) {
  if (!serverPath) return;

  const absServerPath = path.resolve(serverPath);
  const targetModsDir = path.join(
    absServerPath,
    "ShooterGame",
    "Content",
    "Mods",
  );
  const resolvedWorkshopDir = resolveWorkshopDir(workshopDir);

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
  const { attempts = 10, retryDelayMs = 30000 } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      syncServerMods(serverPath, serverName, workshopDir);
      if (attempt < attempts) {
        console.log(
          `[Mods] Waiting ${retryDelayMs / 1000}s before next workshop sync check (attempt ${attempt}/${attempts})`,
        );
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    } catch (err) {
      console.error(`[Mods] Sync attempt ${attempt} failed:`, err.message);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}

module.exports = { syncServerMods, syncServerModsWithRetries };
