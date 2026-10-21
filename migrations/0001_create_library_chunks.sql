CREATE TABLE IF NOT EXISTS library_chunks (
  user_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload BLOB NOT NULL,
  PRIMARY KEY (user_id, chunk_index)
);
