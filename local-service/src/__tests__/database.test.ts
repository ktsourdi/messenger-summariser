// Set DB_PATH before any imports so the database module picks it up
process.env.DB_PATH = ':memory:';

import { initializeDatabase, closeDatabase } from '../db/database';
import {
  createConversation,
  getConversation,
  getConversationByRef,
  createMessage,
  getMessagesByConversation,
  getMessageById,
  createSummary,
  getSummaryById,
  getSummariesByConversation,
  createTrackedConversation,
  getTrackedConversationById,
  getTrackedConversations,
  updateTrackedConversation,
} from '../db/repositories';

describe('Database repositories', () => {
  beforeEach(() => {
    initializeDatabase();
  });

  afterEach(() => {
    closeDatabase();
  });

  // ── Conversations ─────────────────────────────────────────────

  describe('conversations', () => {
    it('creates and retrieves a conversation', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-123',
        title: 'Team Chat',
        participantsJson: ['Alice', 'Bob'],
        isTracked: false,
      });

      expect(conv.id).toBeDefined();
      expect(conv.title).toBe('Team Chat');
      expect(conv.platformConversationRef).toBe('fb-chat-123');
      expect(conv.createdAt).toBeDefined();

      const fetched = getConversation(conv.id);
      expect(fetched).toBeDefined();
      expect(fetched!.title).toBe('Team Chat');
      expect(fetched!.participantsJson).toEqual(['Alice', 'Bob']);
    });

    it('retrieves a conversation by platformConversationRef', () => {
      createConversation({
        platformConversationRef: 'fb-chat-456',
        title: 'Project Chat',
        participantsJson: ['Charlie'],
        isTracked: true,
      });

      const fetched = getConversationByRef('fb-chat-456');
      expect(fetched).toBeDefined();
      expect(fetched!.title).toBe('Project Chat');
      expect(fetched!.isTracked).toBe(true);
    });

    it('returns undefined for unknown conversation id', () => {
      const result = getConversation('nonexistent-id');
      expect(result).toBeUndefined();
    });

    it('returns undefined for unknown platformConversationRef', () => {
      const result = getConversationByRef('nonexistent-ref');
      expect(result).toBeUndefined();
    });
  });

  // ── Messages ──────────────────────────────────────────────────

  describe('messages', () => {
    it('creates and retrieves messages by conversation', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-msg-test',
        title: 'Msg Test',
        participantsJson: ['Alice'],
        isTracked: false,
      });

      const msg1 = createMessage({
        conversationId: conv.id,
        senderName: 'Alice',
        timestamp: '2024-01-01T10:00:00Z',
        messageType: 'text',
        textBody: 'Hello',
      });

      const msg2 = createMessage({
        conversationId: conv.id,
        senderName: 'Bob',
        timestamp: '2024-01-01T10:05:00Z',
        messageType: 'text',
        textBody: 'Hi Alice!',
      });

      expect(msg1.id).toBeDefined();
      expect(msg2.id).toBeDefined();

      const messages = getMessagesByConversation(conv.id);
      expect(messages.length).toBe(2);
      expect(messages[0].senderName).toBe('Alice');
      expect(messages[1].senderName).toBe('Bob');
    });

    it('retrieves a message by id', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-msgid-test',
        title: 'Msg ID Test',
        participantsJson: [],
        isTracked: false,
      });

      const msg = createMessage({
        conversationId: conv.id,
        senderName: 'Alice',
        timestamp: '2024-01-01T10:00:00Z',
        messageType: 'text',
        textBody: 'Test message',
      });

      const fetched = getMessageById(msg.id);
      expect(fetched).toBeDefined();
      expect(fetched!.textBody).toBe('Test message');
    });

    it('respects the limit parameter', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-limit-test',
        title: 'Limit Test',
        participantsJson: [],
        isTracked: false,
      });

      for (let i = 0; i < 5; i++) {
        createMessage({
          conversationId: conv.id,
          senderName: 'User',
          timestamp: `2024-01-01T10:0${i}:00Z`,
          messageType: 'text',
          textBody: `Message ${i}`,
        });
      }

      const limited = getMessagesByConversation(conv.id, 3);
      expect(limited.length).toBe(3);
    });
  });

  // ── Summaries ─────────────────────────────────────────────────

  describe('summaries', () => {
    it('creates and retrieves a summary', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-summary-test',
        title: 'Summary Test',
        participantsJson: [],
        isTracked: false,
      });

      const summary = createSummary({
        conversationId: conv.id,
        summaryType: 'manual',
        shortSummary: '3 messages from Alice',
        detailedSummary: 'Alice said hello',
        actionItemsJson: ['Alice: do the thing'],
        unansweredQuestionsJson: ['Alice: when?'],
        decisionsJson: ['decided to ship'],
        mentionsJson: ['@Bob'],
        needsReplyScore: 42,
        voiceNoteHighlights: [],
      });

      expect(summary.id).toBeDefined();
      expect(summary.createdAt).toBeDefined();

      const fetched = getSummaryById(summary.id);
      expect(fetched).toBeDefined();
      expect(fetched!.shortSummary).toBe('3 messages from Alice');
      expect(fetched!.actionItemsJson).toEqual(['Alice: do the thing']);
      expect(fetched!.needsReplyScore).toBe(42);
    });

    it('retrieves all summaries by conversation', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-summaries-list',
        title: 'Summaries List',
        participantsJson: [],
        isTracked: false,
      });

      createSummary({
        conversationId: conv.id,
        summaryType: 'manual',
        shortSummary: 'First summary',
      });

      createSummary({
        conversationId: conv.id,
        summaryType: 'daily',
        shortSummary: 'Second summary',
      });

      const summaries = getSummariesByConversation(conv.id);
      expect(summaries.length).toBe(2);
      const titles = summaries.map(s => s.shortSummary);
      expect(titles).toContain('First summary');
      expect(titles).toContain('Second summary');
    });

    it('returns undefined for unknown summary id', () => {
      const result = getSummaryById('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // ── Tracked Conversations ─────────────────────────────────────

  describe('tracked conversations', () => {
    it('creates and retrieves a tracked conversation', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-tracked-test',
        title: 'Tracked Test',
        participantsJson: [],
        isTracked: true,
      });

      const tc = createTrackedConversation({
        conversationId: conv.id,
        digestFrequency: 'daily',
        includeVoiceNotes: true,
        includeActionItems: true,
        includeShortSummary: true,
        enabled: true,
      });

      expect(tc.id).toBeDefined();
      expect(tc.digestFrequency).toBe('daily');

      const fetched = getTrackedConversationById(tc.id);
      expect(fetched).toBeDefined();
      expect(fetched!.conversationId).toBe(conv.id);
      expect(fetched!.enabled).toBe(true);
    });

    it('lists all tracked conversations', () => {
      const conv1 = createConversation({
        platformConversationRef: 'fb-chat-tc-list-1',
        title: 'TC List 1',
        participantsJson: [],
        isTracked: true,
      });

      const conv2 = createConversation({
        platformConversationRef: 'fb-chat-tc-list-2',
        title: 'TC List 2',
        participantsJson: [],
        isTracked: true,
      });

      createTrackedConversation({
        conversationId: conv1.id,
        digestFrequency: 'hourly',
        includeVoiceNotes: false,
        includeActionItems: true,
        includeShortSummary: true,
        enabled: true,
      });

      createTrackedConversation({
        conversationId: conv2.id,
        digestFrequency: 'daily',
        includeVoiceNotes: true,
        includeActionItems: false,
        includeShortSummary: false,
        enabled: false,
      });

      const all = getTrackedConversations();
      expect(all.length).toBe(2);
    });

    it('updates a tracked conversation', () => {
      const conv = createConversation({
        platformConversationRef: 'fb-chat-tc-update',
        title: 'TC Update',
        participantsJson: [],
        isTracked: true,
      });

      const tc = createTrackedConversation({
        conversationId: conv.id,
        digestFrequency: 'daily',
        includeVoiceNotes: true,
        includeActionItems: true,
        includeShortSummary: true,
        enabled: true,
      });

      updateTrackedConversation(tc.id, {
        digestFrequency: 'hourly',
        enabled: false,
      });

      const updated = getTrackedConversationById(tc.id);
      expect(updated).toBeDefined();
      expect(updated!.digestFrequency).toBe('hourly');
      expect(updated!.enabled).toBe(false);
      // Unchanged fields should remain
      expect(updated!.includeVoiceNotes).toBe(true);
    });
  });
});
