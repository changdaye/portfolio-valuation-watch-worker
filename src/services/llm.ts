import type { AppConfig, DailySignal, WatchItem } from '../types';

const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.2-1b-instruct';
const OPENAI_COMPAT_REASONING_EFFORT = 'xhigh';
const OPENAI_COMPAT_MAX_COMPLETION_TOKENS = 180;

interface WorkersAIResult {
  response?: string;
}

interface OpenAICompatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const SYSTEM_PROMPT = `你是一名中文财经编辑。请根据投资组合主题板块估值与宏观价格分位，输出一句不超过40字的中文结论。不要带标题，不要列点。`;

export async function summarizeWithLLM(config: AppConfig, ai: Ai | undefined, themeRows: Array<{ item: WatchItem; signal: DailySignal }>, macroRows: Array<{ item: WatchItem; signal: DailySignal }>, fallback: string): Promise<string> {
  const payload = [
    ...themeRows.map(({ item, signal }) => `${item.displayName}: ${signal.summaryLine}`),
    ...macroRows.map(({ item, signal }) => `${item.displayName}: ${signal.summaryLine}`),
  ].join('\n');

  if (config.llmBaseUrl && config.llmApiKey) {
    try {
      return await summarizeWithOpenAICompatible(config, payload);
    } catch (error) {
      console.error('OpenAI-compatible LLM failed', error instanceof Error ? error.message : String(error));
    }
  }

  if (!ai) return fallback;
  return summarizeWithWorkersAI(
    ai,
    config.llmModel.startsWith('@cf/') ? config.llmModel : DEFAULT_WORKERS_AI_MODEL,
    payload,
    fallback,
  );
}

async function summarizeWithOpenAICompatible(config: AppConfig, payload: string): Promise<string> {
  const response = await fetch(`${config.llmBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llmApiKey}`,
    },
    body: JSON.stringify({
      model: config.llmModel,
      reasoning_effort: OPENAI_COMPAT_REASONING_EFFORT,
      max_completion_tokens: OPENAI_COMPAT_MAX_COMPLETION_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: payload },
      ],
      max_tokens: 120,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const result = await response.json() as OpenAICompatResponse;
  const rawContent = result.choices?.[0]?.message?.content;
  const content = typeof rawContent === 'string'
    ? rawContent.trim()
    : rawContent?.map((part) => part.text ?? '').join('').trim();
  if (!content) throw new Error('OpenAI-compatible response returned empty content');
  return normalizeHeadline(content);
}

async function summarizeWithWorkersAI(ai: Ai, model: string, payload: string, fallback: string): Promise<string> {
  const result = await ai.run(model, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: payload },
    ],
    max_tokens: 120,
    temperature: 0.2,
  }) as WorkersAIResult;

  const content = result.response?.trim();
  if (!content) return fallback;
  return normalizeHeadline(content);
}

function normalizeHeadline(content: string): string {
  return content.replace(/^[#\-\d.、\s]+/, '').split('\n')[0].trim();
}
