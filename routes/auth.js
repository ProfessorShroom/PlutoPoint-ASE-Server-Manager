const express = require("express");
const router = express.Router();
const {
  loadUsers,
  saveUsers,
  hashPassword,
  verifyPassword,
  isAuthenticated,
  isAdmin,
} = require("../utils/helpers");

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.username === username);

  if (user && verifyPassword(password, user.password)) {
    req.session.user = { username: user.username, isAdmin: user.isAdmin };
    res.json({ success: true, isAdmin: user.isAdmin });
  } else {
    res
      .status(401)
      .json({ success: false, error: "Invalid username or password" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get("/auth/me", (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

router.get("/users", isAuthenticated, isAdmin, (req, res) => {
  res.json(
    loadUsers().map((u) => ({ username: u.username, isAdmin: u.isAdmin })),
  );
});

router.post("/users", isAuthenticated, isAdmin, (req, res) => {
  const { username, password, isAdminUser } = req.body;
  let users = loadUsers();
  if (users.some((u) => u.username === username))
    return res.status(400).json({ error: "Username already exists" });

  users.push({
    username,
    password: hashPassword(password),
    isAdmin: !!isAdminUser,
  });
  saveUsers(users);
  res.json({ message: "User created successfully!" });
});

router.put("/users/me", isAuthenticated, (req, res) => {
  const { username, password } = req.body;
  let users = loadUsers();
  const userIndex = users.findIndex(
    (u) => u.username === req.session.user.username,
  );
  if (userIndex === -1)
    return res.status(404).json({ error: "User not found." });

  if (username && username !== users[userIndex].username) {
    if (users.some((u) => u.username === username))
      return res.status(400).json({ error: "Username already taken." });
    users[userIndex].username = username;
    req.session.user.username = username;
  }
  if (password) users[userIndex].password = hashPassword(password);

  saveUsers(users);
  res.json({ message: "Account updated successfully!" });
});

module.exports = router;
