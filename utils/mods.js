const fs = require("fs");
const path = require("path");
const ini = require("ini");

function linkServerMods(serverPath) {
  const workshopDir = path.join(
    process.env.HOME || "/home/ubuntu",
    "Steam",
    "steamapps",
    "workshop",
    "content",
    "346110",
  );
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  if (!fs.existsSync(workshopDir)) return;
  fs.mkdirSync(targetModsDir, { recursive: true });

  // Read GameUserSettings.ini or Game.ini to find active mods
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
      const gusParsed = ini.parse(fs.readFileSync(gusPath, "utf-8"));
      if (gusParsed.ServerSettings?.ActiveMods) {
        modIds = gusParsed.ServerSettings.ActiveMods.split(",")
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
    console.error("[WARN] Could not parse configs for mod linking:", e.message);
  }

  // Link each mod folder and .mod file found in workshop cache
  for (const modId of modIds) {
    const sourceFolder = path.join(workshopDir, modId);
    const targetFolder = path.join(targetModsDir, modId);
    const sourceFile = path.join(workshopDir, `${modId}.mod`);
    const targetFile = path.join(targetModsDir, `${modId}.mod`);

    try {
      if (fs.existsSync(sourceFolder)) {
        if (fs.lstatSync(targetFolder).isSymbolicLink())
          fs.unlinkSync(targetFolder);
        fs.symlinkSync(sourceFolder, targetFolder, "dir");
      }
      if (fs.existsSync(sourceFile)) {
        if (fs.lstatSync(targetFile).isSymbolicLink())
          fs.unlinkSync(targetFile);
        fs.symlinkSync(sourceFile, targetFile, "file");
      }
    } catch (err) {
      // Safe fallback if symlink already exists or throws error
    }
  }
}

module.exports = { linkServerMods };
