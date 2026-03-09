import type { SummaryResponse } from '../models/types';
import { logger } from '../utils/logger';

const TELEGRAM_MAX_LENGTH = 4096;

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const chunks = splitMessage(text, TELEGRAM_MAX_LENGTH);

  let lastMessageId: string | undefined;

  for (const chunk of chunks) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });

      const data = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string };

      if (!data.ok) {
        logger.error('Telegram API error', { description: data.description });
        return { success: false, error: data.description || 'Unknown Telegram error' };
      }

      lastMessageId = String(data.result?.message_id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Telegram send failed', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  return { success: true, messageId: lastMessageId };
}

// ── Formatters ──────────────────────────────────────────────────

export function formatQuickDigest(summary: SummaryResponse): string {
  const lines: string[] = [];
  lines.push(`📝 *${summary.conversationTitle}*`);
  lines.push('');
  lines.push(summary.shortSummary);

  if (summary.needsReplyScore > 50) {
    lines.push('');
    lines.push(`⚠️ Needs reply (score: ${summary.needsReplyScore}/100)`);
  }

  if (summary.actionItems.length > 0) {
    lines.push('');
    lines.push('*Action items:*');
    for (const item of summary.actionItems.slice(0, 3)) {
      lines.push(`  • ${item}`);
    }
    if (summary.actionItems.length > 3) {
      lines.push(`  _…and ${summary.actionItems.length - 3} more_`);
    }
  }

  return lines.join('\n');
}

export function formatFullDigest(summary: SummaryResponse): string {
  const lines: string[] = [];
  lines.push(`📝 *${summary.conversationTitle}*`);
  lines.push(`_${summary.summaryType} summary_`);
  lines.push('');
  lines.push(`*Summary:* ${summary.shortSummary}`);

  if (summary.detailedSummary) {
    lines.push('');
    lines.push('*Details:*');
    lines.push(summary.detailedSummary);
  }

  if (summary.actionItems.length > 0) {
    lines.push('');
    lines.push('*Action Items:*');
    for (const item of summary.actionItems) {
      lines.push(`  • ${item}`);
    }
  }

  if (summary.unansweredQuestions.length > 0) {
    lines.push('');
    lines.push('*Unanswered Questions:*');
    for (const q of summary.unansweredQuestions) {
      lines.push(`  ❓ ${q}`);
    }
  }

  if (summary.decisions.length > 0) {
    lines.push('');
    lines.push('*Decisions:*');
    for (const d of summary.decisions) {
      lines.push(`  ✅ ${d}`);
    }
  }

  if (summary.mentions.length > 0) {
    lines.push('');
    lines.push(`*Mentions:* ${summary.mentions.join(', ')}`);
  }

  if (summary.voiceNoteHighlights.length > 0) {
    lines.push('');
    lines.push('*Voice Notes:*');
    for (const v of summary.voiceNoteHighlights) {
      lines.push(`  🎤 ${v}`);
    }
  }

  lines.push('');
  lines.push(`Reply score: ${summary.needsReplyScore}/100`);

  return lines.join('\n');
}

export function formatActionOnly(summary: SummaryResponse): string {
  const lines: string[] = [];
  lines.push(`📋 *Action Items – ${summary.conversationTitle}*`);
  lines.push('');

  if (summary.actionItems.length === 0) {
    lines.push('_No action items found._');
  } else {
    for (const item of summary.actionItems) {
      lines.push(`  • ${item}`);
    }
  }

  if (summary.unansweredQuestions.length > 0) {
    lines.push('');
    lines.push('*Unanswered Questions:*');
    for (const q of summary.unansweredQuestions) {
      lines.push(`  ❓ ${q}`);
    }
  }

  return lines.join('\n');
}

// ── Utilities ───────────────────────────────────────────────────

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Split at last newline before the limit
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Fall back to splitting at a space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}
