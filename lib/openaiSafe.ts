import OpenAI from 'openai';

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return new OpenAI({ apiKey });
}

interface SafeCompletionParams {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  responseFormat?: 'json_object' | 'text';
  maxTokens?: number;
}

function buildSafeChatParams(params: SafeCompletionParams) {
  const { model, messages, responseFormat, maxTokens = 2500 } = params;

  const baseParams: any = {
    model,
    messages,
    max_completion_tokens: maxTokens,
  };

  if (responseFormat === 'json_object') {
    baseParams.response_format = { type: 'json_object' };
  }

  return baseParams;
}

export async function safeGenerateJSON(params: SafeCompletionParams): Promise<string> {
  const client = getOpenAIClient();
  const chatParams = buildSafeChatParams(params);

  const completion = await client.chat.completions.create(chatParams);
  const content = completion.choices[0]?.message?.content || '';

  if (!content) {
    throw new Error('LLM returned empty response');
  }

  return content;
}

export async function safeGenerateText(params: SafeCompletionParams): Promise<string> {
  const client = getOpenAIClient();
  const chatParams = buildSafeChatParams(params);

  const completion = await client.chat.completions.create(chatParams);
  const content = completion.choices[0]?.message?.content || '';

  if (!content) {
    throw new Error('LLM returned empty response');
  }

  return content;
}
