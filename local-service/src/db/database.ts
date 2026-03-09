import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function initializeDatabase(): Database.Database {
  const config = getConfig();
  const dbPath = config.dbPath;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  logger.info('Database initialized', { path: dbPath });
  return db;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      platformConversationRef TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      participantsJson TEXT NOT NULL DEFAULT '[]',
      isTracked INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      externalMessageRef TEXT,
      senderName TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      messageType TEXT NOT NULL DEFAULT 'text',
      textBody TEXT,
      audioRef TEXT,
      rawMetadataJson TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      transcriptText TEXT NOT NULL DEFAULT '',
      transcriptSummary TEXT,
      confidence REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      summaryType TEXT NOT NULL DEFAULT 'manual',
      windowStart TEXT,
      windowEnd TEXT,
      shortSummary TEXT NOT NULL,
      detailedSummary TEXT,
      actionItemsJson TEXT DEFAULT '[]',
      unansweredQuestionsJson TEXT DEFAULT '[]',
      decisionsJson TEXT DEFAULT '[]',
      mentionsJson TEXT DEFAULT '[]',
      needsReplyScore REAL DEFAULT 0,
      voiceNoteHighlights TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracked_conversations (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      digestFrequency TEXT NOT NULL DEFAULT 'daily',
      quietHoursJson TEXT,
      includeVoiceNotes INTEGER NOT NULL DEFAULT 1,
      includeActionItems INTEGER NOT NULL DEFAULT 1,
      includeShortSummary INTEGER NOT NULL DEFAULT 1,
      telegramTargetRef TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      summaryId TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'telegram',
      status TEXT NOT NULL DEFAULT 'pending',
      externalRef TEXT,
      sentAt TEXT,
      errorMessage TEXT,
      FOREIGN KEY (summaryId) REFERENCES summaries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      payload TEXT DEFAULT '{}',
      result TEXT,
      error TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON messages(conversationId);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_summaries_conversationId ON summaries(conversationId);
    CREATE INDEX IF NOT EXISTS idx_transcripts_messageId ON transcripts(messageId);
    CREATE INDEX IF NOT EXISTS idx_tracked_conversations_conversationId ON tracked_conversations(conversationId);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  `);

  logger.debug('Database migrations completed');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database closed');
  }
}
