// Types mirrored from shared/types for use within the Chrome extension.
// Chrome extensions cannot use Node module imports at runtime.

type MessageType = 'text' | 'voice' | 'system' | 'unknown';
type SummaryType = 'manual' | 'hourly' | 'daily' | 'since_last_check';
type DigestFrequency = 'hourly' | 'daily' | 'manual';
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

interface ExtractedMessage {
  externalMessageRef?: string;
  senderName: string;
  timestamp?: string;
  messageType: MessageType;
  textBody?: string;
  audioRef?: string;
  rawMetadataJson?: string;
}

interface ManualSummaryRequest {
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

interface IncrementalExtractionRequest {
  conversationId: string;
  messages: ExtractedMessage[];
}

interface TranscribeJobRequest {
  messageId: string;
  audioRef?: string;
  audioBlob?: string;
}

interface TelegramDeliveryRequest {
  summaryId: string;
  targetChat?: string;
  format?: 'quick' | 'full' | 'action_only';
}

interface TrackedConversationRequest {
  conversationId: string;
  digestFrequency: DigestFrequency;
  quietHoursJson?: { start: string; end: string };
  includeVoiceNotes?: boolean;
  includeActionItems?: boolean;
  includeShortSummary?: boolean;
  telegramTargetRef?: string;
  enabled?: boolean;
}

interface SummaryResponse {
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

interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  database: boolean;
}

interface JobStatusResponse {
  id: string;
  type: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface TrackedConversation {
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

const DEFAULT_BASE_URL = 'http://localhost:3456';

export class LocalServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Local service error ${response.status}: ${errorBody}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async submitManualSummary(
    request: ManualSummaryRequest,
  ): Promise<SummaryResponse> {
    return this.request<SummaryResponse>(
      'POST',
      '/api/extract/manual-summary',
      request,
    );
  }

  async submitIncrementalExtraction(
    request: IncrementalExtractionRequest,
  ): Promise<{ added: number }> {
    return this.request<{ added: number }>(
      'POST',
      '/api/extract/incremental',
      request,
    );
  }

  async createTranscribeJob(
    request: TranscribeJobRequest,
  ): Promise<JobStatusResponse> {
    return this.request<JobStatusResponse>(
      'POST',
      '/api/jobs/transcribe',
      request,
    );
  }

  async deliverToTelegram(
    request: TelegramDeliveryRequest,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.request<{ success: boolean; messageId?: string; error?: string }>(
      'POST',
      '/api/deliver/telegram',
      request,
    );
  }

  async getTrackedConversations(): Promise<TrackedConversation[]> {
    return this.request<TrackedConversation[]>(
      'GET',
      '/api/tracked-conversations',
    );
  }

  async createTrackedConversation(
    request: TrackedConversationRequest,
  ): Promise<TrackedConversation> {
    return this.request<TrackedConversation>(
      'POST',
      '/api/tracked-conversations',
      request,
    );
  }

  async updateTrackedConversation(
    id: string,
    request: Partial<TrackedConversationRequest>,
  ): Promise<TrackedConversation> {
    return this.request<TrackedConversation>(
      'PATCH',
      `/api/tracked-conversations/${encodeURIComponent(id)}`,
      request,
    );
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/api/health');
  }

  async getJobStatus(id: string): Promise<JobStatusResponse> {
    return this.request<JobStatusResponse>(
      'GET',
      `/api/jobs/${encodeURIComponent(id)}`,
    );
  }

  async getSummary(id: string): Promise<SummaryResponse> {
    return this.request<SummaryResponse>(
      'GET',
      `/api/summaries/${encodeURIComponent(id)}`,
    );
  }
}
