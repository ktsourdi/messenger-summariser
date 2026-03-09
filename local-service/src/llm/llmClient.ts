import { logger } from '../utils/logger';

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function chatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  responseFormat?: { type: 'json_object' },
): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.3,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  logger.debug('LLM request', { url, model: config.model, messageCount: messages.length });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;

  if (!data.choices || data.choices.length === 0) {
    throw new Error('LLM API returned no choices');
  }

  const content = data.choices[0].message.content;

  if (data.usage) {
    logger.info('LLM usage', {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    });
  }

  return content;
}
