const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { syncServerMods, getConfiguredModIds } = require("../utils/mods");

test("syncServerMods creates server-side mod copies from workshop content", () => {
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

  syncServerMods(serverPath, "server-one", workshopRoot);

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
    fs.lstatSync(linkedDir).isDirectory(),
    "expected mod directory to be copied into the server mods folder",
  );
  assert.ok(
    fs.existsSync(linkedModFile),
    "expected .mod file to be copied into the server mods folder",
  );
});

test("syncServerMods resolves workshop content from the server install path", () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mods-server-install-test-"),
  );
  const serverPath = path.join(tempRoot, "server-install");
  const workshopRoot = path.join(
    serverPath,
    "steamapps",
    "workshop",
    "content",
    "346110",
  );
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  fs.mkdirSync(targetModsDir, { recursive: true });
  fs.mkdirSync(path.join(workshopRoot, "33333"), { recursive: true });
  fs.writeFileSync(path.join(workshopRoot, "33333", "mod.info"), "hello");

  syncServerMods(serverPath, "server-install", undefined);

  assert.ok(
    fs.existsSync(path.join(targetModsDir, "33333")),
    "expected workshop mods to be copied from the server install path",
  );
});

test("getConfiguredModIds reads mod IDs from the ARK config", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mods-config-test-"));
  const serverPath = path.join(tempRoot, "server-config");
  const configDir = path.join(
    serverPath,
    "ShooterGame",
    "Saved",
    "Config",
    "LinuxServer",
  );

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "GameUserSettings.ini"),
    "[ServerSettings]\nActiveMods=11111,22222\n",
  );

  assert.equal(getConfiguredModIds(serverPath), "11111,22222");
});

test("syncServerMods resolves workshop content from the current home directory", () => {
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
    syncServerMods(serverPath, "server-two");
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  }

  assert.ok(
    fs.existsSync(path.join(targetModsDir, "99999")),
    "expected workshop mods to be copied from the home-based Steam path",
  );
});

test("syncServerMods resolves workshop content from the Steam client layout", () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mods-steam-client-test-"),
  );
  const serverPath = path.join(tempRoot, "server-steam-client");
  const workshopRoot = path.join(
    tempRoot,
    ".steam",
    "steam",
    "steamapps",
    "workshop",
    "content",
    "346110",
  );
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  fs.mkdirSync(targetModsDir, { recursive: true });
  fs.mkdirSync(path.join(workshopRoot, "22222"), { recursive: true });
  fs.writeFileSync(path.join(workshopRoot, "22222", "mod.info"), "hello");

  const originalHome = process.env.HOME;
  process.env.HOME = tempRoot;

  try {
    syncServerMods(serverPath, "server-steam-client");
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  }

  assert.ok(
    fs.existsSync(path.join(targetModsDir, "22222")),
    "expected workshop mods to be copied from the Steam client layout",
  );
});

test("syncServerModsWithRetries copies mods that appear after the first attempt", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mods-retry-test-"));
  const serverPath = path.join(tempRoot, "server-three");
  const workshopRoot = path.join(tempRoot, "workshop", "346110");
  const targetModsDir = path.join(serverPath, "ShooterGame", "Content", "Mods");

  fs.mkdirSync(targetModsDir, { recursive: true });
  fs.mkdirSync(path.join(workshopRoot, "11111"), { recursive: true });
  fs.writeFileSync(path.join(workshopRoot, "11111", "mod.info"), "hello");

  const { syncServerModsWithRetries } = require("../utils/mods");

  const syncPromise = syncServerModsWithRetries(
    serverPath,
    "server-three",
    workshopRoot,
    {
      attempts: 3,
      retryDelayMs: 25,
    },
  );

  setTimeout(() => {
    fs.writeFileSync(path.join(workshopRoot, "11111.mod"), "mod file");
  }, 20);

  await syncPromise;

  assert.ok(
    fs.existsSync(path.join(targetModsDir, "11111.mod")),
    "expected mod file to be copied after a later retry",
  );
});
