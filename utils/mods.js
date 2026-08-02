const fs = require("fs");
const os = require("os");
const path = require("path");

function resolveWorkshopDir(workshopDir) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (candidate) => {
    if (!candidate) return;
    const normalized = path.resolve(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };

  if (workshopDir) addCandidate(workshopDir);

  for (const envValue of [
    process.env.STEAM_WORKSHOP_DIR,
    process.env.WORKSHOP_CONTENT_DIR,
    process.env.STEAMCMD_WORKSHOP_DIR,
    process.env.STEAMHOME,
    process.env.STEAM_HOME,
    process.env.HOME,
    process.env.USERPROFILE,
  ]) {
    if (!envValue) continue;
    addCandidate(
      path.join(envValue, "steamapps", "workshop", "content", "346110"),
    );
    addCandidate(
      path.join(
        envValue,
        "Steam",
        "steamapps",
        "workshop",
        "content",
        "346110",
      ),
    );
    addCandidate(
      path.join(
        envValue,
        ".steam",
        "steam",
        "steamapps",
        "workshop",
        "content",
        "346110",
      ),
    );
  }

  for (const base of [
    os.homedir(),
    "/home/ubuntu",
    "/home/appuser",
    "/root",
    "/tmp/steamcmd-home",
  ]) {
    addCandidate(
      path.join(base, "Steam", "steamapps", "workshop", "content", "346110"),
    );
    addCandidate(path.join(base, "steamapps", "workshop", "content", "346110"));
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function linkServerMods(serverPath, serverName = "server", workshopDir) {
  if (!serverPath) return;

  const absServerPath = path.resolve(serverPath);
  const targetModsDir = path.join(
    absServerPath,
    "ShooterGame",
    "Content",
    "Mods",
  );
  const resolvedWorkshopDir = resolveWorkshopDir(workshopDir);

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

  let entries;
  try {
    entries = fs.readdirSync(resolvedWorkshopDir, { withFileTypes: true });
  } catch (err) {
    console.error(`[Mods] Failed to read workshop directory:`, err.message);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

    const modId = entry.name;
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
        fs.symlinkSync(sourceFolder, targetFolder, "dir");
        console.log(`[Mods] Linked mod folder ${modId} into ${serverName}`);
      }

      if (fs.existsSync(sourceFile)) {
        if (
          fs.existsSync(targetFile) ||
          fs.lstatSync(targetFile, { throwIfNoEntry: false })
        ) {
          fs.rmSync(targetFile, { recursive: true, force: true });
        }
        fs.symlinkSync(sourceFile, targetFile, "file");
        console.log(`[Mods] Linked mod file ${modId}.mod into ${serverName}`);
      }
    } catch (err) {
      console.error(`[Mods] Failed to link mod ${modId}:`, err.message);
    }
  }
}

module.exports = { linkServerMods };
