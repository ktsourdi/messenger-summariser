# Messenger Summariser

A personal conversation intelligence layer for Facebook Messenger. Summarize conversations, transcribe voice notes, extract action items, and receive digests on mobile via Telegram.

## Features

- **Manual Summarize** – Summarize the currently open Messenger conversation (all visible, last 50, last hour, last day)
- **Voice Note Detection** – Detect voice notes and transcribe them (transcription API integration stub included)
- **Action Extraction** – Identify action items, unanswered questions, decisions, mentions, and deadlines
- **Telegram Delivery** – Send quick, full, or action-only digests to a Telegram chat
- **Tracked Conversations** – Mark conversations for automatic hourly or daily digest generation
- **Local-First** – All data stored locally in SQLite; no cloud dependency for storage

## Architecture

```
Messenger DOM
  → Chrome Extension (content script)
  → Local Service (Express + SQLite)
  → Summarization Engine
  → Telegram Delivery / Local UI
```

### Components

| Component | Description |
|-----------|-------------|
| `shared/` | Shared TypeScript types and interfaces |
| `local-service/` | Node.js + Express backend with SQLite, summarizer, job queue, scheduler, and Telegram delivery |
| `extension/` | Chrome Manifest V3 extension with content script, popup UI, and background service worker |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Chrome browser (for the extension)

### Install & Build

```bash
# Build shared types
cd shared && npm install && npm run build && cd ..

# Build and start local service
cd local-service && npm install && npm run build
npm start  # Starts on port 3456

# Build extension
cd extension && npm install && npm run build
```

### Load the Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` directory
4. Navigate to [messenger.com](https://www.messenger.com)
5. Click the 📝 floating button to open the summariser panel

### Configure Telegram Delivery

Set environment variables before starting the local service:

```bash
export TELEGRAM_BOT_TOKEN=your_bot_token
export TELEGRAM_CHAT_ID=your_chat_id
```

### Configure LLM Summarization

To use OpenAI-powered summarization instead of the built-in rule-based engine, set your API key:

```bash
export LLM_API_KEY=sk-your-openai-api-key
```

Then pass `"useLLM": true` in your manual summary requests:

```bash
curl -X POST http://localhost:3456/api/extract/manual-summary \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation": { "platformConversationRef": "group-1", "title": "Team Chat", "participants": ["Alice", "Bob"] },
    "messages": [
      { "senderName": "Alice", "messageType": "text", "textBody": "Can you send the report by Friday?" },
      { "senderName": "Bob", "messageType": "text", "textBody": "Sure, will do" }
    ],
    "includeVoiceNotes": false,
    "useLLM": true
  }'
```

When `useLLM` is `true` and `LLM_API_KEY` is set, the service uses `gpt-4o-mini` via the OpenAI API. If the LLM call fails for any reason (network error, rate limit, malformed response), it automatically falls back to the rule-based engine.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Local service port |
| `DB_PATH` | `./data/messenger-summariser.db` | SQLite database file path |
| `TELEGRAM_BOT_TOKEN` | – | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | – | Telegram chat ID for delivery |
| `LLM_API_KEY` | – | OpenAI API key for LLM-powered summarization |
| `TRANSCRIPTION_API_KEY` | – | API key for speech-to-text (future) |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/extract/manual-summary` | Submit messages for summarization |
| `POST` | `/api/extract/incremental` | Add new messages to existing conversation |
| `POST` | `/api/jobs/transcribe` | Create a transcription job |
| `POST` | `/api/deliver/telegram` | Send a summary to Telegram |
| `GET` | `/api/tracked-conversations` | List tracked conversations |
| `POST` | `/api/tracked-conversations` | Create a tracked conversation |
| `PATCH` | `/api/tracked-conversations/:id` | Update a tracked conversation |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/jobs/:id` | Get job status |
| `GET` | `/api/summaries/:id` | Get summary by ID |

## Running Tests

```bash
cd local-service && npm test
```

## Project Structure

```
shared/
  types/index.ts          # Shared TypeScript interfaces
extension/
  manifest.json           # Chrome extension manifest v3
  src/
    content/              # Content script for messenger.com
    background/           # Service worker
    popup/                # Extension popup UI
    parsers/              # DOM selector definitions
    api/                  # Local service HTTP client
local-service/
  src/
    index.ts              # Express server entry point
    api/routes.ts         # API route handlers
    db/                   # SQLite database + repositories
    summarizer/           # Summarization engine (rule-based + OpenAI LLM)
    transcriber/          # Voice note transcription (stub)
    delivery/             # Telegram message delivery
    scheduler/            # Digest scheduling with node-cron
    jobs/                 # In-memory job queue
    utils/                # Logger, config
    __tests__/            # Test suite
```

## License

Private use only.