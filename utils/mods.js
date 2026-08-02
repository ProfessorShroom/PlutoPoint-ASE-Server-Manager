const fs = require("fs");
const path = require("path");
const ini = require("ini");

function linkServerMods(serverPath) {
  const workshopDir = "/home/ubuntu/Steam/steamapps/workshop/content/346110";
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  console.log(`[Mods] Checking workshop directory: ${workshopDir}`);
  if (!fs.existsSync(workshopDir)) {
    console.log(`[Mods] Workshop directory not found at ${workshopDir}`);
    return;
  }

  fs.mkdirSync(targetModsDir, { recursive: true });

  // Read all subfolders/files present in the workshop content directory
  let entries = [];
  try {
    entries = fs.readdirSync(workshopDir, { withFileTypes: true });
  } catch (err) {
    console.error(`[Mods] Failed to read workshop directory:`, err.message);
    return;
  }

  // Filter out numeric mod IDs that are actually present on disk
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
      // 1. Link the mod directory
      if (fs.existsSync(sourceFolder)) {
        if (fs.existsSync(targetFolder)) {
          fs.rmSync(targetFolder, { recursive: true, force: true });
        }
        fs.symlinkSync(sourceFolder, targetFolder, "dir");
        console.log(`[Mods] Successfully linked mod folder: ${modId}`);
      }

      // 2. Link the corresponding .mod file if it exists
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
