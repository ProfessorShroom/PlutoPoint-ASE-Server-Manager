const fs = require("fs");
const path = require("path");

function linkServerMods(serverPath) {
  if (!serverPath) return;

  const absServerPath = path.resolve(serverPath);
  const workshopDir = "/home/ubuntu/Steam/steamapps/workshop/content/346110";
  const targetModsDir = path.join(
    absServerPath,
    "ShooterGame",
    "Content",
    "Mods",
  );

  console.log(
    `[Mods] Copying workshop mods for server: ${path.basename(absServerPath)}`,
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
      // Recursively copy the mod folder instead of symlinking
      if (fs.existsSync(sourceFolder)) {
        fs.cpSync(sourceFolder, targetFolder, { recursive: true, force: true });
        console.log(
          `[Mods] Copied mod folder ${modId} to ${path.basename(absServerPath)}`,
        );
      }

      // Copy the .mod file if it exists
      if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, targetFile);
        console.log(
          `[Mods] Copied mod file ${modId}.mod to ${path.basename(absServerPath)}`,
        );
      }
    } catch (err) {
      console.error(`[Mods] Failed to copy mod ${modId}:`, err.message);
    }
  }
}

module.exports = { linkServerMods };
