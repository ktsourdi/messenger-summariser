import { generateSummary, SummaryResult } from '../summarizer/summarizer';
import type { Message } from '../models/types';

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-default',
    conversationId: 'conv-1',
    senderName: 'Unknown',
    timestamp: '2024-01-01T10:00:00Z',
    messageType: 'text' as const,
    createdAt: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('generateSummary', () => {
  it('returns a default summary for empty messages', async () => {
    const result = await generateSummary([]);

    expect(result.shortSummary).toBe('No messages to summarize.');
    expect(result.detailedSummary).toBe('');
    expect(result.actionItems).toEqual([]);
    expect(result.unansweredQuestions).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.mentions).toEqual([]);
    expect(result.needsReplyScore).toBe(0);
    expect(result.voiceNoteHighlights).toEqual([]);
  });

  it('summarizes a single text message', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello everyone' }),
    ];

    const result = await generateSummary(messages);

    expect(result.shortSummary).toContain('1 message');
    expect(result.shortSummary).toContain('Alice');
    expect(result.detailedSummary).toContain('Alice');
    expect(result.detailedSummary).toContain('Hello everyone');
  });

  it('summarizes multiple messages from different senders', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hi there', timestamp: '2024-01-01T10:00:00Z' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', textBody: 'Hey Alice!', timestamp: '2024-01-01T10:05:00Z' }),
      makeMessage({ id: 'msg-3', senderName: 'Charlie', textBody: 'Good morning', timestamp: '2024-01-01T10:10:00Z' }),
    ];

    const result = await generateSummary(messages);

    expect(result.shortSummary).toContain('3 messages');
    expect(result.shortSummary).toContain('Alice');
    expect(result.shortSummary).toContain('Bob');
    expect(result.shortSummary).toContain('Charlie');
  });

  it('extracts action items from messages containing action keywords', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'We need to finish the report' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', textBody: 'Please review the PR' }),
      makeMessage({ id: 'msg-3', senderName: 'Charlie', textBody: 'Can you send the document?' }),
      makeMessage({ id: 'msg-4', senderName: 'Dave', textBody: 'The weather is nice today' }),
    ];

    const result = await generateSummary(messages);

    expect(result.actionItems.length).toBeGreaterThanOrEqual(3);
    expect(result.actionItems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('need to finish the report'),
        expect.stringContaining('Please review the PR'),
        expect.stringContaining('Can you send the document'),
      ]),
    );
    // Non-action message should not appear
    expect(result.actionItems.join(' ')).not.toContain('weather is nice');
  });

  it('extracts unanswered questions', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'What time is the meeting?', timestamp: '2024-01-01T10:00:00Z' }),
      makeMessage({ id: 'msg-2', senderName: 'Alice', textBody: 'Also where is it?', timestamp: '2024-01-01T10:01:00Z' }),
    ];

    const result = await generateSummary(messages);

    // Both questions should be unanswered: first because next msg is same sender,
    // second because it's the last message
    expect(result.unansweredQuestions.length).toBe(2);
    expect(result.unansweredQuestions[0]).toContain('What time is the meeting?');
    expect(result.unansweredQuestions[1]).toContain('Also where is it?');
  });

  it('does not mark a question as unanswered if the next message is from a different sender', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'What time is the meeting?', timestamp: '2024-01-01T10:00:00Z' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', textBody: 'It is at 3pm', timestamp: '2024-01-01T10:01:00Z' }),
    ];

    const result = await generateSummary(messages);

    expect(result.unansweredQuestions).toEqual([]);
  });

  it('extracts decisions from messages containing decision keywords', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'We decided to use React' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', textBody: 'Agreed, that makes sense' }),
      makeMessage({ id: 'msg-3', senderName: 'Charlie', textBody: 'Sounds good to me' }),
    ];

    const result = await generateSummary(messages);

    expect(result.decisions.length).toBe(2);
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('decided to use React'),
        expect.stringContaining('Agreed'),
      ]),
    );
  });

  it('extracts @mentions', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hey @Bob can you check this?' }),
      makeMessage({ id: 'msg-2', senderName: 'Charlie', textBody: '@Dave and @Eve please review' }),
    ];

    const result = await generateSummary(messages);

    expect(result.mentions).toEqual(expect.arrayContaining(['@Bob', '@Dave', '@Eve']));
    expect(result.mentions.length).toBe(3);
  });

  it('extracts voice note highlights', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello', messageType: 'text' as const }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', messageType: 'voice' as const, timestamp: '2024-01-01T11:00:00Z' }),
      makeMessage({ id: 'msg-3', senderName: 'Charlie', messageType: 'voice' as const, timestamp: '2024-01-01T12:00:00Z' }),
    ];

    const result = await generateSummary(messages);

    expect(result.voiceNoteHighlights.length).toBe(2);
    expect(result.voiceNoteHighlights[0]).toContain('Voice note from Bob');
    expect(result.voiceNoteHighlights[1]).toContain('Voice note from Charlie');
  });

  it('calculates needsReplyScore based on questions and action items', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Please do this task', timestamp: '2024-01-01T10:00:00Z' }),
      makeMessage({ id: 'msg-2', senderName: 'Alice', textBody: 'Are you available?', timestamp: '2024-01-01T10:01:00Z' }),
    ];

    const result = await generateSummary(messages);

    // 1 action item (10) + 1 unanswered question (20) + last-message-is-question bonus (25) = 55
    expect(result.needsReplyScore).toBe(55);
  });

  it('caps needsReplyScore at 100', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Please do task 1?', timestamp: '2024-01-01T10:00:00Z' }),
      makeMessage({ id: 'msg-2', senderName: 'Alice', textBody: 'Can you do task 2?', timestamp: '2024-01-01T10:01:00Z' }),
      makeMessage({ id: 'msg-3', senderName: 'Alice', textBody: 'Need to do task 3?', timestamp: '2024-01-01T10:02:00Z' }),
      makeMessage({ id: 'msg-4', senderName: 'Alice', textBody: 'Should we do task 4?', timestamp: '2024-01-01T10:03:00Z' }),
      makeMessage({ id: 'msg-5', senderName: 'Alice', textBody: 'Could you handle task 5?', timestamp: '2024-01-01T10:04:00Z' }),
    ];

    const result = await generateSummary(messages);

    expect(result.needsReplyScore).toBeLessThanOrEqual(100);
  });
});
