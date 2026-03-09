import { generateSummaryWithLLM, SummaryResult } from '../summarizer/summarizer';
import type { Message } from '../models/types';

// Mock global fetch
const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

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

const LLM_CONFIG = {
  apiKey: 'test-api-key',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
};

function mockLLMResponse(content: Record<string, unknown>): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      id: 'chatcmpl-test',
      choices: [
        {
          message: { role: 'assistant', content: JSON.stringify(content) },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
  });
}

describe('generateSummaryWithLLM', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns empty summary for empty messages without calling LLM', async () => {
    const result = await generateSummaryWithLLM([], LLM_CONFIG);

    expect(result.shortSummary).toBe('No messages to summarize.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the LLM API with correct parameters', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockLLMResponse({
      shortSummary: 'Alice says hello.',
      detailedSummary: 'Alice greeted everyone.',
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      needsReplyScore: 10,
      voiceNoteHighlights: [],
    });

    await generateSummaryWithLLM(messages, LLM_CONFIG);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('Alice');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('parses a valid LLM response into SummaryResult', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'We need to finish the report' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', textBody: 'What is the deadline?' }),
    ];

    mockLLMResponse({
      shortSummary: 'Alice and Bob discussed a report deadline.',
      detailedSummary: 'Alice mentioned needing to finish a report. Bob asked about the deadline.',
      actionItems: ['Alice: Finish the report'],
      unansweredQuestions: ['Bob: What is the deadline?'],
      decisions: [],
      mentions: [],
      needsReplyScore: 65,
      voiceNoteHighlights: [],
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);

    expect(result.shortSummary).toBe('Alice and Bob discussed a report deadline.');
    expect(result.detailedSummary).toContain('Alice mentioned needing to finish a report');
    expect(result.actionItems).toEqual(['Alice: Finish the report']);
    expect(result.unansweredQuestions).toEqual(['Bob: What is the deadline?']);
    expect(result.decisions).toEqual([]);
    expect(result.mentions).toEqual([]);
    expect(result.needsReplyScore).toBe(65);
    expect(result.voiceNoteHighlights).toEqual([]);
  });

  it('falls back to rule-based summarization on API error', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);

    // Should fall back to rule-based summary
    expect(result.shortSummary).toContain('1 message');
    expect(result.shortSummary).toContain('Alice');
  });

  it('falls back to rule-based summarization on network error', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);

    // Should fall back to rule-based summary
    expect(result.shortSummary).toContain('1 message');
    expect(result.shortSummary).toContain('Alice');
  });

  it('falls back to rule-based summarization on invalid JSON response', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { role: 'assistant', content: 'not valid json at all' },
            finish_reason: 'stop',
          },
        ],
      }),
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);

    // Should fall back to rule-based summary
    expect(result.shortSummary).toContain('1 message');
  });

  it('clamps needsReplyScore between 0 and 100', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockLLMResponse({
      shortSummary: 'Chat',
      detailedSummary: 'Details',
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      needsReplyScore: 150,
      voiceNoteHighlights: [],
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);
    expect(result.needsReplyScore).toBe(100);
  });

  it('handles partial LLM response with missing fields gracefully', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockLLMResponse({
      shortSummary: 'Brief chat',
      // Missing all other fields
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);

    expect(result.shortSummary).toBe('Brief chat');
    expect(result.detailedSummary).toBe('');
    expect(result.actionItems).toEqual([]);
    expect(result.unansweredQuestions).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.mentions).toEqual([]);
    expect(result.needsReplyScore).toBe(0);
    expect(result.voiceNoteHighlights).toEqual([]);
  });

  it('handles voice note messages in prompt', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Check this', messageType: 'text' }),
      makeMessage({ id: 'msg-2', senderName: 'Bob', messageType: 'voice', timestamp: '2024-01-01T11:00:00Z' }),
    ];

    mockLLMResponse({
      shortSummary: 'Alice shared text, Bob sent a voice note.',
      detailedSummary: 'Alice asked to check something. Bob responded with a voice note.',
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      needsReplyScore: 20,
      voiceNoteHighlights: ['Voice note from Bob at 11:00'],
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);

    // Verify voice note is in the prompt
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.messages[1].content).toContain('[voice note]');

    expect(result.voiceNoteHighlights).toEqual(['Voice note from Bob at 11:00']);
  });

  it('supports custom base URL for alternative providers', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    const customConfig = {
      apiKey: 'custom-key',
      model: 'custom-model',
      baseUrl: 'https://custom.llm.provider/v1',
    };

    mockLLMResponse({
      shortSummary: 'Hello from Alice',
      detailedSummary: '',
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      needsReplyScore: 0,
      voiceNoteHighlights: [],
    });

    await generateSummaryWithLLM(messages, customConfig);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://custom.llm.provider/v1/chat/completions');
  });

  it('strips markdown code fences from LLM response', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', senderName: 'Alice', textBody: 'Hello' }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '```json\n{"shortSummary":"Hello","detailedSummary":"","actionItems":[],"unansweredQuestions":[],"decisions":[],"mentions":[],"needsReplyScore":0,"voiceNoteHighlights":[]}\n```',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    });

    const result = await generateSummaryWithLLM(messages, LLM_CONFIG);
    expect(result.shortSummary).toBe('Hello');
  });
});
