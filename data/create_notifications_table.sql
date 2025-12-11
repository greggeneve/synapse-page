-- Table des notifications
CREATE TABLE IF NOT EXISTS employee_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link VARCHAR(255),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  
  INDEX idx_employee_unread (employee_id, is_read),
  INDEX idx_created (created_at)
);
