const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { linkServerMods } = require("../utils/mods");

test("linkServerMods creates server-side mod links from workshop content", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mods-test-"));
  const serverPath = path.join(tempRoot, "server-one");
  const workshopRoot = path.join(tempRoot, "workshop", "346110");
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  fs.mkdirSync(path.join(serverPath, "ShooterGame", "Content", "Mods"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workshopRoot, "12345"), { recursive: true });
  fs.mkdirSync(path.join(workshopRoot, "67890"), { recursive: true });
  fs.writeFileSync(path.join(workshopRoot, "12345", "mod.info"), "hello");
  fs.writeFileSync(path.join(workshopRoot, "67890", "mod.info"), "world");
  fs.writeFileSync(path.join(workshopRoot, "12345.mod"), "mod file");

  linkServerMods(serverPath, "server-one", workshopRoot);

  const linkedDir = path.join(targetModsDir, "12345");
  const linkedModFile = path.join(targetModsDir, "12345.mod");

  assert.ok(
    fs.existsSync(linkedDir),
    "expected mod directory to exist in server mods folder",
  );
  assert.ok(
    fs.existsSync(linkedModFile),
    "expected .mod file to exist in server mods folder",
  );
  assert.ok(
    fs.lstatSync(linkedDir).isSymbolicLink(),
    "expected mod directory to be a symlink",
  );
  assert.ok(
    fs.lstatSync(linkedModFile).isSymbolicLink(),
    "expected .mod file to be a symlink",
  );
});

test("linkServerMods resolves workshop content from the current home directory", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mods-home-test-"));
  const serverPath = path.join(tempRoot, "server-two");
  const workshopRoot = path.join(
    tempRoot,
    "Steam",
    "steamapps",
    "workshop",
    "content",
    "346110",
  );
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  fs.mkdirSync(path.join(serverPath, "ShooterGame", "Content", "Mods"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workshopRoot, "99999"), { recursive: true });
  fs.writeFileSync(path.join(workshopRoot, "99999", "mod.info"), "hello");
  fs.writeFileSync(path.join(workshopRoot, "99999.mod"), "mod file");

  const originalHome = process.env.HOME;
  process.env.HOME = tempRoot;

  try {
    linkServerMods(serverPath, "server-two");
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  }

  assert.ok(
    fs.existsSync(path.join(targetModsDir, "99999")),
    "expected workshop mods to be linked from the home-based Steam path",
  );
});
