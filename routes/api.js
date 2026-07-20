const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authMiddleware, adminMiddleware, assertUserAccess } = require('../middleware/auth');

router.use(authMiddleware);

function resolveUserId(req) {
  return req.user.id;
}

// Get daily wellness logs
router.get('/wellness/:userId', async (req, res) => {
  if (!assertUserAccess(req, res, req.params.userId)) return;

  try {
    const [rows] = await db.query(
      'SELECT * FROM daily_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 7',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log daily metrics (Water, Sleep, Exercise)
router.post('/log', async (req, res) => {
  const { userId, water_ml, sleep_hours, exercise_min } = req.body;

  if (!assertUserAccess(req, res, userId)) return;

  const today = new Date().toISOString().split('T')[0];

  try {
    const [existing] = await db.query(
      'SELECT id, water_ml, sleep_hours, exercise_min FROM daily_logs WHERE user_id = ? AND log_date = ?',
      [userId, today]
    );

    if (existing.length > 0) {
      const current = existing[0];
      await db.query(
        `UPDATE daily_logs SET
          water_ml = ?,
          sleep_hours = ?,
          exercise_min = ?
         WHERE id = ?`,
        [
          (current.water_ml || 0) + (water_ml || 0),
          sleep_hours != null ? sleep_hours : current.sleep_hours,
          exercise_min != null ? (current.exercise_min || 0) + exercise_min : current.exercise_min,
          current.id
        ]
      );
    } else {
      await db.query(
        'INSERT INTO daily_logs (user_id, water_ml, sleep_hours, exercise_min, log_date) VALUES (?, ?, ?, ?, ?)',
        [userId, water_ml || 0, sleep_hours || 0, exercise_min || 0, today]
      );
    }
    res.json({ success: true, message: 'Log updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get mood logs
router.get('/mood/:userId', async (req, res) => {
  if (!assertUserAccess(req, res, req.params.userId)) return;

  try {
    const [rows] = await db.query(
      'SELECT * FROM mood_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC LIMIT 7',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log Mood & Stress
router.post('/mood', async (req, res) => {
  const { userId, mood_level, stress_level, note } = req.body;

  if (!assertUserAccess(req, res, userId)) return;

  try {
    await db.query(
      'INSERT INTO mood_logs (user_id, mood_level, stress_level, note) VALUES (?, ?, ?, ?)',
      [userId, mood_level, stress_level, note || null]
    );
    res.json({ success: true, message: 'Mood logged successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Meals
router.get('/meals/:userId', async (req, res) => {
  if (!assertUserAccess(req, res, req.params.userId)) return;

  try {
    const [rows] = await db.query(
      'SELECT * FROM meal_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC LIMIT 20',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/meals', async (req, res) => {
  const { userId, meal_type, description, calories } = req.body;

  if (!assertUserAccess(req, res, userId)) return;

  try {
    await db.query(
      'INSERT INTO meal_logs (user_id, meal_type, description, calories) VALUES (?, ?, ?, ?)',
      [userId, meal_type, description, calories || 0]
    );
    res.json({ success: true, message: 'Meal logged successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reminders
router.get('/reminders/:userId', async (req, res) => {
  if (!assertUserAccess(req, res, req.params.userId)) return;

  try {
    const [rows] = await db.query(
      'SELECT * FROM reminders WHERE user_id = ? ORDER BY reminder_time ASC',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reminders', async (req, res) => {
  const { userId, title, reminder_time, reminder_type } = req.body;

  if (!assertUserAccess(req, res, userId)) return;

  try {
    const [result] = await db.query(
      'INSERT INTO reminders (user_id, title, reminder_time, reminder_type) VALUES (?, ?, ?, ?)',
      [userId, title, reminder_time, reminder_type || 'other']
    );
    res.status(201).json({ success: true, id: result.insertId, message: 'Reminder created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/reminders/:id', async (req, res) => {
  const { userId, title, reminder_time, reminder_type, is_active } = req.body;

  try {
    const [existing] = await db.query('SELECT user_id FROM reminders WHERE id = ?', [req.params.id]);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (!assertUserAccess(req, res, existing[0].user_id)) return;

    await db.query(
      `UPDATE reminders SET
        title = COALESCE(?, title),
        reminder_time = COALESCE(?, reminder_time),
        reminder_type = COALESCE(?, reminder_type),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [title, reminder_time, reminder_type, is_active, req.params.id]
    );
    res.json({ success: true, message: 'Reminder updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/reminders/:id', async (req, res) => {
  try {
    const [existing] = await db.query('SELECT user_id FROM reminders WHERE id = ?', [req.params.id]);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (!assertUserAccess(req, res, existing[0].user_id)) return;

    await db.query('DELETE FROM reminders WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Reminder deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate Weekly Report
router.get('/report/:userId', async (req, res) => {
  if (!assertUserAccess(req, res, req.params.userId)) return;

  try {
    const [stats] = await db.query(
      `SELECT
        AVG(water_ml) as avg_water,
        AVG(sleep_hours) as avg_sleep,
        AVG(exercise_min) as avg_exercise
       FROM daily_logs
       WHERE user_id = ? AND log_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [req.params.userId]
    );

    const [moodStats] = await db.query(
      `SELECT
        AVG(mood_level) as avg_mood,
        AVG(stress_level) as avg_stress
       FROM mood_logs
       WHERE user_id = ? AND log_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [req.params.userId]
    );

    const [mealStats] = await db.query(
      `SELECT SUM(calories) as total_calories, COUNT(*) as meal_count
       FROM meal_logs
       WHERE user_id = ? AND log_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [req.params.userId]
    );

    res.json({
      ...stats[0],
      ...moodStats[0],
      ...mealStats[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// BROADCAST ANNOUNCEMENTS (Accessed by both users and admins)
// =========================================================================

// Get active broadcast banner message
router.get('/broadcasts', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM broadcasts');
    res.json(rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// ADMIN ONLY ROUTES
// =========================================================================

// Get platform-wide aggregate stats
router.get('/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const [[{ total_users }]] = await db.query('SELECT COUNT(*) as total_users FROM users');
    const [[{ total_logs }]] = await db.query('SELECT COUNT(*) as total_logs FROM daily_logs');
    const [[{ total_meals }]] = await db.query('SELECT COUNT(*) as total_meals FROM meal_logs');
    const [[{ total_reminders }]] = await db.query('SELECT COUNT(*) as total_reminders FROM reminders');
    
    const [averages] = await db.query(
      'SELECT AVG(water_ml) as avg_water, AVG(sleep_hours) as avg_sleep, AVG(exercise_min) as avg_exercise FROM daily_logs'
    );

    res.json({
      total_users,
      total_logs,
      total_meals,
      total_reminders,
      avg_water: averages[0]?.avg_water || 0,
      avg_sleep: averages[0]?.avg_sleep || 0,
      avg_exercise: averages[0]?.avg_exercise || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of all users
router.get('/admin/users', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, email, role, created_at FROM users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change user role
router.post('/admin/users/:userId/role', adminMiddleware, async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.userId]);
    res.json({ success: true, message: 'User role updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user entirely
router.delete('/admin/users/:userId', adminMiddleware, async (req, res) => {
  try {
    if (Number(req.params.userId) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.userId]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set global broadcast banner
router.post('/admin/broadcast', adminMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Announcement message is required.' });
  }
  try {
    await db.query('DELETE FROM broadcasts'); // clear old broadcast first
    await db.query('INSERT INTO broadcasts (message) VALUES (?)', [message.trim()]);
    res.json({ success: true, message: 'Announcement broadcasted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear global broadcast banner
router.delete('/admin/broadcast', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM broadcasts');
    res.json({ success: true, message: 'Broadcast banner cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
