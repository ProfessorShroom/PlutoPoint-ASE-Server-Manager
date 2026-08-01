const fs = require("fs");
const path = (path = require("path"));
const { exec } = require("child_process");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || "/data";
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");
const BACKUP_DIR = process.env.BACKUP_DIR || "/backup";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

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
