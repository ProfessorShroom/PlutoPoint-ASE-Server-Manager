const fs = require("fs");
const path = require("path");

function linkServerMods(
  serverPath,
  serverName = "server",
  workshopDir = "/home/ubuntu/Steam/steamapps/workshop/content/346110",
) {
  if (!serverPath) return;

  const absServerPath = path.resolve(serverPath);
  const targetModsDir = path.join(
    absServerPath,
    "ShooterGame",
    "Content",
    "Mods",
  );

  console.log(
    `[Mods] Synchronizing workshop mods for server: ${serverName} (${path.basename(absServerPath)})`,
  );

  if (!fs.existsSync(workshopDir)) {
    console.log(`[Mods] Workshop directory not found at ${workshopDir}`);
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

  let entries;
  try {
    entries = fs.readdirSync(workshopDir, { withFileTypes: true });
  } catch (err) {
    console.error(`[Mods] Failed to read workshop directory:`, err.message);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

    const modId = entry.name;
    const sourceFolder = path.join(workshopDir, modId);
    const targetFolder = path.join(targetModsDir, modId);
    const sourceFile = path.join(workshopDir, `${modId}.mod`);
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
