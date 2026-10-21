import Database from 'better-sqlite3';

export function open(path = ':memory:') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS procedures(
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL,
      status TEXT NOT NULL, trace_hash TEXT UNIQUE, verifier INTEGER,
      manifest TEXT NOT NULL, steps TEXT NOT NULL, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS runs(
      id INTEGER PRIMARY KEY, procedure_id INTEGER NOT NULL, status TEXT NOT NULL,
      params TEXT, llm_calls INTEGER DEFAULT 0, started_at INTEGER, ended_at INTEGER,
      pending TEXT);
    CREATE TABLE IF NOT EXISTS activity(
      seq INTEGER PRIMARY KEY, ts INTEGER, actor TEXT, event TEXT, prev TEXT, hash TEXT);
    CREATE TABLE IF NOT EXISTS pipelines(id INTEGER PRIMARY KEY, name TEXT, graph TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pipeline_runs(
      id INTEGER PRIMARY KEY, pipeline_id INTEGER, status TEXT, ctx TEXT, cursor INTEGER DEFAULT 0,
      trace TEXT DEFAULT '[]', error TEXT, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS docs(
      id INTEGER PRIMARY KEY, doc_key TEXT NOT NULL, version INTEGER NOT NULL, title TEXT,
      level TEXT NOT NULL, roles TEXT NOT NULL, source TEXT, hash TEXT, status TEXT NOT NULL, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, n INTEGER, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model_usage(id INTEGER PRIMARY KEY, ts INTEGER, model TEXT, input INTEGER, output INTEGER);
    CREATE TABLE IF NOT EXISTS pending_docs(id INTEGER PRIMARY KEY, doc_key TEXT, payload TEXT, status TEXT, requested_by TEXT, decided_by TEXT, created_at INTEGER);
    CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);
  `);
  try { db.exec('ALTER TABLE procedures ADD COLUMN trusted INTEGER DEFAULT 0'); } catch { /* column exists */ }
  return db;
}
