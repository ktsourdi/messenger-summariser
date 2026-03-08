// Data model types for Messenger Conversation Summarizer

// Message types
export type MessageType = 'text' | 'voice' | 'system' | 'unknown';

// Summary types
export type SummaryType = 'manual' | 'hourly' | 'daily' | 'since_last_check';

// Delivery channels
export type DeliveryChannel = 'telegram';

// Delivery status
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

// Transcription status
export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Job status
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

// Digest frequency
export type DigestFrequency = 'hourly' | 'daily' | 'manual';

// Conversation interface
export interface Conversation {
  id: string;
  platformConversationRef: string;
  title: string;
  participantsJson: string[];
  isTracked: boolean;
  createdAt: string;
  updatedAt: string;
}

// Message interface
export interface Message {
  id: string;
  conversationId: string;
  externalMessageRef?: string;
  senderName: string;
  timestamp: string;
  messageType: MessageType;
  textBody?: string;
  audioRef?: string;
  rawMetadataJson?: string;
  createdAt: string;
}

// Transcript interface
export interface Transcript {
  id: string;
  messageId: string;
  transcriptText: string;
  transcriptSummary?: string;
  confidence?: number;
  status: TranscriptStatus;
  createdAt: string;
}

// Summary interface
export interface Summary {
  id: string;
  conversationId: string;
  summaryType: SummaryType;
  windowStart?: string;
  windowEnd?: string;
  shortSummary: string;
  detailedSummary?: string;
  actionItemsJson?: string[];
  unansweredQuestionsJson?: string[];
  decisionsJson?: string[];
  mentionsJson?: string[];
  needsReplyScore?: number;
  voiceNoteHighlights?: string[];
  createdAt: string;
}

// Tracked conversation interface
export interface TrackedConversation {
  id: string;
  conversationId: string;
  digestFrequency: DigestFrequency;
  quietHoursJson?: { start: string; end: string };
  includeVoiceNotes: boolean;
  includeActionItems: boolean;
  includeShortSummary: boolean;
  telegramTargetRef?: string;
  enabled: boolean;
}

// Delivery log interface
export interface DeliveryLog {
  id: string;
  summaryId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  externalRef?: string;
  sentAt?: string;
  errorMessage?: string;
}

// API request/response types

// Manual summary request from extension to local service
export interface ManualSummaryRequest {
  conversation: {
    platformConversationRef: string;
    title: string;
    participants: string[];
  };
  messages: ExtractedMessage[];
  extractionWindow?: {
    type: 'last_n' | 'last_minutes' | 'last_hours' | 'all_visible';
    value?: number;
  };
  includeVoiceNotes: boolean;
}

// Extracted message from the extension
export interface ExtractedMessage {
  externalMessageRef?: string;
  senderName: string;
  timestamp?: string;
  messageType: MessageType;
  textBody?: string;
  audioRef?: string;
  rawMetadataJson?: string;
}

// Incremental extraction request
export interface IncrementalExtractionRequest {
  conversationId: string;
  messages: ExtractedMessage[];
}

// Transcription job request
export interface TranscribeJobRequest {
  messageId: string;
  audioRef?: string;
  audioBlob?: string; // base64 encoded
}

// Telegram delivery request
export interface TelegramDeliveryRequest {
  summaryId: string;
  targetChat?: string;
  format?: 'quick' | 'full' | 'action_only';
}

// Summary response
export interface SummaryResponse {
  id: string;
  conversationTitle: string;
  summaryType: SummaryType;
  windowStart?: string;
  windowEnd?: string;
  shortSummary: string;
  detailedSummary?: string;
  actionItems: string[];
  unansweredQuestions: string[];
  decisions: string[];
  mentions: string[];
  needsReplyScore: number;
  voiceNoteHighlights: string[];
  createdAt: string;
}

// Tracked conversation create/update request
export interface TrackedConversationRequest {
  conversationId: string;
  digestFrequency: DigestFrequency;
  quietHoursJson?: { start: string; end: string };
  includeVoiceNotes?: boolean;
  includeActionItems?: boolean;
  includeShortSummary?: boolean;
  telegramTargetRef?: string;
  enabled?: boolean;
}

// Health check response
export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  database: boolean;
}

// Job status response
export interface JobStatusResponse {
  id: string;
  type: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Settings
export interface Settings {
  defaultSummaryRange: number; // number of messages
  defaultDigestFrequency: DigestFrequency;
  includeVoiceNotes: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  summaryLength: 'short' | 'medium' | 'long';
  keepRawMessages: boolean;
  autoDeleteTranscriptsDays?: number;
}
