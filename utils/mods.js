const fs = require("fs");
const path = require("path");
const ini = require("ini");

// Helper function to wait until the directory exists or timeout
async function waitForDirectory(dirPath, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(dirPath)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function linkServerMods(serverPath) {
  const workshopDir = "/home/ubuntu/Steam/steamapps/workshop/content/346110";
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  console.log(
    `[Mods] Waiting for workshop directory to appear: ${workshopDir}`,
  );

  // Wait up to 30 seconds for SteamCMD to populate the folder on startup
  const exists = await waitForDirectory(workshopDir, 30000);
  if (!exists) {
    console.log(`[Mods] Workshop directory did not appear within timeout.`);
    return;
  }

  console.log(`[Mods] Workshop directory found! Proceeding with linking.`);
  fs.mkdirSync(targetModsDir, { recursive: true });

  const configDir = path.join(
    serverPath,
    "ShooterGame",
    "Saved",
    "Config",
    "LinuxServer",
  );
  const gusPath = path.join(configDir, "GameUserSettings.ini");
  const gamePath = path.join(configDir, "Game.ini");

  let modIds = [];
  try {
    if (fs.existsSync(gusPath)) {
      const gusContent = fs.readFileSync(gusPath, "utf-8");
      const gusParsed = ini.parse(gusContent);
      const activeModsStr =
        gusParsed.ServerSettings?.ActiveMods ||
        gusParsed["ServerSettings"]?.activemods;
      if (activeModsStr) {
        modIds = activeModsStr
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
      }
    }

    if (modIds.length === 0 && fs.existsSync(gamePath)) {
      const gameParsed = ini.parse(fs.readFileSync(gamePath, "utf-8"));
      if (gameParsed.ModInstaller?.ModIDS) {
        modIds = Array.isArray(gameParsed.ModInstaller.ModIDS)
          ? gameParsed.ModInstaller.ModIDS
          : [gameParsed.ModInstaller.ModIDS];
      }
    }
  } catch (e) {
    console.error("[Mods] ERROR parsing configs for mod linking:", e.message);
  }

  console.log(`[Mods] Found active mod IDs to link:`, modIds);

  for (const modId of modIds) {
    const sourceFolder = path.join(workshopDir, modId);
    const targetFolder = path.join(targetModsDir, modId);
    const sourceFile = path.join(workshopDir, `${modId}.mod`);
    const targetFile = path.join(targetModsDir, `${modId}.mod`);

    try {
      if (fs.existsSync(sourceFolder)) {
        if (fs.existsSync(targetFolder)) {
          fs.rmSync(targetFolder, { recursive: true, force: true });
        }
        fs.symlinkSync(sourceFolder, targetFolder, "dir");
        console.log(`[Mods] Successfully linked mod folder: ${modId}`);
      } else {
        console.log(
          `[Mods] Source folder for mod ${modId} not found in workshop cache.`,
        );
      }

      if (fs.existsSync(sourceFile)) {
        if (fs.existsSync(targetFile)) {
          fs.rmSync(targetFile, { force: true });
        }
        fs.symlinkSync(sourceFile, targetFile, "file");
        console.log(`[Mods] Successfully linked mod file: ${modId}.mod`);
      }
    } catch (err) {
      console.error(`[Mods] Failed to link mod ${modId}:`, err.message);
    }
  }
}

module.exports = { linkServerMods };
