import OpenAI from 'openai';
import type { Message } from '../models/types';
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
 * Build the system prompt that instructs the LLM to return structured JSON.
 */
function buildSystemPrompt(): string {
  return `You are a conversation summariser.  You receive a series of chat messages and produce a structured JSON summary.

Return **only** valid JSON matching this schema (no markdown fences, no extra keys):
{
  "shortSummary": "<one-line overview>",
  "detailedSummary": "<multi-line markdown summary grouped by topic>",
  "actionItems": ["<sender>: <action item>", ...],
  "unansweredQuestions": ["<sender>: <question>", ...],
  "decisions": ["<sender>: <decision>", ...],
  "mentions": ["@name", ...],
  "needsReplyScore": <0-100>,
  "voiceNoteHighlights": ["<description>", ...]
}

Rules:
- shortSummary: ≤120 chars, include participant count and time range.
- actionItems: extract every task, request, or commitment.
- unansweredQuestions: include only questions that no subsequent message answered.
- decisions: include explicit agreements or conclusions.
- mentions: list every @mention found.
- needsReplyScore: 0 = no reply needed, 100 = urgent reply needed. Judge by unanswered questions, pending tasks, and recency.
- voiceNoteHighlights: note any voice messages with sender and timestamp.
- detailedSummary: group insights by topic using markdown headings.`;
}

/**
 * Format messages into a user prompt for the LLM.
 */
function buildUserPrompt(messages: Message[]): string {
  const lines = messages.map(m => {
    const time = formatTime(m.timestamp);
    const type = m.messageType === 'voice' ? ' [voice note]' : '';
    const body = m.textBody || '';
    return `[${time}] ${m.senderName}${type}: ${body}`;
  });
  return `Summarise the following conversation:\n\n${lines.join('\n')}`;
}

/**
 * Parse the LLM response text into a SummaryResult, falling back to rule-based
 * if the JSON is malformed.
 */
function parseLLMResponse(text: string): SummaryResult | null {
  try {
    const parsed = JSON.parse(text);
    return {
      shortSummary: String(parsed.shortSummary || ''),
      detailedSummary: String(parsed.detailedSummary || ''),
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.map(String) : [],
      unansweredQuestions: Array.isArray(parsed.unansweredQuestions) ? parsed.unansweredQuestions.map(String) : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String) : [],
      mentions: Array.isArray(parsed.mentions) ? parsed.mentions.map(String) : [],
      needsReplyScore: Math.min(Math.max(Number(parsed.needsReplyScore) || 0, 0), 100),
      voiceNoteHighlights: Array.isArray(parsed.voiceNoteHighlights) ? parsed.voiceNoteHighlights.map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Generate a summary using the OpenAI Chat Completions API.
 * Falls back to the rule-based engine if the LLM call fails.
 */
export async function generateSummaryWithLLM(
  messages: Message[],
  apiKey: string,
  model: string = 'gpt-4o-mini',
): Promise<SummaryResult> {
  if (messages.length === 0) {
    return generateSummary(messages);
  }

  logger.info('Generating LLM summary', { messageCount: messages.length, model });

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(messages) },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      logger.error('LLM returned empty content – falling back to rule-based engine');
      return generateSummary(messages);
    }

    const result = parseLLMResponse(content);
    if (!result) {
      logger.error('Failed to parse LLM response – falling back to rule-based engine', { content });
      return generateSummary(messages);
    }

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('LLM API call failed – falling back to rule-based engine', { error: errorMessage });
    return generateSummary(messages);
  }
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
