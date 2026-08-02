const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildStartupArgs } = require("../utils/server-launch");

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
    "-automanagedmods",
    "-server",
    "-log",
    "-usecache",
    "-NoBattlEye",
  ]);
});
