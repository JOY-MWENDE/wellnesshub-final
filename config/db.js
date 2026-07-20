const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_FILE = path.join(process.cwd(), 'db_persist.json');

// Initialize database storage
let storage = {
  users: [],
  daily_logs: [],
  mood_logs: [],
  meal_logs: [],
  reminders: [],
  broadcasts: []
};

// Helper to save database to disk
function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(storage, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save in-memory database:', err);
  }
}

// Helper to load database from disk
function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      storage = JSON.parse(data);
      if (!storage.broadcasts) {
        storage.broadcasts = [];
      }
    }
  } catch (err) {
    console.warn('Failed to load in-memory database, starting fresh:', err);
  }
}

loadDb();

// Ensure roles exist for all users & guarantee admin exists
let hasChanges = false;
storage.users.forEach(u => {
  if (!u.role) {
    u.role = 'user';
    hasChanges = true;
  }
});

const defaultAdminPasswordHash = bcrypt.hashSync('password', 10);

// We want both admin@wellnesshub.com and admin@gmail.com to be available as admin with 'password'
const targetAdmins = [
  { email: 'admin@wellnesshub.com', username: 'admin_user' },
  { email: 'admin@gmail.com', username: 'admin' }
];

targetAdmins.forEach(target => {
  const existingUserIdx = storage.users.findIndex(u => u.email === target.email);
  if (existingUserIdx !== -1) {
    // If user exists, make sure they have the admin role and correct password hash
    const user = storage.users[existingUserIdx];
    if (user.role !== 'admin' || user.password !== defaultAdminPasswordHash) {
      user.role = 'admin';
      user.password = defaultAdminPasswordHash;
      hasChanges = true;
    }
  } else {
    // If not, create them
    const maxId = storage.users.length > 0 ? Math.max(...storage.users.map(u => u.id)) : 0;
    storage.users.push({
      id: maxId + 1,
      username: target.username,
      email: target.email,
      password: defaultAdminPasswordHash,
      role: 'admin',
      created_at: new Date()
    });
    hasChanges = true;
  }
});

if (!storage.broadcasts || storage.broadcasts.length === 0) {
  storage.broadcasts = [{
    id: 1,
    message: 'Welcome to WellnessHub! Drink water and keep moving today! 🌟',
    created_at: new Date()
  }];
  hasChanges = true;
}

if (hasChanges) {
  saveDb();
}

// Custom mock pool to mimic mysql2 promise pool
const mockPool = {
  query: async function(sql, params = []) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    
    // -----------------------------------------
    // USERS TABLE QUERIES
    // -----------------------------------------
    
    // Query 1: SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1
    if (cleanSql.match(/SELECT\s+id\s+FROM\s+users\s+WHERE\s+email\s*=\s*\?\s*OR\s*username\s*=\s*\?\s*LIMIT\s+1/i)) {
      const [email, username] = params;
      const found = storage.users.find(u => u.email === email || u.username === username);
      return [found ? [{ id: found.id }] : [], []];
    }
    
    // Query 2: SELECT id, username, email, password FROM users WHERE email = ? LIMIT 1 (supporting role fetching too)
    if (cleanSql.match(/SELECT\s+id,\s*username,\s*email,\s*password(?:,\s*role)?\s+FROM\s+users\s+WHERE\s+email\s*=\s*\?\s*LIMIT\s+1/i)) {
      const [email] = params;
      const found = storage.users.find(u => u.email === email);
      return [found ? [found] : [], []];
    }
    
    // Query 3: SELECT id, username, email, created_at FROM users WHERE id = ? LIMIT 1 (supporting role fetching too)
    if (cleanSql.match(/SELECT\s+id,\s*username,\s*email,\s*created_at(?:,\s*role)?\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?\s*LIMIT\s+1/i)) {
      const [userId] = params;
      const found = storage.users.find(u => u.id === Number(userId));
      return [found ? [found] : [], []];
    }
    
    // Query 4: INSERT INTO users (username, email, password) VALUES (?, ?, ?)
    if (cleanSql.match(/INSERT\s+INTO\s+users/i)) {
      const [username, email, hashedPassword] = params;
      const newId = storage.users.length > 0 ? Math.max(...storage.users.map(u => u.id)) + 1 : 1;
      const newUser = {
        id: newId,
        username,
        email,
        password: hashedPassword,
        role: 'user', // default new signups as user role
        created_at: new Date()
      };
      storage.users.push(newUser);
      saveDb();
      return [{ insertId: newId, affectedRows: 1 }, []];
    }

    // Query: GET ALL USERS (for user management)
    if (cleanSql.match(/SELECT\s+id,\s*username,\s*email,\s*role,\s*created_at\s+FROM\s+users/i)) {
      const result = storage.users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role || 'user',
        created_at: u.created_at
      })).sort((a, b) => b.id - a.id);
      return [result, []];
    }

    // Query: UPDATE USER ROLE
    if (cleanSql.match(/UPDATE\s+users\s+SET\s+role\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i)) {
      const [role, id] = params;
      const idx = storage.users.findIndex(u => u.id === Number(id));
      if (idx !== -1) {
        storage.users[idx].role = role;
        saveDb();
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }

    // Query: DELETE USER
    if (cleanSql.match(/DELETE\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i)) {
      const [id] = params;
      const userId = Number(id);
      const idx = storage.users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        storage.users.splice(idx, 1);
        // Cascade delete other tables
        storage.daily_logs = storage.daily_logs.filter(l => l.user_id !== userId);
        storage.mood_logs = storage.mood_logs.filter(l => l.user_id !== userId);
        storage.meal_logs = storage.meal_logs.filter(l => l.user_id !== userId);
        storage.reminders = storage.reminders.filter(r => r.user_id !== userId);
        saveDb();
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
    
    // -----------------------------------------
    // DAILY LOGS TABLE QUERIES
    // -----------------------------------------
    
    // Query 5: SELECT * FROM daily_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 7
    if (cleanSql.match(/SELECT\s+\*\s+FROM\s+daily_logs\s+WHERE\s+user_id\s*=\s*\?\s*ORDER\s+BY\s+log_date\s+DESC\s+LIMIT\s+7/i)) {
      const [userId] = params;
      const logs = storage.daily_logs
        .filter(l => l.user_id === Number(userId))
        .sort((a, b) => new Date(b.log_date) - new Date(a.log_date))
        .slice(0, 7);
      return [logs, []];
    }
    
    // Query 6: SELECT id, water_ml, sleep_hours, exercise_min FROM daily_logs WHERE user_id = ? AND log_date = ?
    if (cleanSql.match(/SELECT\s+id,\s*water_ml,\s*sleep_hours,\s*exercise_min\s+FROM\s+daily_logs\s+WHERE\s+user_id\s*=\s*\?\s*AND\s+log_date\s*=\s*\?/i)) {
      const [userId, logDate] = params;
      const found = storage.daily_logs.find(l => l.user_id === Number(userId) && l.log_date === logDate);
      return [found ? [found] : [], []];
    }
    
    // Query 7: UPDATE daily_logs SET water_ml = ?, sleep_hours = ?, exercise_min = ? WHERE id = ?
    if (cleanSql.match(/UPDATE\s+daily_logs\s+SET/i)) {
      const [water, sleep, exercise, id] = params;
      const idx = storage.daily_logs.findIndex(l => l.id === Number(id));
      if (idx !== -1) {
        storage.daily_logs[idx].water_ml = water;
        storage.daily_logs[idx].sleep_hours = sleep;
        storage.daily_logs[idx].exercise_min = exercise;
        saveDb();
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
    
    // Query 8: INSERT INTO daily_logs (user_id, water_ml, sleep_hours, exercise_min, log_date) VALUES (?, ?, ?, ?, ?)
    if (cleanSql.match(/INSERT\s+INTO\s+daily_logs/i)) {
      const [userId, water_ml, sleep_hours, exercise_min, log_date] = params;
      const newId = storage.daily_logs.length > 0 ? Math.max(...storage.daily_logs.map(l => l.id)) + 1 : 1;
      const newLog = {
        id: newId,
        user_id: Number(userId),
        water_ml: Number(water_ml || 0),
        sleep_hours: Number(sleep_hours || 0),
        exercise_min: Number(exercise_min || 0),
        log_date: log_date || new Date().toISOString().split('T')[0]
      };
      storage.daily_logs.push(newLog);
      saveDb();
      return [{ insertId: newId, affectedRows: 1 }, []];
    }
    
    // -----------------------------------------
    // MOOD LOGS TABLE QUERIES
    // -----------------------------------------
    
    // Query 9: SELECT * FROM mood_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC LIMIT 7
    if (cleanSql.match(/SELECT\s+\*\s+FROM\s+mood_logs\s+WHERE\s+user_id\s*=\s*\?\s*ORDER\s+BY\s+log_date\s+DESC\s*,\s*id\s+DESC\s+LIMIT\s+7/i)) {
      const [userId] = params;
      const logs = storage.mood_logs
        .filter(l => l.user_id === Number(userId))
        .sort((a, b) => new Date(b.log_date) - new Date(a.log_date) || b.id - a.id)
        .slice(0, 7);
      return [logs, []];
    }
    
    // Query 10: INSERT INTO mood_logs (user_id, mood_level, stress_level, note) VALUES (?, ?, ?, ?)
    if (cleanSql.match(/INSERT\s+INTO\s+mood_logs/i)) {
      const [userId, mood_level, stress_level, note] = params;
      const newId = storage.mood_logs.length > 0 ? Math.max(...storage.mood_logs.map(l => l.id)) + 1 : 1;
      const newLog = {
        id: newId,
        user_id: Number(userId),
        mood_level: Number(mood_level),
        stress_level: Number(stress_level),
        note,
        log_date: new Date().toISOString().split('T')[0]
      };
      storage.mood_logs.push(newLog);
      saveDb();
      return [{ insertId: newId, affectedRows: 1 }, []];
    }
    
    // -----------------------------------------
    // MEAL LOGS TABLE QUERIES
    // -----------------------------------------
    
    // Query 11: SELECT * FROM meal_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC LIMIT 20
    if (cleanSql.match(/SELECT\s+\*\s+FROM\s+meal_logs\s+WHERE\s+user_id\s*=\s*\?\s*ORDER\s+BY\s+log_date\s+DESC\s*,\s*id\s+DESC\s+LIMIT\s+20/i)) {
      const [userId] = params;
      const logs = storage.meal_logs
        .filter(l => l.user_id === Number(userId))
        .sort((a, b) => new Date(b.log_date) - new Date(a.log_date) || b.id - a.id)
        .slice(0, 20);
      return [logs, []];
    }
    
    // Query 12: INSERT INTO meal_logs (user_id, meal_type, description, calories) VALUES (?, ?, ?, ?)
    if (cleanSql.match(/INSERT\s+INTO\s+meal_logs/i)) {
      const [userId, meal_type, description, calories] = params;
      const newId = storage.meal_logs.length > 0 ? Math.max(...storage.meal_logs.map(l => l.id)) + 1 : 1;
      const newLog = {
        id: newId,
        user_id: Number(userId),
        meal_type,
        description,
        calories: Number(calories || 0),
        log_date: new Date().toISOString().split('T')[0],
        created_at: new Date()
      };
      storage.meal_logs.push(newLog);
      saveDb();
      return [{ insertId: newId, affectedRows: 1 }, []];
    }
    
    // -----------------------------------------
    // REMINDERS TABLE QUERIES
    // -----------------------------------------
    
    // Query 13: SELECT * FROM reminders WHERE user_id = ? ORDER BY reminder_time ASC
    if (cleanSql.match(/SELECT\s+\*\s+FROM\s+reminders\s+WHERE\s+user_id\s*=\s*\?\s*ORDER\s+BY\s+reminder_time\s+ASC/i)) {
      const [userId] = params;
      const reminders = storage.reminders
        .filter(r => r.user_id === Number(userId))
        .sort((a, b) => a.reminder_time.localeCompare(b.reminder_time));
      return [reminders, []];
    }
    
    // Query 14: SELECT user_id FROM reminders WHERE id = ?
    if (cleanSql.match(/SELECT\s+user_id\s+FROM\s+reminders\s+WHERE\s+id\s*=\s*\?/i)) {
      const [id] = params;
      const found = storage.reminders.find(r => r.id === Number(id));
      return [found ? [{ user_id: found.user_id }] : [], []];
    }
    
    // Query 15: INSERT INTO reminders (user_id, title, reminder_time, reminder_type) VALUES (?, ?, ?, ?)
    if (cleanSql.match(/INSERT\s+INTO\s+reminders/i)) {
      const [userId, title, reminder_time, reminder_type] = params;
      const newId = storage.reminders.length > 0 ? Math.max(...storage.reminders.map(r => r.id)) + 1 : 1;
      const newReminder = {
        id: newId,
        user_id: Number(userId),
        title,
        reminder_time,
        reminder_type: reminder_type || 'other',
        is_active: 1
      };
      storage.reminders.push(newReminder);
      saveDb();
      return [{ insertId: newId, affectedRows: 1 }, []];
    }
    
    // Query 16: UPDATE reminders SET title = COALESCE(?, title), reminder_time = COALESCE(?, reminder_time), reminder_type = COALESCE(?, reminder_type), is_active = COALESCE(?, is_active) WHERE id = ?
    if (cleanSql.match(/UPDATE\s+reminders\s+SET/i)) {
      const [title, reminder_time, reminder_type, is_active, id] = params;
      const idx = storage.reminders.findIndex(r => r.id === Number(id));
      if (idx !== -1) {
        if (title !== undefined && title !== null) storage.reminders[idx].title = title;
        if (reminder_time !== undefined && reminder_time !== null) storage.reminders[idx].reminder_time = reminder_time;
        if (reminder_type !== undefined && reminder_type !== null) storage.reminders[idx].reminder_type = reminder_type;
        if (is_active !== undefined && is_active !== null) storage.reminders[idx].is_active = Number(is_active);
        saveDb();
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
    
    // Query 17: DELETE FROM reminders WHERE id = ?
    if (cleanSql.match(/DELETE\s+FROM\s+reminders\s+WHERE\s+id\s*=\s*\?/i)) {
      const [id] = params;
      const idx = storage.reminders.findIndex(r => r.id === Number(id));
      if (idx !== -1) {
        storage.reminders.splice(idx, 1);
        saveDb();
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 0 }, []];
    }
    
    // -----------------------------------------
    // REPORTS & STATS QUERIES
    // -----------------------------------------
    
    // Query 18: AVG(water_ml) as avg_water, AVG(sleep_hours) as avg_sleep, AVG(exercise_min) as avg_exercise FROM daily_logs
    if (cleanSql.match(/AVG\(water_ml\)\s+as\s+avg_water/i)) {
      const [userId] = params;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const filtered = storage.daily_logs.filter(l => l.user_id === Number(userId) && new Date(l.log_date) >= sevenDaysAgo);
      
      if (filtered.length === 0) {
        return [[{ avg_water: 0, avg_sleep: 0, avg_exercise: 0 }], []];
      }
      
      const sumWater = filtered.reduce((sum, l) => sum + (l.water_ml || 0), 0);
      const sumSleep = filtered.reduce((sum, l) => sum + (l.sleep_hours || 0), 0);
      const sumExercise = filtered.reduce((sum, l) => sum + (l.exercise_min || 0), 0);
      
      return [[{
        avg_water: sumWater / filtered.length,
        avg_sleep: sumSleep / filtered.length,
        avg_exercise: sumExercise / filtered.length
      }], []];
    }
    
    // Query 19: AVG(mood_level) as avg_mood, AVG(stress_level) as avg_stress FROM mood_logs
    if (cleanSql.match(/AVG\(mood_level\)\s+as\s+avg_mood/i)) {
      const [userId] = params;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const filtered = storage.mood_logs.filter(l => l.user_id === Number(userId) && new Date(l.log_date) >= sevenDaysAgo);
      
      if (filtered.length === 0) {
        return [[{ avg_mood: null, avg_stress: null }], []];
      }
      
      const sumMood = filtered.reduce((sum, l) => sum + (l.mood_level || 0), 0);
      const sumStress = filtered.reduce((sum, l) => sum + (l.stress_level || 0), 0);
      
      return [[{
        avg_mood: sumMood / filtered.length,
        avg_stress: sumStress / filtered.length
      }], []];
    }
    
    // Query 20: SUM(calories) as total_calories, COUNT(*) as meal_count FROM meal_logs
    if (cleanSql.match(/SUM\(calories\)\s+as\s+total_calories/i)) {
      const [userId] = params;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const filtered = storage.meal_logs.filter(l => l.user_id === Number(userId) && new Date(l.log_date) >= sevenDaysAgo);
      
      const total_calories = filtered.reduce((sum, l) => sum + (l.calories || 0), 0);
      
      return [[{
        total_calories: total_calories,
        meal_count: filtered.length
      }], []];
    }

    // Query 21: Count generic helper (total stats for admin)
    if (cleanSql.match(/SELECT\s+COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)/i)) {
      const match = cleanSql.match(/SELECT\s+COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)/i);
      const label = match[1];
      const table = match[2];
      const count = storage[table] ? storage[table].length : 0;
      return [[{ [label]: count }], []];
    }

    // Query 22: Platform averages helper for admin dashboard
    if (cleanSql.match(/SELECT\s+AVG\(water_ml\)\s+as\s+avg_water,\s*AVG\(sleep_hours\)\s+as\s+avg_sleep,\s*AVG\(exercise_min\)\s+as\s+avg_exercise\s+FROM\s+daily_logs$/i)) {
      const logs = storage.daily_logs;
      if (logs.length === 0) {
        return [[{ avg_water: 0, avg_sleep: 0, avg_exercise: 0 }], []];
      }
      const sumWater = logs.reduce((sum, l) => sum + (l.water_ml || 0), 0);
      const sumSleep = logs.reduce((sum, l) => sum + (l.sleep_hours || 0), 0);
      const sumExercise = logs.reduce((sum, l) => sum + (l.exercise_min || 0), 0);
      return [[{
        avg_water: sumWater / logs.length,
        avg_sleep: sumSleep / logs.length,
        avg_exercise: sumExercise / logs.length
      }], []];
    }

    // Query 23: Broadcaster query selector
    if (cleanSql.match(/SELECT\s+\*\s+FROM\s+broadcasts/i)) {
      return [storage.broadcasts || [], []];
    }

    // Query 24: Broadcaster insert
    if (cleanSql.match(/INSERT\s+INTO\s+broadcasts/i)) {
      const [message] = params;
      storage.broadcasts = [{ id: 1, message, created_at: new Date() }];
      saveDb();
      return [{ affectedRows: 1 }, []];
    }

    // Query 25: Broadcaster delete
    if (cleanSql.match(/DELETE\s+FROM\s+broadcasts/i)) {
      storage.broadcasts = [];
      saveDb();
      return [{ affectedRows: 1 }, []];
    }
    
    // Fallback if some other query is made
    console.warn('MockDB: Unhandled raw query executed:', sql, params);
    return [[], []];
  }
};

let realPool;
let useFallback = false;

if (process.env.DB_HOST) {
  try {
    const mysql = require('mysql2/promise');
    realPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'wellness_db',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log(`[Database] Initialized MySQL Connection Pool for "${process.env.DB_NAME || 'wellness_db'}" on host "${process.env.DB_HOST}"!`);
  } catch (error) {
    console.error('[Database] Failed to initialize real MySQL pool. Falling back to local file mock:', error);
    useFallback = true;
  }
} else {
  useFallback = true;
}

const poolWrapper = {
  query: async function(sql, params = []) {
    if (useFallback) {
      return mockPool.query(sql, params);
    }
    try {
      return await realPool.query(sql, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH') {
        console.warn(`[Database] Connection to real MySQL failed (${err.code}). Automatically falling back to local file mock database for this preview environment.`);
        useFallback = true;
        return mockPool.query(sql, params);
      }
      throw err;
    }
  }
};

module.exports = poolWrapper;
