const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
console.log("Server is starting...");


const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_mongodb+srv://memegodobit23_db_user:<db_password>@cluster0.npootnz.mongodb.net/?appName=Cluster0);

const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  redditUsername: String,
  karma: Number,
  accountAge: Number,
  verified: Boolean,
  role: { type: String, default: "user" }
});

const TaskSchema = new mongoose.Schema({
  title: String,
  body: String,
  imageUrl: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  claimed: { type: Boolean, default: false },
  completed: { type: Boolean, default: false }
});

const User = mongoose.model("User", UserSchema);
const Task = mongoose.model("Task", TaskSchema);

// Signup
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, email, password: hashed });
  await user.save();
  res.json({ success: true });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Invalid password" });

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.SECRET_KEY);
  res.json({ success: true, token, userId: user._id });
});

// Register Reddit account
app.post("/register-reddit", async (req, res) => {
  const { redditUsername, userId } = req.body;
  try {
    const response = await axios.get(`https://www.reddit.com/user/${redditUsername}/about.json`);
    const data = response.data.data;
    const karma = data.total_karma;
    const created = data.created_utc;
    const accountAgeYears = (Date.now() / 1000 - created) / (60 * 60 * 24 * 365);
    const verified = karma >= 200 && accountAgeYears >= 1;

    const user = await User.findById(userId);
    user.redditUsername = redditUsername;
    user.karma = karma;
    user.accountAge = accountAgeYears;
    user.verified = verified;
    await user.save();

    res.json({ success: true, verified });
  } catch (err) {
    res.status(400).json({ error: "Invalid Reddit username" });
  }
});

// Admin posts a task
app.post("/task", async (req, res) => {
  const { title, body, imageUrl } = req.body;
  const task = new Task({ title, body, imageUrl });
  await task.save();
  res.json({ success: true, task });
});

// User claims a task
app.post("/task/:id/claim", async (req, res) => {
  const { userId } = req.body;
  const task = await Task.findById(req.params.id);
  if (task.claimed) return res.status(400).json({ error: "Task already claimed" });
  task.assignedTo = userId;
  task.claimed = true;
  await task.save();
  res.json({ success: true, task });
});

// User completes a task
app.post("/task/:id/complete", async (req, res) => {
  const task = await Task.findById(req.params.id);
  task.completed = true;
  await task.save();
  res.json({ success: true, task });
});

// Admin progress report
app.get("/progress", async (req, res) => {
  const users = await User.find();
  const report = [];
  for (const user of users) {
    const claimedCount = await Task.countDocuments({ assignedTo: user._id, claimed: true });
    const completedCount = await Task.countDocuments({ assignedTo: user._id, completed: true });
    report.push({ username: user.username, reddit: user.redditUsername, claimed: claimedCount, completed: completedCount });
  }
  res.json(report);
});

// Get all tasks
app.get("/tasks", async (req, res) => {
  const tasks = await Task.find().populate("assignedTo", "username redditUsername");
  res.json(tasks);
});

module.exports = app;


