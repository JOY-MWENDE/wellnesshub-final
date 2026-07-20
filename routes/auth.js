const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authMiddleware, signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
      [email, username]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email or username already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    const user = { id: result.insertId, username, email, role: 'user' };
    const token = signToken(user);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user
    });
  } catch (error) {
    console.log("=========================================");
    console.log("RAW REGISTRATION ERROR DETECTED:");
    console.log(error);
    console.log("=========================================");
    res.status(500).json({ error: error.message || String(error) || "Opaque Object Error" });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, username, email, password, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user' }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;