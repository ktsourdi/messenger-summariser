import { generateSummaryWithLLM } from '../summarizer/summarizer';
import type { Message } from '../models/types';

// Mock the openai module
jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OpenAI = require('openai');

function getLastMockCreate(): jest.Mock {
  const lastInstance = OpenAI.mock.results[OpenAI.mock.results.length - 1]?.value;
  return lastInstance.chat.completions.create;
}

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

const VALID_LLM_RESPONSE = JSON.stringify({
  shortSummary: '2 messages from Alice, Bob (10:00 – 10:05)',
  detailedSummary: '## Project\nAlice asked Bob to send the report by Friday.',
  actionItems: ['Bob: Send the report by Friday'],
  unansweredQuestions: [],
  decisions: [],
  mentions: [],
  needsReplyScore: 30,
  voiceNoteHighlights: [],
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateSummaryWithLLM', () => {
  it('delegates to rule-based engine for empty messages', async () => {
    const result = await generateSummaryWithLLM([], 'test-key');

    expect(result.shortSummary).toBe('No messages to summarize.');
    // OpenAI should not have been instantiated for empty messages
    expect(OpenAI).not.toHaveBeenCalled();
  });

  it('calls OpenAI API and returns parsed LLM result', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Can you send the report by Friday?' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', textBody: 'Sure, will do' }),
    ];

    // We need to call first so the mock instance is created, then set up the return value
    // Actually, let's set up the mock before calling
    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: VALID_LLM_RESPONSE } }],
          }),
        },
      },
    }));

    const result = await generateSummaryWithLLM(messages, 'test-api-key');

    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    expect(result.shortSummary).toBe('2 messages from Alice, Bob (10:00 – 10:05)');
    expect(result.actionItems).toEqual(['Bob: Send the report by Friday']);
    expect(result.needsReplyScore).toBe(30);
  });

  it('falls back to rule-based engine when LLM returns empty content', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '' } }],
          }),
        },
      },
    }));

    const result = await generateSummaryWithLLM(messages, 'test-key');

    // Should fall back to rule-based
    expect(result.shortSummary).toContain('1 message');
    expect(result.shortSummary).toContain('Alice');
  });

  it('falls back to rule-based engine when LLM returns invalid JSON', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'This is not JSON at all' } }],
          }),
        },
      },
    }));

    const result = await generateSummaryWithLLM(messages, 'test-key');

    expect(result.shortSummary).toContain('1 message');
    expect(result.shortSummary).toContain('Alice');
  });

  it('falls back to rule-based engine when OpenAI API throws', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(new Error('API rate limit exceeded')),
        },
      },
    }));

    const result = await generateSummaryWithLLM(messages, 'test-key');

    expect(result.shortSummary).toContain('1 message');
    expect(result.shortSummary).toContain('Alice');
  });

  it('passes custom model parameter to OpenAI', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hi' }),
    ];

    let capturedArgs: unknown;
    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockImplementation((args: unknown) => {
            capturedArgs = args;
            return Promise.resolve({
              choices: [{ message: { content: VALID_LLM_RESPONSE } }],
            });
          }),
        },
      },
    }));

    await generateSummaryWithLLM(messages, 'test-key', 'gpt-4o');

    expect((capturedArgs as { model: string }).model).toBe('gpt-4o');
  });

  it('clamps needsReplyScore to 0-100 range', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hi' }),
    ];

    const badScoreResponse = JSON.stringify({
      shortSummary: 'test',
      detailedSummary: '',
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      needsReplyScore: 150,
      voiceNoteHighlights: [],
    });

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: badScoreResponse } }],
          }),
        },
      },
    }));

    const result = await generateSummaryWithLLM(messages, 'test-key');
    expect(result.needsReplyScore).toBe(100);
  });

  it('handles partial/missing fields in LLM response gracefully', async () => {
    const messages: Message[] = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hi' }),
    ];

    const partialResponse = JSON.stringify({
      shortSummary: 'partial summary',
      // missing other fields
    });

    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: partialResponse } }],
          }),
        },
      },
    }));

    const result = await generateSummaryWithLLM(messages, 'test-key');
    expect(result.shortSummary).toBe('partial summary');
    expect(result.actionItems).toEqual([]);
    expect(result.needsReplyScore).toBe(0);
  });
});
