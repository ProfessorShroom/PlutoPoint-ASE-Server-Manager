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

  for (const entry of entries) {
    const entryName = entry.name;
    const sourcePath = path.join(resolvedWorkshopDir, entryName);
    const targetPath = path.join(targetModsDir, entryName);

    try {
      if (entry.isDirectory()) {
        if (!fs.existsSync(targetPath)) {
          copyDirectoryRecursive(sourcePath, targetPath);
          console.log(
            `[ModsDebug] Copied workshop directory ${entryName} -> ${targetPath}`,
          );
        } else {
          console.log(
            `[ModsDebug] Skipping workshop directory ${entryName}; target already exists at ${targetPath}`,
          );
        }
      } else if (entry.isFile()) {
        if (!fs.existsSync(targetPath)) {
          fs.copyFileSync(sourcePath, targetPath);
          console.log(
            `[ModsDebug] Copied workshop file ${entryName} -> ${targetPath}`,
          );
        } else {
          console.log(
            `[ModsDebug] Skipping workshop file ${entryName}; target already exists at ${targetPath}`,
          );
        }
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
