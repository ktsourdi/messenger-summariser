import {
  extractMessages,
  getConversationInfo,
  detectVoiceNotes,
} from './extractor.js';
import type { ExtractionOptions } from './extractor.js';

// Panel element references
let fabButton: HTMLButtonElement | null = null;
let panelContainer: HTMLDivElement | null = null;
let overlayPanel: HTMLDivElement | null = null;

const PANEL_ID = 'ms-summariser-panel';
const FAB_ID = 'ms-summariser-fab';
const OVERLAY_ID = 'ms-summariser-overlay';

function injectStyles(): void {
  if (document.getElementById('ms-summariser-styles')) return;

  const style = document.createElement('style');
  style.id = 'ms-summariser-styles';
  style.textContent = `
    #${FAB_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #0084ff;
      color: #fff;
      border: none;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s, background 0.15s;
    }
    #${FAB_ID}:hover {
      background: #006acc;
      transform: scale(1.1);
    }

    #${PANEL_ID} {
      position: fixed;
      bottom: 80px;
      right: 24px;
      width: 320px;
      max-height: 480px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1c1e21;
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    #${PANEL_ID}.ms-visible {
      display: flex;
    }

    #${PANEL_ID} .ms-header {
      padding: 14px 16px;
      background: #0084ff;
      color: #fff;
      font-weight: 600;
      font-size: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #${PANEL_ID} .ms-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
    }

    #${PANEL_ID} .ms-body {
      padding: 12px 16px;
      overflow-y: auto;
      max-height: 360px;
    }

    #${PANEL_ID} .ms-btn {
      display: block;
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 8px;
      border: none;
      border-radius: 8px;
      background: #e4e6eb;
      color: #1c1e21;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }
    #${PANEL_ID} .ms-btn:hover {
      background: #d0d2d6;
    }
    #${PANEL_ID} .ms-btn.ms-primary {
      background: #0084ff;
      color: #fff;
    }
    #${PANEL_ID} .ms-btn.ms-primary:hover {
      background: #006acc;
    }
    #${PANEL_ID} .ms-btn.ms-telegram {
      background: #0088cc;
      color: #fff;
    }
    #${PANEL_ID} .ms-btn.ms-telegram:hover {
      background: #006fa1;
    }

    #${PANEL_ID} .ms-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      margin-bottom: 8px;
    }
    #${PANEL_ID} .ms-toggle label {
      font-size: 13px;
      color: #65676b;
    }

    #${PANEL_ID} .ms-status {
      padding: 10px 12px;
      margin-top: 8px;
      border-radius: 8px;
      background: #f0f2f5;
      font-size: 13px;
      color: #65676b;
      display: none;
    }
    #${PANEL_ID} .ms-status.ms-visible {
      display: block;
    }
    #${PANEL_ID} .ms-status.ms-error {
      background: #fce8e8;
      color: #d32f2f;
    }
    #${PANEL_ID} .ms-status.ms-success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    #${OVERLAY_ID} {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    #${OVERLAY_ID}.ms-visible {
      display: flex;
    }
    #${OVERLAY_ID} .ms-overlay-content {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      max-width: 560px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1c1e21;
    }
    #${OVERLAY_ID} .ms-overlay-content h2 {
      margin: 0 0 16px;
      font-size: 18px;
    }
    #${OVERLAY_ID} .ms-overlay-content .ms-section {
      margin-bottom: 16px;
    }
    #${OVERLAY_ID} .ms-overlay-content .ms-section h3 {
      font-size: 14px;
      color: #65676b;
      margin: 0 0 6px;
    }
    #${OVERLAY_ID} .ms-overlay-content .ms-section p,
    #${OVERLAY_ID} .ms-overlay-content .ms-section li {
      margin: 4px 0;
      line-height: 1.5;
    }
    #${OVERLAY_ID} .ms-overlay-close {
      display: block;
      margin: 16px auto 0;
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      background: #0084ff;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

function createFab(): void {
  if (document.getElementById(FAB_ID)) return;

  fabButton = document.createElement('button');
  fabButton.id = FAB_ID;
  fabButton.textContent = '📝';
  fabButton.title = 'Messenger Summariser';
  fabButton.addEventListener('click', togglePanel);
  document.body.appendChild(fabButton);
}

function createPanel(): void {
  if (document.getElementById(PANEL_ID)) return;

  panelContainer = document.createElement('div');
  panelContainer.id = PANEL_ID;
  panelContainer.innerHTML = `
    <div class="ms-header">
      <span>Messenger Summariser</span>
      <button class="ms-close" id="ms-close-btn">&times;</button>
    </div>
    <div class="ms-body">
      <button class="ms-btn ms-primary" data-action="summarize-now">📝 Summarize Now</button>
      <button class="ms-btn" data-action="last-50">💬 Last 50 Messages</button>
      <button class="ms-btn" data-action="last-hour">🕐 Last Hour</button>
      <button class="ms-btn" data-action="last-day">📅 Last Day</button>
      <div class="ms-toggle">
        <label for="ms-voice-toggle">Include Voice Notes</label>
        <input type="checkbox" id="ms-voice-toggle" checked />
      </div>
      <button class="ms-btn ms-telegram" data-action="send-telegram">✈️ Send to Telegram</button>
      <div class="ms-status" id="ms-status"></div>
    </div>
  `;
  document.body.appendChild(panelContainer);

  panelContainer
    .querySelector('#ms-close-btn')
    ?.addEventListener('click', togglePanel);

  panelContainer.querySelectorAll('.ms-btn').forEach((btn) => {
    btn.addEventListener('click', handlePanelAction);
  });
}

function createOverlay(): void {
  if (document.getElementById(OVERLAY_ID)) return;

  overlayPanel = document.createElement('div');
  overlayPanel.id = OVERLAY_ID;
  overlayPanel.innerHTML = `
    <div class="ms-overlay-content" id="ms-overlay-body">
      <h2>Summary</h2>
      <div id="ms-overlay-results"></div>
      <button class="ms-overlay-close" id="ms-overlay-close">Close</button>
    </div>
  `;
  document.body.appendChild(overlayPanel);

  overlayPanel
    .querySelector('#ms-overlay-close')
    ?.addEventListener('click', () => {
      overlayPanel?.classList.remove('ms-visible');
    });

  overlayPanel.addEventListener('click', (e) => {
    if (e.target === overlayPanel) {
      overlayPanel?.classList.remove('ms-visible');
    }
  });
}

function togglePanel(): void {
  panelContainer?.classList.toggle('ms-visible');
}

function setStatus(
  message: string,
  type: 'info' | 'error' | 'success' = 'info',
): void {
  const statusEl = document.getElementById('ms-status');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = 'ms-status ms-visible';
  if (type === 'error') statusEl.classList.add('ms-error');
  if (type === 'success') statusEl.classList.add('ms-success');
}

function clearStatus(): void {
  const statusEl = document.getElementById('ms-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'ms-status';
  }
}

function getConversationRef(): string {
  // Derive a stable conversation reference from the URL path
  const match = window.location.pathname.match(/\/t\/([^/]+)/);
  return match ? match[1] : window.location.pathname;
}

function getExtractionOptions(action: string): ExtractionOptions {
  switch (action) {
    case 'last-50':
      return { lastN: 50 };
    case 'last-hour':
      return { lastHours: 1 };
    case 'last-day':
      return { lastHours: 24 };
    case 'summarize-now':
    default:
      return { allVisible: true };
  }
}

function handlePanelAction(event: Event): void {
  const target = event.currentTarget as HTMLElement;
  const action = target.dataset.action;
  if (!action) return;

  if (action === 'send-telegram') {
    handleSendTelegram();
    return;
  }

  const options = getExtractionOptions(action);
  performExtraction(options, action);
}

function performExtraction(options: ExtractionOptions, action: string): void {
  setStatus('Extracting messages...');

  const voiceToggle = document.getElementById(
    'ms-voice-toggle',
  ) as HTMLInputElement | null;
  const includeVoiceNotes = voiceToggle?.checked ?? true;

  try {
    const messages = extractMessages(options);
    const conversationInfo = getConversationInfo();
    const voiceNotes = includeVoiceNotes ? detectVoiceNotes() : null;

    if (messages.length === 0) {
      setStatus('No messages found in current view.', 'error');
      return;
    }

    setStatus(`Extracted ${messages.length} messages. Sending to service...`);

    const extractionWindow: {
      type: 'last_n' | 'last_minutes' | 'last_hours' | 'all_visible';
      value?: number;
    } = { type: 'all_visible' };

    if (options.lastN) {
      extractionWindow.type = 'last_n';
      extractionWindow.value = options.lastN;
    } else if (options.lastMinutes) {
      extractionWindow.type = 'last_minutes';
      extractionWindow.value = options.lastMinutes;
    } else if (options.lastHours) {
      extractionWindow.type = 'last_hours';
      extractionWindow.value = options.lastHours;
    }

    chrome.runtime.sendMessage(
      {
        type: 'SUBMIT_SUMMARY',
        payload: {
          conversation: {
            platformConversationRef: getConversationRef(),
            title: conversationInfo.title,
            participants: conversationInfo.participants,
          },
          messages,
          extractionWindow,
          includeVoiceNotes,
          voiceNoteCount: voiceNotes?.count ?? 0,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus(
            `Error: ${chrome.runtime.lastError.message}`,
            'error',
          );
          return;
        }
        if (response?.error) {
          setStatus(`Error: ${response.error}`, 'error');
          return;
        }
        if (response?.summary) {
          setStatus('Summary received!', 'success');
          showSummaryOverlay(response.summary);
        }
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    setStatus(`Extraction failed: ${message}`, 'error');
  }
}

function handleSendTelegram(): void {
  setStatus('Requesting Telegram delivery...');

  chrome.runtime.sendMessage(
    { type: 'SEND_TELEGRAM' },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(
          `Error: ${chrome.runtime.lastError.message}`,
          'error',
        );
        return;
      }
      if (response?.error) {
        setStatus(`Telegram error: ${response.error}`, 'error');
        return;
      }
      setStatus('Sent to Telegram!', 'success');
    },
  );
}

interface SummaryData {
  conversationTitle?: string;
  shortSummary?: string;
  detailedSummary?: string;
  actionItems?: string[];
  unansweredQuestions?: string[];
  decisions?: string[];
  mentions?: string[];
  needsReplyScore?: number;
  voiceNoteHighlights?: string[];
}

function showSummaryOverlay(summary: SummaryData): void {
  const resultsEl = document.getElementById('ms-overlay-results');
  if (!resultsEl) return;

  let html = '';

  if (summary.conversationTitle) {
    html += `<div class="ms-section"><h3>Conversation</h3><p>${escapeHtml(summary.conversationTitle)}</p></div>`;
  }

  if (summary.shortSummary) {
    html += `<div class="ms-section"><h3>Summary</h3><p>${escapeHtml(summary.shortSummary)}</p></div>`;
  }

  if (summary.detailedSummary) {
    html += `<div class="ms-section"><h3>Details</h3><p>${escapeHtml(summary.detailedSummary)}</p></div>`;
  }

  if (summary.actionItems && summary.actionItems.length > 0) {
    html += `<div class="ms-section"><h3>Action Items</h3><ul>${summary.actionItems.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`;
  }

  if (
    summary.unansweredQuestions &&
    summary.unansweredQuestions.length > 0
  ) {
    html += `<div class="ms-section"><h3>Unanswered Questions</h3><ul>${summary.unansweredQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul></div>`;
  }

  if (summary.decisions && summary.decisions.length > 0) {
    html += `<div class="ms-section"><h3>Decisions</h3><ul>${summary.decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>`;
  }

  if (summary.needsReplyScore !== undefined && summary.needsReplyScore > 50) {
    html += `<div class="ms-section"><h3>⚠️ Needs Reply</h3><p>Reply urgency: ${summary.needsReplyScore}/100</p></div>`;
  }

  if (
    summary.voiceNoteHighlights &&
    summary.voiceNoteHighlights.length > 0
  ) {
    html += `<div class="ms-section"><h3>Voice Note Highlights</h3><ul>${summary.voiceNoteHighlights.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul></div>`;
  }

  resultsEl.innerHTML = html || '<p>No summary data available.</p>';
  overlayPanel?.classList.add('ms-visible');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_MESSAGES': {
      const options: ExtractionOptions = message.options || {
        allVisible: true,
      };
      const messages = extractMessages(options);
      const info = getConversationInfo();
      const voiceNotes = detectVoiceNotes();
      sendResponse({
        messages,
        conversationInfo: info,
        voiceNoteCount: voiceNotes.count,
      });
      break;
    }
    case 'GET_CONVERSATION_INFO': {
      const info = getConversationInfo();
      sendResponse(info);
      break;
    }
    case 'SHOW_SUMMARY': {
      showSummaryOverlay(message.summary);
      sendResponse({ ok: true });
      break;
    }
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
});

// Initialize on load
function init(): void {
  injectStyles();
  createFab();
  createPanel();
  createOverlay();
  console.log('[Messenger Summariser] Content script initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
