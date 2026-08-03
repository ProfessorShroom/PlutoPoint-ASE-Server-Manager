const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildStartupArgs,
  prepareSteamRuntime,
} = require("../utils/server-launch");

test("buildStartupArgs adds mod IDs and disables BattlEye", () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "server-launch-test-"),
  );
  const serverPath = path.join(tempRoot, "server-one");
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
    "[ServerSettings]\nActiveMods=1404697612,2820647244\n",
  );

  const { launchArgs, serverArgs } = buildStartupArgs(serverPath, "My Server");

  assert.equal(
    launchArgs,
    "TheIsland?listen?SessionName=My Server?RCONEnabled=True?RCONPort=27020?GameModIds=1404697612,2820647244",
  );
  assert.deepEqual(serverArgs, [
    launchArgs,
    "-server",
    "-log",
    "-usecache",
    "-NoBattlEye",
  ]);
});

test("prepareSteamRuntime creates runtime links for the server launch environment", () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "steam-runtime-test-"),
  );
  const serverPath = path.join(tempRoot, "server-two");
  const runtimeRoot = path.join(tempRoot, "steam-runtime");
  const runtimeLibDir = path.join(runtimeRoot, "linux64");

  fs.mkdirSync(runtimeLibDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeLibDir, "steamclient.so"), "fake");

  const prepared = prepareSteamRuntime(serverPath, {
    runtimeRoots: [runtimeRoot],
  });

  const expectedLinkPath = path.join(
    serverPath,
    "Engine",
    "Binaries",
    "ThirdParty",
    "SteamCMD",
    "Linux64",
  );

  assert.equal(prepared.runtimeDir, runtimeLibDir);
  assert.equal(fs.existsSync(expectedLinkPath), true);
  assert.equal(fs.realpathSync(expectedLinkPath), runtimeLibDir);
  assert.ok((prepared.env.LD_LIBRARY_PATH || "").includes(runtimeLibDir));
});
