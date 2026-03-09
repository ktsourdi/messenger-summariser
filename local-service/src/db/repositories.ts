import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import type {
  Conversation,
  Message,
  Transcript,
  Summary,
  TrackedConversation,
  DeliveryLog,
  Settings,
  JobStatus,
} from '../models/types';

// ── Conversations ──────────────────────────────────────────────

export function createConversation(conv: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Conversation {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const participantsJson = JSON.stringify(conv.participantsJson);

  db.prepare(`
    INSERT INTO conversations (id, platformConversationRef, title, participantsJson, isTracked, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, conv.platformConversationRef, conv.title, participantsJson, conv.isTracked ? 1 : 0, now, now);

  return { ...conv, id, participantsJson: conv.participantsJson, createdAt: now, updatedAt: now };
}

export function getConversation(id: string): Conversation | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapConversationRow(row) : undefined;
}

export function getConversationByRef(ref: string): Conversation | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conversations WHERE platformConversationRef = ?').get(ref) as Record<string, unknown> | undefined;
  return row ? mapConversationRow(row) : undefined;
}

export function updateConversation(id: string, data: Partial<Pick<Conversation, 'title' | 'participantsJson' | 'isTracked'>>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ['updatedAt = ?'];
  const params: unknown[] = [now];

  if (data.title !== undefined) {
    sets.push('title = ?');
    params.push(data.title);
  }
  if (data.participantsJson !== undefined) {
    sets.push('participantsJson = ?');
    params.push(JSON.stringify(data.participantsJson));
  }
  if (data.isTracked !== undefined) {
    sets.push('isTracked = ?');
    params.push(data.isTracked ? 1 : 0);
  }

  params.push(id);
  db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

function mapConversationRow(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    platformConversationRef: row.platformConversationRef as string,
    title: row.title as string,
    participantsJson: JSON.parse(row.participantsJson as string),
    isTracked: (row.isTracked as number) === 1,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

// ── Messages ────────────────────────────────────────────────────

export function createMessage(msg: Omit<Message, 'id' | 'createdAt'>): Message {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, conversationId, externalMessageRef, senderName, timestamp, messageType, textBody, audioRef, rawMetadataJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, msg.conversationId, msg.externalMessageRef ?? null, msg.senderName, msg.timestamp, msg.messageType, msg.textBody ?? null, msg.audioRef ?? null, msg.rawMetadataJson ?? null, now);

  return { ...msg, id, createdAt: now };
}

export function getMessagesByConversation(convId: string, limit?: number): Message[] {
  const db = getDb();
  let query = 'SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp ASC';
  const params: unknown[] = [convId];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const rows = db.prepare(query).all(...params) as Message[];
  return rows;
}

export function getMessageById(id: string): Message | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
}

// ── Transcripts ─────────────────────────────────────────────────

export function createTranscript(t: Omit<Transcript, 'id' | 'createdAt'>): Transcript {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO transcripts (id, messageId, transcriptText, transcriptSummary, confidence, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, t.messageId, t.transcriptText, t.transcriptSummary ?? null, t.confidence ?? null, t.status, now);

  return { ...t, id, createdAt: now };
}

export function getTranscriptByMessageId(msgId: string): Transcript | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM transcripts WHERE messageId = ?').get(msgId) as Transcript | undefined;
}

export function updateTranscript(id: string, data: Partial<Pick<Transcript, 'transcriptText' | 'transcriptSummary' | 'confidence' | 'status'>>): void {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (data.transcriptText !== undefined) { sets.push('transcriptText = ?'); params.push(data.transcriptText); }
  if (data.transcriptSummary !== undefined) { sets.push('transcriptSummary = ?'); params.push(data.transcriptSummary); }
  if (data.confidence !== undefined) { sets.push('confidence = ?'); params.push(data.confidence); }
  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }

  if (sets.length === 0) return;

  params.push(id);
  db.prepare(`UPDATE transcripts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ── Summaries ───────────────────────────────────────────────────

export function createSummary(s: Omit<Summary, 'id' | 'createdAt'>): Summary {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO summaries (id, conversationId, summaryType, windowStart, windowEnd, shortSummary, detailedSummary, actionItemsJson, unansweredQuestionsJson, decisionsJson, mentionsJson, needsReplyScore, voiceNoteHighlights, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    s.conversationId,
    s.summaryType,
    s.windowStart ?? null,
    s.windowEnd ?? null,
    s.shortSummary,
    s.detailedSummary ?? null,
    JSON.stringify(s.actionItemsJson ?? []),
    JSON.stringify(s.unansweredQuestionsJson ?? []),
    JSON.stringify(s.decisionsJson ?? []),
    JSON.stringify(s.mentionsJson ?? []),
    s.needsReplyScore ?? 0,
    JSON.stringify(s.voiceNoteHighlights ?? []),
    now,
  );

  return { ...s, id, createdAt: now };
}

export function getSummaryById(id: string): Summary | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM summaries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapSummaryRow(row) : undefined;
}

export function getSummariesByConversation(convId: string): Summary[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM summaries WHERE conversationId = ? ORDER BY createdAt DESC').all(convId) as Record<string, unknown>[];
  return rows.map(mapSummaryRow);
}

function mapSummaryRow(row: Record<string, unknown>): Summary {
  return {
    id: row.id as string,
    conversationId: row.conversationId as string,
    summaryType: row.summaryType as Summary['summaryType'],
    windowStart: row.windowStart as string | undefined,
    windowEnd: row.windowEnd as string | undefined,
    shortSummary: row.shortSummary as string,
    detailedSummary: row.detailedSummary as string | undefined,
    actionItemsJson: JSON.parse((row.actionItemsJson as string) || '[]'),
    unansweredQuestionsJson: JSON.parse((row.unansweredQuestionsJson as string) || '[]'),
    decisionsJson: JSON.parse((row.decisionsJson as string) || '[]'),
    mentionsJson: JSON.parse((row.mentionsJson as string) || '[]'),
    needsReplyScore: row.needsReplyScore as number | undefined,
    voiceNoteHighlights: JSON.parse((row.voiceNoteHighlights as string) || '[]'),
    createdAt: row.createdAt as string,
  };
}

// ── Tracked Conversations ───────────────────────────────────────

export function createTrackedConversation(tc: Omit<TrackedConversation, 'id'>): TrackedConversation {
  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO tracked_conversations (id, conversationId, digestFrequency, quietHoursJson, includeVoiceNotes, includeActionItems, includeShortSummary, telegramTargetRef, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tc.conversationId,
    tc.digestFrequency,
    tc.quietHoursJson ? JSON.stringify(tc.quietHoursJson) : null,
    tc.includeVoiceNotes ? 1 : 0,
    tc.includeActionItems ? 1 : 0,
    tc.includeShortSummary ? 1 : 0,
    tc.telegramTargetRef ?? null,
    tc.enabled ? 1 : 0,
  );

  return { ...tc, id };
}

export function getTrackedConversations(): TrackedConversation[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tracked_conversations').all() as Record<string, unknown>[];
  return rows.map(mapTrackedConversationRow);
}

export function getTrackedConversationById(id: string): TrackedConversation | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tracked_conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapTrackedConversationRow(row) : undefined;
}

export function updateTrackedConversation(id: string, data: Partial<Omit<TrackedConversation, 'id' | 'conversationId'>>): void {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (data.digestFrequency !== undefined) { sets.push('digestFrequency = ?'); params.push(data.digestFrequency); }
  if (data.quietHoursJson !== undefined) { sets.push('quietHoursJson = ?'); params.push(JSON.stringify(data.quietHoursJson)); }
  if (data.includeVoiceNotes !== undefined) { sets.push('includeVoiceNotes = ?'); params.push(data.includeVoiceNotes ? 1 : 0); }
  if (data.includeActionItems !== undefined) { sets.push('includeActionItems = ?'); params.push(data.includeActionItems ? 1 : 0); }
  if (data.includeShortSummary !== undefined) { sets.push('includeShortSummary = ?'); params.push(data.includeShortSummary ? 1 : 0); }
  if (data.telegramTargetRef !== undefined) { sets.push('telegramTargetRef = ?'); params.push(data.telegramTargetRef); }
  if (data.enabled !== undefined) { sets.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }

  if (sets.length === 0) return;

  params.push(id);
  db.prepare(`UPDATE tracked_conversations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

function mapTrackedConversationRow(row: Record<string, unknown>): TrackedConversation {
  return {
    id: row.id as string,
    conversationId: row.conversationId as string,
    digestFrequency: row.digestFrequency as TrackedConversation['digestFrequency'],
    quietHoursJson: row.quietHoursJson ? JSON.parse(row.quietHoursJson as string) : undefined,
    includeVoiceNotes: (row.includeVoiceNotes as number) === 1,
    includeActionItems: (row.includeActionItems as number) === 1,
    includeShortSummary: (row.includeShortSummary as number) === 1,
    telegramTargetRef: row.telegramTargetRef as string | undefined,
    enabled: (row.enabled as number) === 1,
  };
}

// ── Delivery Logs ───────────────────────────────────────────────

export function createDeliveryLog(dl: Omit<DeliveryLog, 'id'>): DeliveryLog {
  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO delivery_logs (id, summaryId, channel, status, externalRef, sentAt, errorMessage)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, dl.summaryId, dl.channel, dl.status, dl.externalRef ?? null, dl.sentAt ?? null, dl.errorMessage ?? null);

  return { ...dl, id };
}

export function updateDeliveryLog(id: string, data: Partial<Pick<DeliveryLog, 'status' | 'externalRef' | 'sentAt' | 'errorMessage'>>): void {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
  if (data.externalRef !== undefined) { sets.push('externalRef = ?'); params.push(data.externalRef); }
  if (data.sentAt !== undefined) { sets.push('sentAt = ?'); params.push(data.sentAt); }
  if (data.errorMessage !== undefined) { sets.push('errorMessage = ?'); params.push(data.errorMessage); }

  if (sets.length === 0) return;

  params.push(id);
  db.prepare(`UPDATE delivery_logs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ── Jobs ────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  type: string;
  status: JobStatus;
  payload: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createJob(job: { type: string; payload?: unknown }): JobRow {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const payload = JSON.stringify(job.payload ?? {});

  db.prepare(`
    INSERT INTO jobs (id, type, status, payload, createdAt, updatedAt)
    VALUES (?, ?, 'queued', ?, ?, ?)
  `).run(id, job.type, payload, now, now);

  return { id, type: job.type, status: 'queued', payload, result: null, error: null, createdAt: now, updatedAt: now };
}

export function getJobById(id: string): JobRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
}

export function updateJob(id: string, data: Partial<Pick<JobRow, 'status' | 'result' | 'error'>>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ['updatedAt = ?'];
  const params: unknown[] = [now];

  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
  if (data.result !== undefined) { sets.push('result = ?'); params.push(typeof data.result === 'string' ? data.result : JSON.stringify(data.result)); }
  if (data.error !== undefined) { sets.push('error = ?'); params.push(data.error); }

  params.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ── Settings ────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  defaultSummaryRange: 50,
  defaultDigestFrequency: 'daily',
  includeVoiceNotes: true,
  summaryLength: 'medium',
  keepRawMessages: true,
};

export function getSettings(): Settings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];

  if (rows.length === 0) {
    return { ...DEFAULT_SETTINGS };
  }

  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings as unknown as Settings;
}

export function updateSettings(settings: Partial<Settings>): void {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const transaction = db.transaction((entries: [string, unknown][]) => {
    for (const [key, value] of entries) {
      upsert.run(key, JSON.stringify(value));
    }
  });

  transaction(Object.entries(settings));
}
