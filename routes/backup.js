const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const {
  loadServers,
  isAuthenticated,
  isAdmin,
  getBackups,
  createBackup,
  activeServers,
  BACKUP_DIR,
} = require("../utils/helpers");

router.get("/backups/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.json({
    backups: getBackups(server.id),
    frequency: server.backupFrequency || 0,
    retention: server.backupRetention || 0,
  });
});

router.post("/backups/:serverId", isAuthenticated, isAdmin, (req, res) => {
  createBackup(req.params.serverId, (err, file) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "Backup created successfully", file });
  });
});

router.post(
  "/backups/:serverId/restore",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const { file } = req.body;
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (activeServers[server.id]) {
      return res
        .status(400)
        .json({ error: "Server must be stopped before restoring a backup." });
    }

    const backupPath = path.join(BACKUP_DIR, server.id, file);
    if (!fs.existsSync(backupPath))
      return res.status(404).json({ error: "Backup file not found." });

    const targetDir = path.join(server.path, "ShooterGame", "Saved");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    exec(`7z x -aoa -o"${targetDir}" "${backupPath}"`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Backup restored successfully!" });
    });
  },
);

router.delete(
  "/backups/:serverId/:file",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const backupPath = path.join(
      BACKUP_DIR,
      req.params.serverId,
      req.params.file,
    );
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    res.json({ message: "Backup deleted" });
  },
);

router.post(
  "/backups/:serverId/settings",
  isAuthenticated,
  isAdmin,
  (req, res) => {
    const { frequency, retention } = req.body;
    let servers = loadServers();
    let server = servers.find((s) => s.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    server.backupFrequency = parseFloat(frequency) || 0;
    server.backupRetention = parseInt(retention, 10) || 0;
    saveServers(servers);
    res.json({ message: "Backup schedule updated!" });
  },
);

module.exports = router;
