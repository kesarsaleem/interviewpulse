import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('interviewpulse.db');
  }
  return dbInstance;
}

/**
 * Creates the local mirror tables. These intentionally match the server
 * shape closely so pull/push mapping stays simple. `sync_status` and
 * `version` drive the sync engine and conflict detection.
 */
export function initDatabase(): void {
  const db = getDb();
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar_url TEXT,
      theme_mode TEXT DEFAULT 'light',
      default_interview_mode TEXT DEFAULT 'video',
      default_duration INTEGER DEFAULT 45,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      department TEXT,
      description TEXT,
      jd_url TEXT,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      current_role TEXT,
      current_company TEXT,
      resume_url TEXT,
      referral_source TEXT NOT NULL,
      current_stage_id TEXT,
      decision_status TEXT DEFAULT 'pending',
      interview_date TEXT,
      interview_time TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      interviewer_id TEXT NOT NULL,
      overall_verdict TEXT NOT NULL,
      positives TEXT NOT NULL,
      concerns TEXT NOT NULL,
      questions TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      interview_mode TEXT NOT NULL,
      would_hire_solo INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      editable_until TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS feedback_scores (
      id TEXT PRIMARY KEY,
      feedback_id TEXT NOT NULL,
      criterion_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    -- Outbox of local mutations awaiting push to Supabase.
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      feedback_id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      server_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  try {
    db.execSync(`ALTER TABLE candidates ADD COLUMN decision_status TEXT DEFAULT 'pending';`);
  } catch {
    // column already exists
  }

  try {
    db.execSync(`ALTER TABLE profiles ADD COLUMN theme_mode TEXT DEFAULT 'light';`);
  } catch {
    // column already exists
  }

  try {
    db.execSync(`ALTER TABLE profiles ADD COLUMN default_interview_mode TEXT DEFAULT 'video';`);
  } catch {
    // column already exists
  }

  try {
    db.execSync(`ALTER TABLE profiles ADD COLUMN default_duration INTEGER DEFAULT 45;`);
  } catch {
    // column already exists
  }
}
