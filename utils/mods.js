const fs = require("fs");
const path = require("path");

function linkServerMods(serverPath) {
  const absServerPath = path.resolve(serverPath);
  const workshopDir = "/home/ubuntu/Steam/steamapps/workshop/content/346110";
  const targetModsDir = path.join(
    absServerPath,
    "ShooterGame",
    "Content",
    "Mods",
  );

  console.log(
    `[Mods] Forcing symlinks from ${workshopDir} to ${targetModsDir}`,
  );

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
      if (fs.existsSync(targetFolder)) {
        fs.rmSync(targetFolder, { recursive: true, force: true });
      }
      fs.symlinkSync(sourceFolder, targetFolder, "dir");
      console.log(`[Mods] Successfully symlinked mod folder: ${modId}`);
    } catch (err) {
      console.error(
        `[Mods] Failed to symlink mod folder ${modId}:`,
        err.message,
      );
    }

    if (fs.existsSync(sourceFile)) {
      try {
        if (fs.existsSync(targetFile)) {
          fs.rmSync(targetFile, { force: true });
        }
        fs.symlinkSync(sourceFile, targetFile, "file");
        console.log(`[Mods] Successfully symlinked mod file: ${modId}.mod`);
      } catch (err) {
        console.error(
          `[Mods] Failed to symlink mod file ${modId}.mod:`,
          err.message,
        );
      }
    }
  }
}

module.exports = { linkServerMods };
