CREATE DATABASE IF NOT EXISTS wellnesshub_db;
USE wellnesshub_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  water_ml INT DEFAULT 0,
  sleep_hours FLOAT DEFAULT 0,
  exercise_min INT DEFAULT 0,
  log_date DATE DEFAULT (CURRENT_DATE),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_date (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS mood_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  mood_level INT, -- 1-5 scale
  stress_level INT, -- 1-5 scale
  note TEXT,
  log_date DATE DEFAULT (CURRENT_DATE),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  title VARCHAR(100),
  reminder_time TIME,
  reminder_type ENUM('medication', 'workout', 'other'),
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  meal_type ENUM('breakfast', 'lunch', 'dinner', 'snack') DEFAULT 'snack',
  description VARCHAR(255),
  calories INT DEFAULT 0,
  log_date DATE DEFAULT (CURRENT_DATE),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
