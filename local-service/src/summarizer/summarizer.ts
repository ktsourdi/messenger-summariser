import type { Message } from '../models/types';
import { chatCompletion, type LLMConfig, type ChatMessage } from '../llm/llmClient';
import { logger } from '../utils/logger';

export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  actionItems: string[];
  unansweredQuestions: string[];
  decisions: string[];
  mentions: string[];
  needsReplyScore: number;
  voiceNoteHighlights: string[];
}

const ACTION_KEYWORDS = [
  'need to', 'should', 'must', 'will do', 'todo',
  'please', 'can you', 'could you', 'have to', 'going to',
];

const DECISION_KEYWORDS = [
  'decided', 'agreed', "let's go with", 'confirmed',
  'approved', 'settled on', 'we will', "we'll",
];

export async function generateSummary(messages: Message[]): Promise<SummaryResult> {
  logger.info('Generating rule-based summary', { messageCount: messages.length });

  if (messages.length === 0) {
    return {
      shortSummary: 'No messages to summarize.',
      detailedSummary: '',
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      needsReplyScore: 0,
      voiceNoteHighlights: [],
    };
  }

  const senders = [...new Set(messages.map(m => m.senderName))];
  const timeRange = getTimeRange(messages);
  const shortSummary = buildShortSummary(messages, senders, timeRange);
  const detailedSummary = buildDetailedSummary(messages);
  const actionItems = extractActionItems(messages);
  const unansweredQuestions = extractUnansweredQuestions(messages);
  const decisions = extractDecisions(messages);
  const mentions = extractMentions(messages);
  const voiceNoteHighlights = extractVoiceNoteHighlights(messages);
  const needsReplyScore = calculateNeedsReplyScore(unansweredQuestions, actionItems, messages);

  return {
    shortSummary,
    detailedSummary,
    actionItems,
    unansweredQuestions,
    decisions,
    mentions,
    needsReplyScore,
    voiceNoteHighlights,
  };
}

/**
 * LLM-based summarization using the OpenAI-compatible chat completions API.
 * Falls back to the rule-based engine on failure.
 */
export async function generateSummaryWithLLM(
  messages: Message[],
  llmConfig: LLMConfig,
): Promise<SummaryResult> {
  if (messages.length === 0) {
    return generateSummary(messages);
  }

  logger.info('Generating LLM-based summary', { messageCount: messages.length });

  try {
    const chatMessages = buildLLMPrompt(messages);
    const raw = await chatCompletion(llmConfig, chatMessages, { type: 'json_object' });
    const parsed = parseLLMResponse(raw);
    return parsed;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn('LLM summarization failed, falling back to rule-based engine', { error: errorMessage });
    return generateSummary(messages);
  }
}

const SYSTEM_PROMPT = `You are a conversation summarizer. Analyze the provided chat messages and return a JSON object with these fields:
- "shortSummary": A brief 1-2 sentence summary of the conversation.
- "detailedSummary": A longer summary covering key points, organized by topic or participant.
- "actionItems": An array of strings, each an action item mentioned (e.g., "Alice: needs to send the report by Friday").
- "unansweredQuestions": An array of strings, each a question that was asked but not answered in the conversation.
- "decisions": An array of strings, each a decision that was made during the conversation.
- "mentions": An array of @mentions found (e.g., "@Bob").
- "needsReplyScore": A number from 0 to 100 indicating how urgently this conversation needs a reply. Higher = more urgent.
- "voiceNoteHighlights": An array of strings describing any voice notes (e.g., "Voice note from Alice at 10:30").

Return ONLY valid JSON. Do not include any markdown formatting or code fences.`;

function buildLLMPrompt(messages: Message[]): ChatMessage[] {
  const transcript = messages
    .map((m) => {
      const time = formatTime(m.timestamp);
      const type = m.messageType === 'voice' ? ' [voice note]' : '';
      const body = m.textBody || '[no text]';
      return `[${time}] ${m.senderName}${type}: ${body}`;
    })
    .join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Here is the conversation to summarize:\n\n${transcript}` },
  ];
}

function parseLLMResponse(raw: string): SummaryResult {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const data = JSON.parse(cleaned);

  return {
    shortSummary: typeof data.shortSummary === 'string' ? data.shortSummary : '',
    detailedSummary: typeof data.detailedSummary === 'string' ? data.detailedSummary : '',
    actionItems: Array.isArray(data.actionItems) ? data.actionItems.map(String) : [],
    unansweredQuestions: Array.isArray(data.unansweredQuestions) ? data.unansweredQuestions.map(String) : [],
    decisions: Array.isArray(data.decisions) ? data.decisions.map(String) : [],
    mentions: Array.isArray(data.mentions) ? data.mentions.map(String) : [],
    needsReplyScore: typeof data.needsReplyScore === 'number' ? Math.min(Math.max(data.needsReplyScore, 0), 100) : 0,
    voiceNoteHighlights: Array.isArray(data.voiceNoteHighlights) ? data.voiceNoteHighlights.map(String) : [],
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function getTimeRange(messages: Message[]): { start: string; end: string } {
  const timestamps = messages.map(m => m.timestamp).filter(Boolean).sort();
  return {
    start: timestamps[0] || 'unknown',
    end: timestamps[timestamps.length - 1] || 'unknown',
  };
}

function buildShortSummary(
  messages: Message[],
  senders: string[],
  timeRange: { start: string; end: string },
): string {
  const parts: string[] = [];
  parts.push(`${messages.length} message${messages.length === 1 ? '' : 's'}`);
  parts.push(`from ${senders.join(', ')}`);

  if (timeRange.start !== 'unknown') {
    parts.push(`(${formatTime(timeRange.start)} – ${formatTime(timeRange.end)})`);
  }

  const topics = extractTopics(messages);
  if (topics.length > 0) {
    parts.push(`• Topics: ${topics.join(', ')}`);
  }

  return parts.join(' ');
}

function buildDetailedSummary(messages: Message[]): string {
  const bySender: Record<string, string[]> = {};
  for (const msg of messages) {
    if (!bySender[msg.senderName]) {
      bySender[msg.senderName] = [];
    }
    const time = formatTime(msg.timestamp);
    const body = msg.textBody || (msg.messageType === 'voice' ? '[voice note]' : '[no text]');
    bySender[msg.senderName].push(`[${time}] ${body}`);
  }

  return Object.entries(bySender)
    .map(([sender, lines]) => `**${sender}:**\n${lines.join('\n')}`)
    .join('\n\n');
}

function extractActionItems(messages: Message[]): string[] {
  const items: string[] = [];
  for (const msg of messages) {
    if (!msg.textBody) continue;
    const lower = msg.textBody.toLowerCase();
    for (const keyword of ACTION_KEYWORDS) {
      if (lower.includes(keyword)) {
        items.push(`${msg.senderName}: ${msg.textBody.trim()}`);
        break;
      }
    }
  }
  return items;
}

function extractUnansweredQuestions(messages: Message[]): string[] {
  const questions: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.textBody) continue;
    if (msg.textBody.trim().endsWith('?')) {
      // Consider it unanswered if it's the last message or the next message is from the same sender
      const isLast = i === messages.length - 1;
      const nextIsSameSender = !isLast && messages[i + 1].senderName === msg.senderName;
      if (isLast || nextIsSameSender) {
        questions.push(`${msg.senderName}: ${msg.textBody.trim()}`);
      }
    }
  }
  return questions;
}

function extractDecisions(messages: Message[]): string[] {
  const decisions: string[] = [];
  for (const msg of messages) {
    if (!msg.textBody) continue;
    const lower = msg.textBody.toLowerCase();
    for (const keyword of DECISION_KEYWORDS) {
      if (lower.includes(keyword)) {
        decisions.push(`${msg.senderName}: ${msg.textBody.trim()}`);
        break;
      }
    }
  }
  return decisions;
}

function extractMentions(messages: Message[]): string[] {
  const mentionSet = new Set<string>();
  const mentionRegex = /@(\w+)/g;
  for (const msg of messages) {
    if (!msg.textBody) continue;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(msg.textBody)) !== null) {
      mentionSet.add(`@${match[1]}`);
    }
  }
  return [...mentionSet];
}

function extractVoiceNoteHighlights(messages: Message[]): string[] {
  const highlights: string[] = [];
  for (const msg of messages) {
    if (msg.messageType === 'voice') {
      highlights.push(`Voice note from ${msg.senderName} at ${formatTime(msg.timestamp)}`);
    }
  }
  return highlights;
}

function calculateNeedsReplyScore(
  questions: string[],
  actionItems: string[],
  messages: Message[],
): number {
  let score = 0;
  score += questions.length * 20;
  score += actionItems.length * 10;

  // Boost if the last message is a question
  const last = messages[messages.length - 1];
  if (last?.textBody?.trim().endsWith('?')) {
    score += 25;
  }

  return Math.min(score, 100);
}

const STOP_WORDS = new Set(['about', 'above', 'after', 'their', 'there', 'these', 'those', 'through', 'would', 'should', 'could', 'which', 'where', 'being', 'other', 'before', 'between']);

function extractTopics(messages: Message[]): string[] {
  // Simple topic extraction: find the most common nouns (words > 5 chars used more than once)
  const wordCounts: Record<string, number> = {};

  for (const msg of messages) {
    if (!msg.textBody) continue;
    const words = msg.textBody.toLowerCase().split(/\W+/).filter(w => w.length > 5 && !STOP_WORDS.has(w));
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  return Object.entries(wordCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return timestamp;
  }
}
