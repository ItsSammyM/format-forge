CREATE TABLE IF NOT EXISTS library_records (
  user_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('deck', 'format', 'preferences', 'state')),
  record_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, record_type, record_id, chunk_index)
);
