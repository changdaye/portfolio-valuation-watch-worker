import type { AppConfig, DailySignal, WatchItem } from '../types';

interface WorkersAIResult {
  response?: string;
}

const SYSTEM_PROMPT = `你是一名中文财经编辑。请根据投资组合主题板块估值与宏观价格分位，输出一句不超过40字的中文结论。不要带标题，不要列点。`;

export async function summarizeWithLLM(config: AppConfig, ai: Ai | undefined, themeRows: Array<{ item: WatchItem; signal: DailySignal }>, macroRows: Array<{ item: WatchItem; signal: DailySignal }>, fallback: string): Promise<string> {
  if (!ai) return fallback;
  const payload = [
    ...themeRows.map(({ item, signal }) => `${item.displayName}: ${signal.summaryLine}`),
    ...macroRows.map(({ item, signal }) => `${item.displayName}: ${signal.summaryLine}`),
  ].join('\n');

  const result = await ai.run(config.llmModel, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: payload },
    ],
    max_tokens: 120,
    temperature: 0.2,
  }) as WorkersAIResult;

  const content = result.response?.trim();
  if (!content) return fallback;
  return content.replace(/^[#\-\d.、\s]+/, '').split('\n')[0].trim();
}
