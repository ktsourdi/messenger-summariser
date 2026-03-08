// Popup script for Messenger Summariser extension

interface ConversationInfo {
  title: string;
  participants: string[];
}

interface TrackedConversation {
  id: string;
  conversationId: string;
  digestFrequency: string;
  enabled: boolean;
}

// DOM element references
const statusDot = document.getElementById('status-dot') as HTMLElement;
const conversationInfoEl = document.getElementById('conversation-info') as HTMLElement;
const statusArea = document.getElementById('status-area') as HTMLElement;
const trackedList = document.getElementById('tracked-list') as HTMLElement;
const btnSummarizeNow = document.getElementById('btn-summarize-now') as HTMLButtonElement;
const btnLast50 = document.getElementById('btn-last-50') as HTMLButtonElement;
const btnLastHour = document.getElementById('btn-last-hour') as HTMLButtonElement;
const btnLastDay = document.getElementById('btn-last-day') as HTMLButtonElement;
const btnTelegram = document.getElementById('btn-telegram') as HTMLButtonElement;
const voiceToggle = document.getElementById('voice-toggle') as HTMLInputElement;
const settingsLink = document.getElementById('settings-link') as HTMLAnchorElement;

function setStatus(message: string, type: 'info' | 'error' | 'success' | 'loading' = 'info'): void {
  statusArea.textContent = message;
  statusArea.className = `status-area visible ${type}`;
}

function clearStatus(): void {
  statusArea.textContent = '';
  statusArea.className = 'status-area';
}

function setLoading(loading: boolean): void {
  const buttons = [btnSummarizeNow, btnLast50, btnLastHour, btnLastDay, btnTelegram];
  buttons.forEach((btn) => {
    if (btn) btn.disabled = loading;
  });
}

function updateConversationInfo(info: ConversationInfo | null): void {
  if (!info || !info.title) {
    conversationInfoEl.innerHTML = '<span class="info-label">No conversation detected</span>';
    return;
  }

  const participants = info.participants.length > 0
    ? info.participants.join(', ')
    : 'Unknown participants';

  conversationInfoEl.innerHTML = `
    <span class="conversation-title">${escapeHtml(info.title)}</span>
    <span class="conversation-participants">${escapeHtml(participants)}</span>
  `;
}

function renderTrackedConversations(conversations: TrackedConversation[]): void {
  if (!conversations || conversations.length === 0) {
    trackedList.innerHTML = '<div class="tracked-empty">No tracked conversations</div>';
    return;
  }

  trackedList.innerHTML = conversations
    .map(
      (conv) => `
        <div class="tracked-item">
          <span class="tracked-title">${escapeHtml(conv.conversationId)}</span>
          <span class="tracked-freq">${escapeHtml(conv.digestFrequency)}</span>
        </div>
      `,
    )
    .join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function sendToContentScript(
  tabId: number,
  message: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function sendToBackground(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function isMessengerUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'www.messenger.com' || hostname === 'messenger.com';
  } catch {
    return false;
  }
}

async function fetchConversationInfo(): Promise<void> {
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !isMessengerUrl(tab.url)) {
      return;
    }

    const response = (await sendToContentScript(tab.id, {
      type: 'GET_CONVERSATION_INFO',
    })) as ConversationInfo;

    updateConversationInfo(response);
  } catch {
    updateConversationInfo(null);
  }
}

async function checkServiceHealth(): Promise<void> {
  try {
    const response = (await sendToBackground({
      type: 'HEALTH_CHECK',
    })) as { health?: { status: string }; error?: string };

    if (response.health?.status === 'ok') {
      statusDot.className = 'status-dot online';
      statusDot.title = 'Local service is running';
    } else {
      statusDot.className = 'status-dot offline';
      statusDot.title = response.error || 'Service unavailable';
    }
  } catch {
    statusDot.className = 'status-dot offline';
    statusDot.title = 'Cannot reach local service';
  }
}

async function fetchTrackedConversations(): Promise<void> {
  try {
    const response = (await sendToBackground({
      type: 'GET_TRACKED',
    })) as { conversations?: TrackedConversation[]; error?: string };

    if (response.conversations) {
      renderTrackedConversations(response.conversations);
    } else {
      trackedList.innerHTML = `<div class="tracked-empty">${escapeHtml(response.error || 'Failed to load')}</div>`;
    }
  } catch {
    trackedList.innerHTML = '<div class="tracked-empty">Failed to load</div>';
  }
}

function getConversationRefFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/t\/([^/]+)/);
    return match ? match[1] : pathname;
  } catch {
    return `unknown-${Date.now()}`;
  }
}

type ExtractionWindowType = 'last_n' | 'last_minutes' | 'last_hours' | 'all_visible';

async function triggerSummarization(action: string): Promise<void> {
  setLoading(true);
  setStatus('Extracting messages...', 'loading');

  try {
    const tab = await getActiveTab();
    if (!tab?.id || !isMessengerUrl(tab.url)) {
      setLoading(false);
      return;
    }

    let options: Record<string, unknown> = { allVisible: true };
    switch (action) {
      case 'last-50':
        options = { lastN: 50 };
        break;
      case 'last-hour':
        options = { lastHours: 1 };
        break;
      case 'last-day':
        options = { lastHours: 24 };
        break;
    }

    const extraction = (await sendToContentScript(tab.id, {
      type: 'EXTRACT_MESSAGES',
      options,
    })) as {
      messages: unknown[];
      conversationInfo: ConversationInfo;
      voiceNoteCount: number;
    };

    if (!extraction.messages || extraction.messages.length === 0) {
      setStatus('No messages found in current view.', 'error');
      setLoading(false);
      return;
    }

    setStatus(
      `Extracted ${extraction.messages.length} messages. Summarizing...`,
      'loading',
    );

    const extractionWindow: { type: ExtractionWindowType; value?: number } = {
      type: 'all_visible',
    };
    if (options.lastN) {
      extractionWindow.type = 'last_n';
      extractionWindow.value = options.lastN as number;
    } else if (options.lastHours) {
      extractionWindow.type = 'last_hours';
      extractionWindow.value = options.lastHours as number;
    }

    const result = (await sendToBackground({
      type: 'SUBMIT_SUMMARY',
      payload: {
        conversation: {
          platformConversationRef: getConversationRefFromUrl(tab.url || ''),
          title: extraction.conversationInfo.title,
          participants: extraction.conversationInfo.participants,
        },
        messages: extraction.messages,
        extractionWindow,
        includeVoiceNotes: voiceToggle.checked,
      },
    })) as { summary?: { shortSummary: string }; error?: string };

    if (result.error) {
      setStatus(`Error: ${result.error}`, 'error');
    } else if (result.summary) {
      setStatus(result.summary.shortSummary || 'Summary complete!', 'success');

      // Also show the summary in the content script overlay
      await sendToContentScript(tab.id, {
        type: 'SHOW_SUMMARY',
        summary: result.summary,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setStatus(`Failed: ${message}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function handleTelegramDelivery(): Promise<void> {
  setLoading(true);
  setStatus('Sending to Telegram...', 'loading');

  try {
    const result = (await sendToBackground({
      type: 'SEND_TELEGRAM',
    })) as { success?: boolean; error?: string };

    if (result.error) {
      setStatus(`Telegram: ${result.error}`, 'error');
    } else {
      setStatus('Sent to Telegram!', 'success');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setStatus(`Telegram failed: ${message}`, 'error');
  } finally {
    setLoading(false);
  }
}

// Event listeners
btnSummarizeNow?.addEventListener('click', () => triggerSummarization('summarize-now'));
btnLast50?.addEventListener('click', () => triggerSummarization('last-50'));
btnLastHour?.addEventListener('click', () => triggerSummarization('last-hour'));
btnLastDay?.addEventListener('click', () => triggerSummarization('last-day'));
btnTelegram?.addEventListener('click', handleTelegramDelivery);

settingsLink?.addEventListener('click', (e) => {
  e.preventDefault();
  setStatus('Settings page coming soon.', 'info');
});

// Initialize popup
async function init(): Promise<void> {
  await Promise.all([
    fetchConversationInfo(),
    checkServiceHealth(),
    fetchTrackedConversations(),
  ]);
}

init();
