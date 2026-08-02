const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

function resolveWriteableDir(defaultDir, fallbackDir) {
  const candidates = [
    defaultDir,
    fallbackDir,
    path.join(os.tmpdir(), "plutopoint-ase-server-manager"),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        fs.mkdirSync(candidate, { recursive: true });
      }
      if (fs.statSync(candidate).isDirectory()) {
        fs.accessSync(candidate, fs.constants.W_OK);
        return candidate;
      }
    } catch (error) {
      // Try the next candidate when the current path is not writable.
    }
  }

  return candidates[candidates.length - 1];
}

const DATA_DIR = resolveWriteableDir(
  process.env.DATA_DIR || "/data",
  path.join(os.homedir(), ".plutopoint-ase-server-manager"),
);
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");
const BACKUP_DIR = resolveWriteableDir(
  process.env.BACKUP_DIR || "/backup",
  path.join(DATA_DIR, "backups"),
);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return hash === originalHash;
}

if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [
    { username: "ark", password: hashPassword("survival"), isAdmin: true },
  ];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

if (!fs.existsSync(SERVERS_FILE)) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify([], null, 2));
}

const activeServers = {};
const serverLogs = {};

function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function loadServers() {
  return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf-8"));
}
function saveServers(servers) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
}

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Unauthorized. Please log in." });
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) return next();
  res.status(403).json({ error: "Forbidden: Admins only." });
}

function getBackups(serverId) {
  const dir = path.join(BACKUP_DIR, serverId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => ({
      file: f,
      time: fs.statSync(path.join(dir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);
}

function createBackup(serverId, callback) {
  const servers = loadServers();
  const server = servers.find((s) => s.id === serverId);
  if (!server) return callback("Server not found");

  const serverBackupDir = path.join(BACKUP_DIR, serverId);
  if (!fs.existsSync(serverBackupDir))
    fs.mkdirSync(serverBackupDir, { recursive: true });

  const targetDir = path.join(server.path, "ShooterGame", "Saved");
  if (!fs.existsSync(targetDir))
    return callback("Server save directory not found.");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(serverBackupDir, `backup_${timestamp}.zip`);

  exec(`cd "${targetDir}" && 7z a -tzip "${backupFile}" "*"`, (error) => {
    if (error) return callback(error.message);

    if (server.backupRetention && server.backupRetention > 0) {
      const backups = getBackups(serverId);
      if (backups.length > server.backupRetention) {
        const toDelete = backups.slice(server.backupRetention);
        toDelete.forEach((b) => {
          try {
            fs.unlinkSync(path.join(serverBackupDir, b.file));
          } catch (e) {}
        });
      }
    }

    server.lastBackup = Date.now();
    saveServers(servers);
    callback(null, backupFile);
  });
}

setInterval(
  () => {
    const servers = loadServers();
    const now = Date.now();
    servers.forEach((server) => {
      if (server.backupFrequency && server.backupFrequency > 0) {
        const msFreq = server.backupFrequency * 60 * 60 * 1000;
        if (!server.lastBackup || now - server.lastBackup >= msFreq) {
          createBackup(server.id, (err) => {
            if (err)
              console.error(`Scheduled backup failed for ${server.id}: ${err}`);
          });
        }
      }
    });
  },
  5 * 60 * 1000,
);

module.exports = {
  loadUsers,
  saveUsers,
  loadServers,
  saveServers,
  isAuthenticated,
  isAdmin,
  hashPassword,
  verifyPassword,
  getBackups,
  createBackup,
  activeServers,
  serverLogs,
  BACKUP_DIR,
};
