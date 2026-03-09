import { Router, Request, Response } from 'express';
import type {
  ManualSummaryRequest,
  IncrementalExtractionRequest,
  TranscribeJobRequest,
  TelegramDeliveryRequest,
  TrackedConversationRequest,
  SummaryResponse,
  HealthResponse,
  Message,
} from '../models/types';
import {
  createConversation,
  getConversationByRef,
  createMessage,
  getMessagesByConversation,
  createSummary,
  getSummaryById,
  getTrackedConversations,
  createTrackedConversation,
  getTrackedConversationById,
  updateTrackedConversation,
  createDeliveryLog,
  updateDeliveryLog,
  createJob,
  getJobById,
  getConversation,
} from '../db/repositories';
import { generateSummary, generateSummaryWithLLM } from '../summarizer/summarizer';
import { enqueueJob, getJobStatus } from '../jobs/jobQueue';
import { sendTelegramMessage, formatQuickDigest, formatFullDigest, formatActionOnly } from '../delivery/telegram';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

const router = Router();
const startTime = Date.now();

// ── Health ──────────────────────────────────────────────────────

router.get('/api/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    version: '0.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    database: true,
  };
  res.json(response);
});

// ── Manual Summary ──────────────────────────────────────────────

router.post('/api/extract/manual-summary', async (req: Request, res: Response) => {
  try {
    const body = req.body as ManualSummaryRequest;

    if (!body.conversation || !body.messages || body.messages.length === 0) {
      res.status(400).json({ error: 'conversation and messages are required' });
      return;
    }

    // Find or create conversation
    let conversation = getConversationByRef(body.conversation.platformConversationRef);
    if (!conversation) {
      conversation = createConversation({
        platformConversationRef: body.conversation.platformConversationRef,
        title: body.conversation.title,
        participantsJson: body.conversation.participants,
        isTracked: false,
      });
    }

    // Store messages
    const storedMessages: Message[] = [];
    for (const extracted of body.messages) {
      const msg = createMessage({
        conversationId: conversation.id,
        externalMessageRef: extracted.externalMessageRef,
        senderName: extracted.senderName,
        timestamp: extracted.timestamp || new Date().toISOString(),
        messageType: extracted.messageType,
        textBody: extracted.textBody,
        audioRef: extracted.audioRef,
        rawMetadataJson: extracted.rawMetadataJson,
      });
      storedMessages.push(msg);
    }

    // Generate summary
    const config = getConfig();
    let result;
    if (body.useLLM && config.llmApiKey) {
      result = await generateSummaryWithLLM(storedMessages, config.llmApiKey);
    } else {
      result = await generateSummary(storedMessages);
    }

    const summary = createSummary({
      conversationId: conversation.id,
      summaryType: 'manual',
      windowStart: storedMessages[0]?.timestamp,
      windowEnd: storedMessages[storedMessages.length - 1]?.timestamp,
      shortSummary: result.shortSummary,
      detailedSummary: result.detailedSummary,
      actionItemsJson: result.actionItems,
      unansweredQuestionsJson: result.unansweredQuestions,
      decisionsJson: result.decisions,
      mentionsJson: result.mentions,
      needsReplyScore: result.needsReplyScore,
      voiceNoteHighlights: result.voiceNoteHighlights,
    });

    const response: SummaryResponse = {
      id: summary.id,
      conversationTitle: conversation.title,
      summaryType: summary.summaryType,
      windowStart: summary.windowStart,
      windowEnd: summary.windowEnd,
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

    res.status(201).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Manual summary failed', { error: message });
    res.status(500).json({ error: message });
  }
});

// ── Incremental Extraction ──────────────────────────────────────

router.post('/api/extract/incremental', async (req: Request, res: Response) => {
  try {
    const body = req.body as IncrementalExtractionRequest;

    if (!body.conversationId || !body.messages || body.messages.length === 0) {
      res.status(400).json({ error: 'conversationId and messages are required' });
      return;
    }

    const conversation = getConversation(body.conversationId);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    for (const extracted of body.messages) {
      createMessage({
        conversationId: body.conversationId,
        externalMessageRef: extracted.externalMessageRef,
        senderName: extracted.senderName,
        timestamp: extracted.timestamp || new Date().toISOString(),
        messageType: extracted.messageType,
        textBody: extracted.textBody,
        audioRef: extracted.audioRef,
        rawMetadataJson: extracted.rawMetadataJson,
      });
    }

    res.status(200).json({ added: body.messages.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Incremental extraction failed', { error: message });
    res.status(500).json({ error: message });
  }
});

// ── Transcription Jobs ──────────────────────────────────────────

router.post('/api/jobs/transcribe', (req: Request, res: Response) => {
  try {
    const body = req.body as TranscribeJobRequest;

    if (!body.messageId) {
      res.status(400).json({ error: 'messageId is required' });
      return;
    }

    const dbJob = createJob({ type: 'transcribe', payload: body });
    const inMemoryJob = enqueueJob('transcribe', { audioRef: body.audioRef || body.messageId });

    res.status(202).json({
      id: dbJob.id,
      inMemoryJobId: inMemoryJob.id,
      type: 'transcribe',
      status: 'queued',
      createdAt: dbJob.createdAt,
      updatedAt: dbJob.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Transcription job creation failed', { error: message });
    res.status(500).json({ error: message });
  }
});

// ── Telegram Delivery ───────────────────────────────────────────

router.post('/api/deliver/telegram', async (req: Request, res: Response) => {
  try {
    const body = req.body as TelegramDeliveryRequest;

    if (!body.summaryId) {
      res.status(400).json({ error: 'summaryId is required' });
      return;
    }

    const summary = getSummaryById(body.summaryId);
    if (!summary) {
      res.status(404).json({ error: 'Summary not found' });
      return;
    }

    const config = getConfig();
    const botToken = config.telegramBotToken;
    const chatId = body.targetChat || config.telegramChatId;

    if (!botToken || !chatId) {
      res.status(400).json({ error: 'Telegram bot token and chat ID must be configured' });
      return;
    }

    const conversation = getConversation(summary.conversationId);
    const summaryResponse: SummaryResponse = {
      id: summary.id,
      conversationTitle: conversation?.title || 'Unknown',
      summaryType: summary.summaryType,
      windowStart: summary.windowStart,
      windowEnd: summary.windowEnd,
      shortSummary: summary.shortSummary,
      detailedSummary: summary.detailedSummary,
      actionItems: summary.actionItemsJson || [],
      unansweredQuestions: summary.unansweredQuestionsJson || [],
      decisions: summary.decisionsJson || [],
      mentions: summary.mentionsJson || [],
      needsReplyScore: summary.needsReplyScore || 0,
      voiceNoteHighlights: summary.voiceNoteHighlights || [],
      createdAt: summary.createdAt,
    };

    let text: string;
    switch (body.format) {
      case 'full':
        text = formatFullDigest(summaryResponse);
        break;
      case 'action_only':
        text = formatActionOnly(summaryResponse);
        break;
      default:
        text = formatQuickDigest(summaryResponse);
    }

    const deliveryLog = createDeliveryLog({
      summaryId: summary.id,
      channel: 'telegram',
      status: 'pending',
    });

    const result = await sendTelegramMessage(botToken, chatId, text);

    updateDeliveryLog(deliveryLog.id, {
      status: result.success ? 'sent' : 'failed',
      externalRef: result.messageId,
      sentAt: result.success ? new Date().toISOString() : undefined,
      errorMessage: result.error,
    });

    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(502).json({ success: false, error: result.error });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Telegram delivery failed', { error: message });
    res.status(500).json({ error: message });
  }
});

// ── Tracked Conversations ───────────────────────────────────────

router.get('/api/tracked-conversations', (_req: Request, res: Response) => {
  try {
    const conversations = getTrackedConversations();
    res.json(conversations);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to list tracked conversations', { error: message });
    res.status(500).json({ error: message });
  }
});

router.post('/api/tracked-conversations', (req: Request, res: Response) => {
  try {
    const body = req.body as TrackedConversationRequest;

    if (!body.conversationId || !body.digestFrequency) {
      res.status(400).json({ error: 'conversationId and digestFrequency are required' });
      return;
    }

    const tc = createTrackedConversation({
      conversationId: body.conversationId,
      digestFrequency: body.digestFrequency,
      quietHoursJson: body.quietHoursJson,
      includeVoiceNotes: body.includeVoiceNotes ?? true,
      includeActionItems: body.includeActionItems ?? true,
      includeShortSummary: body.includeShortSummary ?? true,
      telegramTargetRef: body.telegramTargetRef,
      enabled: body.enabled ?? true,
    });

    res.status(201).json(tc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create tracked conversation', { error: message });
    res.status(500).json({ error: message });
  }
});

router.patch('/api/tracked-conversations/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getTrackedConversationById(id);

    if (!existing) {
      res.status(404).json({ error: 'Tracked conversation not found' });
      return;
    }

    const body = req.body as Partial<TrackedConversationRequest>;
    updateTrackedConversation(id, {
      digestFrequency: body.digestFrequency,
      quietHoursJson: body.quietHoursJson,
      includeVoiceNotes: body.includeVoiceNotes,
      includeActionItems: body.includeActionItems,
      includeShortSummary: body.includeShortSummary,
      telegramTargetRef: body.telegramTargetRef,
      enabled: body.enabled,
    });

    const updated = getTrackedConversationById(id as string);
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to update tracked conversation', { error: message });
    res.status(500).json({ error: message });
  }
});

// ── Jobs ────────────────────────────────────────────────────────

router.get('/api/jobs/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Check in-memory queue first, then database
    const inMemory = getJobStatus(id);
    if (inMemory) {
      res.json(inMemory);
      return;
    }

    const dbJob = getJobById(id);
    if (!dbJob) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(dbJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to get job', { error: message });
    res.status(500).json({ error: message });
  }
});

// ── Summaries ───────────────────────────────────────────────────

router.get('/api/summaries/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const summary = getSummaryById(id);

    if (!summary) {
      res.status(404).json({ error: 'Summary not found' });
      return;
    }

    const conversation = getConversation(summary.conversationId);
    const response: SummaryResponse = {
      id: summary.id,
      conversationTitle: conversation?.title || 'Unknown',
      summaryType: summary.summaryType,
      windowStart: summary.windowStart,
      windowEnd: summary.windowEnd,
      shortSummary: summary.shortSummary,
      detailedSummary: summary.detailedSummary,
      actionItems: summary.actionItemsJson || [],
      unansweredQuestions: summary.unansweredQuestionsJson || [],
      decisions: summary.decisionsJson || [],
      mentions: summary.mentionsJson || [],
      needsReplyScore: summary.needsReplyScore || 0,
      voiceNoteHighlights: summary.voiceNoteHighlights || [],
      createdAt: summary.createdAt,
    };

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to get summary', { error: message });
    res.status(500).json({ error: message });
  }
});

export default router;
