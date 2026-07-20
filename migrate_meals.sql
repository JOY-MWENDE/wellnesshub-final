-- Run this if you already created the database from an older init_db.sql
USE wellnesshub_db;

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
