import { LocalServiceClient } from '../api/localServiceClient.js';

const client = new LocalServiceClient();

// Track the last summary ID for Telegram delivery
let lastSummaryId: string | null = null;

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SUBMIT_SUMMARY':
      handleSubmitSummary(message.payload)
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    case 'SEND_TELEGRAM':
      handleSendTelegram(message.summaryId)
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    case 'GET_TRACKED':
      handleGetTracked()
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    case 'CREATE_TRACKED':
      handleCreateTracked(message.payload)
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    case 'UPDATE_TRACKED':
      handleUpdateTracked(message.id, message.payload)
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    case 'HEALTH_CHECK':
      handleHealthCheck()
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    case 'EXTRACT_FROM_TAB':
      handleExtractFromTab(sender.tab?.id, message.options)
        .then((result) => sendResponse(result))
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
});

async function handleSubmitSummary(payload: {
  conversation: {
    platformConversationRef: string;
    title: string;
    participants: string[];
  };
  messages: unknown[];
  extractionWindow?: {
    type: 'last_n' | 'last_minutes' | 'last_hours' | 'all_visible';
    value?: number;
  };
  includeVoiceNotes: boolean;
}): Promise<{ summary?: unknown; error?: string }> {
  try {
    const summary = await client.submitManualSummary({
      conversation: payload.conversation,
      messages: payload.messages as Parameters<
        typeof client.submitManualSummary
      >[0]['messages'],
      extractionWindow: payload.extractionWindow,
      includeVoiceNotes: payload.includeVoiceNotes,
    });

    lastSummaryId = summary.id;

    // Store in chrome.storage for persistence
    await chrome.storage.local.set({
      lastSummary: summary,
      lastSummaryId: summary.id,
    });

    return { summary };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to submit summary';
    return { error: message };
  }
}

async function handleSendTelegram(
  summaryId?: string,
): Promise<{ success?: boolean; error?: string }> {
  const id = summaryId || lastSummaryId;
  if (!id) {
    return { error: 'No summary available. Run a summary first.' };
  }

  try {
    const result = await client.deliverToTelegram({
      summaryId: id,
      format: 'full',
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Telegram delivery failed';
    return { error: message };
  }
}

async function handleGetTracked(): Promise<{
  conversations?: unknown[];
  error?: string;
}> {
  try {
    const conversations = await client.getTrackedConversations();
    return { conversations };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to fetch tracked conversations';
    return { error: message };
  }
}

async function handleCreateTracked(payload: Parameters<typeof client.createTrackedConversation>[0]): Promise<{
  conversation?: unknown;
  error?: string;
}> {
  try {
    const conversation = await client.createTrackedConversation(payload);
    return { conversation };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create tracked conversation';
    return { error: message };
  }
}

async function handleUpdateTracked(
  id: string,
  payload: Parameters<typeof client.updateTrackedConversation>[1],
): Promise<{ conversation?: unknown; error?: string }> {
  try {
    const conversation = await client.updateTrackedConversation(id, payload);
    return { conversation };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to update tracked conversation';
    return { error: message };
  }
}

async function handleHealthCheck(): Promise<{
  health?: unknown;
  error?: string;
}> {
  try {
    const health = await client.getHealth();
    return { health };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Local service is not reachable';
    return { error: message };
  }
}

async function handleExtractFromTab(
  tabId: number | undefined,
  options?: unknown,
): Promise<{ messages?: unknown; error?: string }> {
  if (!tabId) {
    return { error: 'No active tab found' };
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'EXTRACT_MESSAGES', options },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      },
    );
  });
}

// Log service worker activation
console.log('[Messenger Summariser] Background service worker started');
