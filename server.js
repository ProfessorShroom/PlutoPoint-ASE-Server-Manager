const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/auth");
const serverRoutes = require("./routes/servers");
const controlRoutes = require("./routes/control");
const backupRoutes = require("./routes/backup");
const settingRoutes = require("./routes/settings");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "ark-manager-super-secret-key",
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(express.static("public"));

// Register Modular API Endpoints
app.use("/api", authRoutes);
app.use("/api", serverRoutes);
app.use("/api", controlRoutes);
app.use("/api", backupRoutes);
app.use("/api", settingRoutes);

const PORT = process.env.PORT || 3000;

function startServer() {
  return app.listen(PORT, () => {
    console.log(`ARK Manager server running on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
