const express = require("express");
const router = express.Router();
const fs = require("fs");
const {
  loadServers,
  saveServers,
  isAuthenticated,
  isAdmin,
  activeServers,
} = require("../utils/helpers");

router.get("/servers", isAuthenticated, (req, res) => {
  res.json(loadServers());
});

router.post("/servers", isAuthenticated, isAdmin, (req, res) => {
  const { name, path: serverPath, autoStart } = req.body;
  let servers = loadServers();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  if (servers.some((s) => s.id === id))
    return res.status(400).json({ error: "Server identifier conflict." });
  if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath, { recursive: true });

  servers.push({ id, name, path: serverPath, autoStart: !!autoStart });
  saveServers(servers);
  res.json({ message: "Server added successfully!" });
});

router.delete("/servers/:serverId", isAuthenticated, isAdmin, (req, res) => {
  let servers = loadServers();
  const serverIndex = servers.findIndex((s) => s.id === req.params.serverId);
  if (serverIndex === -1)
    return res.status(404).json({ error: "Server not found" });

  if (activeServers[req.params.serverId]) {
    try {
      process.kill(activeServers[req.params.serverId], "SIGTERM");
      delete activeServers[req.params.serverId];
    } catch (e) {}
  }

  servers.splice(serverIndex, 1);
  saveServers(servers);
  res.json({ message: "Server deleted successfully." });
});

module.exports = router;
