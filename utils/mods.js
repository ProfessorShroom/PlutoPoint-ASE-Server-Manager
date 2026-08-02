const fs = require("fs");
const path = require("path");
const os = require("os");

function linkServerMods(serverPath) {
  // Explicitly force /home/ubuntu since we know for a fact that is where the volume/files live
  const baseHome = fs.existsSync("/home/ubuntu")
    ? "/home/ubuntu"
    : os.homedir();
  const workshopDir = path.join(
    baseHome,
    "Steam",
    "steamapps",
    "workshop",
    "content",
    "346110",
  );
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  console.log(`[Mods] Checking workshop directory: ${workshopDir}`);
  if (!fs.existsSync(workshopDir)) {
    console.log(`[Mods] Workshop directory not found at ${workshopDir}`);
    return;
  }

  fs.mkdirSync(targetModsDir, { recursive: true });

  let entries = [];
  try {
    entries = fs.readdirSync(workshopDir, { withFileTypes: true });
  } catch (err) {
    console.error(`[Mods] Failed to read workshop directory:`, err.message);
    return;
  }

  const foundModIds = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name);

  console.log(`[Mods] Found mod folders on disk:`, foundModIds);

  for (const modId of foundModIds) {
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
