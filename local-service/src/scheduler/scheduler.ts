import cron from 'node-cron';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';
import {
  getTrackedConversations,
  getMessagesByConversation,
  createSummary,
  createDeliveryLog,
  updateDeliveryLog,
  getSummariesByConversation,
} from '../db/repositories';
import { generateSummary } from '../summarizer/summarizer';
import { sendTelegramMessage, formatQuickDigest } from '../delivery/telegram';
import type { SummaryResponse } from '../models/types';

let scheduledTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (scheduledTask) {
    logger.warn('Scheduler already running');
    return;
  }

  // Run every hour at minute 0
  scheduledTask = cron.schedule('0 * * * *', async () => {
    logger.info('Scheduler tick – checking tracked conversations');
    await processTrackedConversations();
  });

  logger.info('Scheduler started (runs every hour)');
}

export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

async function processTrackedConversations(): Promise<void> {
  try {
    const tracked = getTrackedConversations();
    const enabledConversations = tracked.filter(tc => tc.enabled);

    for (const tc of enabledConversations) {
      try {
        await processOneTrackedConversation(tc.conversationId, tc.digestFrequency, tc.telegramTargetRef);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to process tracked conversation', {
          conversationId: tc.conversationId,
          error: errorMessage,
        });
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Scheduler processing error', { error: errorMessage });
  }
}

async function processOneTrackedConversation(
  conversationId: string,
  frequency: string,
  telegramTarget?: string,
): Promise<void> {
  if (!shouldGenerateDigest(conversationId, frequency)) {
    return;
  }

  const messages = getMessagesByConversation(conversationId);
  if (messages.length === 0) {
    return;
  }

  const result = await generateSummary(messages);

  const summary = createSummary({
    conversationId,
    summaryType: frequency === 'hourly' ? 'hourly' : 'daily',
    shortSummary: result.shortSummary,
    detailedSummary: result.detailedSummary,
    actionItemsJson: result.actionItems,
    unansweredQuestionsJson: result.unansweredQuestions,
    decisionsJson: result.decisions,
    mentionsJson: result.mentions,
    needsReplyScore: result.needsReplyScore,
    voiceNoteHighlights: result.voiceNoteHighlights,
  });

  // Deliver via Telegram if configured
  const config = getConfig();
  const chatId = telegramTarget || config.telegramChatId;
  if (config.telegramBotToken && chatId) {
    const summaryResponse: SummaryResponse = {
      id: summary.id,
      conversationTitle: conversationId,
      summaryType: summary.summaryType,
      shortSummary: summary.shortSummary,
      detailedSummary: summary.detailedSummary,
      actionItems: result.actionItems,
      unansweredQuestions: result.unansweredQuestions,
      decisions: result.decisions,
      mentions: result.mentions,
      needsReplyScore: result.needsReplyScore,
      voiceNoteHighlights: result.voiceNoteHighlights,
      createdAt: summary.createdAt,
    };

    const text = formatQuickDigest(summaryResponse);
    const deliveryLog = createDeliveryLog({
      summaryId: summary.id,
      channel: 'telegram',
      status: 'pending',
    });

    const deliveryResult = await sendTelegramMessage(config.telegramBotToken, chatId, text);
    updateDeliveryLog(deliveryLog.id, {
      status: deliveryResult.success ? 'sent' : 'failed',
      externalRef: deliveryResult.messageId,
      sentAt: deliveryResult.success ? new Date().toISOString() : undefined,
      errorMessage: deliveryResult.error,
    });
  }

  logger.info('Digest generated for tracked conversation', { conversationId });
}

function shouldGenerateDigest(conversationId: string, frequency: string): boolean {
  const existingSummaries = getSummariesByConversation(conversationId);
  if (existingSummaries.length === 0) {
    return true;
  }

  const latest = existingSummaries[0]; // sorted DESC by createdAt
  const latestTime = new Date(latest.createdAt).getTime();
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  if (frequency === 'hourly') {
    return now - latestTime > hourMs;
  }
  if (frequency === 'daily') {
    return now - latestTime > 24 * hourMs;
  }

  return false;
}
