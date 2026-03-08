export type MessageType = 'text' | 'voice' | 'system' | 'unknown';
export type SummaryType = 'manual' | 'hourly' | 'daily' | 'since_last_check';
export type DeliveryChannel = 'telegram';
export type DeliveryStatus = 'pending' | 'sent' | 'failed';
export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type DigestFrequency = 'hourly' | 'daily' | 'manual';
export interface Conversation {
    id: string;
    platformConversationRef: string;
    title: string;
    participantsJson: string[];
    isTracked: boolean;
    createdAt: string;
    updatedAt: string;
}
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
export interface Transcript {
    id: string;
    messageId: string;
    transcriptText: string;
    transcriptSummary?: string;
    confidence?: number;
    status: TranscriptStatus;
    createdAt: string;
}
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
export interface TrackedConversation {
    id: string;
    conversationId: string;
    digestFrequency: DigestFrequency;
    quietHoursJson?: {
        start: string;
        end: string;
    };
    includeVoiceNotes: boolean;
    includeActionItems: boolean;
    includeShortSummary: boolean;
    telegramTargetRef?: string;
    enabled: boolean;
}
export interface DeliveryLog {
    id: string;
    summaryId: string;
    channel: DeliveryChannel;
    status: DeliveryStatus;
    externalRef?: string;
    sentAt?: string;
    errorMessage?: string;
}
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
export interface ExtractedMessage {
    externalMessageRef?: string;
    senderName: string;
    timestamp?: string;
    messageType: MessageType;
    textBody?: string;
    audioRef?: string;
    rawMetadataJson?: string;
}
export interface IncrementalExtractionRequest {
    conversationId: string;
    messages: ExtractedMessage[];
}
export interface TranscribeJobRequest {
    messageId: string;
    audioRef?: string;
    audioBlob?: string;
}
export interface TelegramDeliveryRequest {
    summaryId: string;
    targetChat?: string;
    format?: 'quick' | 'full' | 'action_only';
}
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
export interface TrackedConversationRequest {
    conversationId: string;
    digestFrequency: DigestFrequency;
    quietHoursJson?: {
        start: string;
        end: string;
    };
    includeVoiceNotes?: boolean;
    includeActionItems?: boolean;
    includeShortSummary?: boolean;
    telegramTargetRef?: string;
    enabled?: boolean;
}
export interface HealthResponse {
    status: 'ok' | 'error';
    version: string;
    uptime: number;
    database: boolean;
}
export interface JobStatusResponse {
    id: string;
    type: string;
    status: JobStatus;
    result?: unknown;
    error?: string;
    createdAt: string;
    updatedAt: string;
}
export interface Settings {
    defaultSummaryRange: number;
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
