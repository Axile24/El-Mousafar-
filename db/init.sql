CREATE TABLE IF NOT EXISTS saved_searches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  origin_text VARCHAR(255) NOT NULL,
  destination_text VARCHAR(255) NOT NULL,
  origin_gid VARCHAR(64) DEFAULT NULL,
  destination_gid VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
