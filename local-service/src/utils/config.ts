export interface AppConfig {
  port: number;
  dbPath: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  llmApiKey?: string;
  transcriptionApiKey?: string;
  logLevel: string;
}

export function getConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3456', 10),
    dbPath: process.env.DB_PATH || './data/messenger-summariser.db',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    llmApiKey: process.env.LLM_API_KEY,
    transcriptionApiKey: process.env.TRANSCRIPTION_API_KEY,
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
