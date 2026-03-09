// Messenger DOM selectors - isolated for easy updates when UI changes
// These selectors target messenger.com's current DOM structure

export const SELECTORS = {
  // Main message list container
  messageList: '[role="main"] [role="grid"]',
  // Individual message row
  messageRow: '[role="row"]',
  // Message text content
  messageText: '[dir="auto"]',
  // Sender name
  senderName: '[data-scope="messages_table"] span[dir="auto"]',
  // Timestamp
  timestamp: 'time',
  // Voice note / audio element
  voiceNote: 'audio, [aria-label*="voice"], [aria-label*="audio"]',
  // Conversation title/header
  conversationTitle: '[role="main"] h2, [role="banner"] h1',
  // Active conversation container
  activeConversation: '[role="main"]',
  // Message group (messages from same sender)
  messageGroup: '[role="row"][class]',
  // Participant list
  participantList: '[role="complementary"] [dir="auto"]',
} as const;

// Fallback selectors in case primary ones break
export const FALLBACK_SELECTORS = {
  messageList: '.x78zum5 .x1n2onr6',
  messageRow: 'div[class*="message"]',
  messageText: 'span[dir="auto"], div[dir="auto"]',
  conversationTitle: 'h2, [class*="title"]',
} as const;
