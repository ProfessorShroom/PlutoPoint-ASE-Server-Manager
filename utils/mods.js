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

  addCandidate("/home/ubuntu/Steam/steamapps/workshop/content/346110");
  addCandidate("/home/ubuntu/steamapps/workshop/content/346110");
  addCandidate("/root/Steam/steamapps/workshop/content/346110");
  addCandidate("/root/steamapps/workshop/content/346110");
  addCandidate("/home/appuser/Steam/steamapps/workshop/content/346110");
  addCandidate("/home/appuser/steamapps/workshop/content/346110");

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

  const currentModIds = new Set();

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

    const modId = entry.name;
    currentModIds.add(modId);
    const sourceFolder = path.join(resolvedWorkshopDir, modId);
    const targetFolder = path.join(targetModsDir, modId);
    const sourceFile = path.join(resolvedWorkshopDir, `${modId}.mod`);
    const targetFile = path.join(targetModsDir, `${modId}.mod`);

    try {
      if (fs.existsSync(sourceFolder)) {
        if (
          fs.existsSync(targetFolder) ||
          fs.lstatSync(targetFolder, { throwIfNoEntry: false })
        ) {
          fs.rmSync(targetFolder, { recursive: true, force: true });
        }
        copyDirectoryRecursive(sourceFolder, targetFolder);
        console.log(`[Mods] Copied mod folder ${modId} into ${serverName}`);
      }

      if (fs.existsSync(sourceFile)) {
        if (
          fs.existsSync(targetFile) ||
          fs.lstatSync(targetFile, { throwIfNoEntry: false })
        ) {
          fs.rmSync(targetFile, { recursive: true, force: true });
        }
        fs.copyFileSync(sourceFile, targetFile);
        console.log(`[Mods] Copied mod file ${modId}.mod into ${serverName}`);
      }
    } catch (err) {
      console.error(`[Mods] Failed to sync mod ${modId}:`, err.message);
    }
  }

  for (const existingEntry of fs.readdirSync(targetModsDir, {
    withFileTypes: true,
  })) {
    if (!existingEntry.isDirectory() && !existingEntry.isFile()) continue;

    const existingName = existingEntry.name;
    if (!/^(\d+|\d+\.mod)$/.test(existingName)) continue;
    if (!currentModIds.has(existingName.replace(/\.mod$/, ""))) {
      const existingPath = path.join(targetModsDir, existingName);
      fs.rmSync(existingPath, { recursive: true, force: true });
      console.log(
        `[Mods] Removed stale mod entry ${existingName} from ${serverName}`,
      );
    }
  }
}

async function syncServerModsWithRetries(
  serverPath,
  serverName = "server",
  workshopDir,
  options = {},
) {
  const { attempts = 4, retryDelayMs = 3000 } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      syncServerMods(serverPath, serverName, workshopDir);
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
