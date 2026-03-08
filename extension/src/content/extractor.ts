import { SELECTORS, FALLBACK_SELECTORS } from '../parsers/selectors.js';

// Types mirrored from shared/types for Chrome extension use
type MessageType = 'text' | 'voice' | 'system' | 'unknown';

export interface ExtractedMessage {
  externalMessageRef?: string;
  senderName: string;
  timestamp?: string;
  messageType: MessageType;
  textBody?: string;
  audioRef?: string;
  rawMetadataJson?: string;
}

export interface ExtractionOptions {
  lastN?: number;
  lastMinutes?: number;
  lastHours?: number;
  allVisible?: boolean;
}

export interface ConversationInfo {
  title: string;
  participants: string[];
}

export interface VoiceNoteInfo {
  count: number;
  elements: Element[];
}

function queryWithFallback(
  container: Element | Document,
  primary: string,
  fallback?: string,
): Element | null {
  const el = container.querySelector(primary);
  if (el) return el;
  if (fallback) return container.querySelector(fallback);
  return null;
}

function queryAllWithFallback(
  container: Element | Document,
  primary: string,
  fallback?: string,
): Element[] {
  const els = container.querySelectorAll(primary);
  if (els.length > 0) return Array.from(els);
  if (fallback) return Array.from(container.querySelectorAll(fallback));
  return [];
}

function extractSenderFromRow(row: Element): string {
  const senderEl = row.querySelector(SELECTORS.senderName);
  if (senderEl?.textContent) return senderEl.textContent.trim();

  // Walk up to find a message group that contains sender info
  const parent = row.closest(SELECTORS.messageGroup);
  if (parent) {
    const groupSender = parent.querySelector(SELECTORS.senderName);
    if (groupSender?.textContent) return groupSender.textContent.trim();
  }

  return 'Unknown';
}

function extractTimestampFromRow(row: Element): string | undefined {
  const timeEl = row.querySelector(SELECTORS.timestamp);
  if (!timeEl) return undefined;

  const datetime = timeEl.getAttribute('datetime');
  if (datetime) return datetime;

  const title = timeEl.getAttribute('title');
  if (title) {
    try {
      return new Date(title).toISOString();
    } catch {
      // ignore parse errors
    }
  }

  return timeEl.textContent?.trim() || undefined;
}

function detectMessageType(row: Element): MessageType {
  const voiceEl = row.querySelector(SELECTORS.voiceNote);
  if (voiceEl) return 'voice';

  const textEl = row.querySelector(SELECTORS.messageText);
  if (textEl?.textContent?.trim()) return 'text';

  return 'unknown';
}

function extractTextContent(row: Element): string | undefined {
  const textEls = queryAllWithFallback(
    row,
    SELECTORS.messageText,
    FALLBACK_SELECTORS.messageText,
  );

  const parts: string[] = [];
  for (const el of textEls) {
    const text = el.textContent?.trim();
    if (text) parts.push(text);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

function extractAudioRef(row: Element): string | undefined {
  const audioEl = row.querySelector('audio source, audio');
  if (!audioEl) return undefined;

  const src =
    audioEl.getAttribute('src') ||
    audioEl.querySelector('source')?.getAttribute('src');
  return src || undefined;
}

function parseMessageRow(row: Element): ExtractedMessage {
  const messageType = detectMessageType(row);

  return {
    senderName: extractSenderFromRow(row),
    timestamp: extractTimestampFromRow(row),
    messageType,
    textBody: messageType === 'text' ? extractTextContent(row) : undefined,
    audioRef: messageType === 'voice' ? extractAudioRef(row) : undefined,
  };
}

function filterByTime(
  messages: ExtractedMessage[],
  options: ExtractionOptions,
): ExtractedMessage[] {
  if (options.allVisible) return messages;

  if (options.lastN !== undefined) {
    return messages.slice(-options.lastN);
  }

  const now = Date.now();

  if (options.lastMinutes !== undefined) {
    const cutoff = now - options.lastMinutes * 60 * 1000;
    return messages.filter((m) => {
      if (!m.timestamp) return true;
      return new Date(m.timestamp).getTime() >= cutoff;
    });
  }

  if (options.lastHours !== undefined) {
    const cutoff = now - options.lastHours * 60 * 60 * 1000;
    return messages.filter((m) => {
      if (!m.timestamp) return true;
      return new Date(m.timestamp).getTime() >= cutoff;
    });
  }

  return messages;
}

export function extractMessages(
  options: ExtractionOptions = { allVisible: true },
): ExtractedMessage[] {
  try {
    const container =
      queryWithFallback(
        document,
        SELECTORS.messageList,
        FALLBACK_SELECTORS.messageList,
      ) || document;

    const rows = queryAllWithFallback(
      container,
      SELECTORS.messageRow,
      FALLBACK_SELECTORS.messageRow,
    );

    if (rows.length === 0) return [];

    const messages = rows
      .map(parseMessageRow)
      .filter((m) => m.textBody || m.audioRef || m.messageType !== 'unknown');

    return filterByTime(messages, options);
  } catch (error) {
    console.error('[Messenger Summariser] Error extracting messages:', error);
    return [];
  }
}

export function getConversationInfo(): ConversationInfo {
  try {
    const titleEl = queryWithFallback(
      document,
      SELECTORS.conversationTitle,
      FALLBACK_SELECTORS.conversationTitle,
    );
    const title = titleEl?.textContent?.trim() || 'Unknown Conversation';

    const participantElements = document.querySelectorAll(
      SELECTORS.participantList,
    );
    const participants = Array.from(participantElements)
      .map((el) => el.textContent?.trim())
      .filter((name): name is string => !!name);

    // Deduplicate participants
    const unique = [...new Set(participants)];

    return { title, participants: unique.length > 0 ? unique : [title] };
  } catch (error) {
    console.error(
      '[Messenger Summariser] Error getting conversation info:',
      error,
    );
    return { title: 'Unknown Conversation', participants: [] };
  }
}

export function detectVoiceNotes(): VoiceNoteInfo {
  try {
    const elements = Array.from(
      document.querySelectorAll(SELECTORS.voiceNote),
    );
    return { count: elements.length, elements };
  } catch (error) {
    console.error(
      '[Messenger Summariser] Error detecting voice notes:',
      error,
    );
    return { count: 0, elements: [] };
  }
}
