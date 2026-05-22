import type { LLMProvider, LLMRequest } from './provider';

export interface CloudOptions {
  /** Endpoint compatible OpenAI /chat/completions (OpenAI, OpenRouter, etc.). */
  baseUrl?: string;
  apiKey: string;
  model?: string;
}

/** Backend cloud (API compatible OpenAI). Fallback configurable. */
export class CloudProvider implements LLMProvider {
  readonly name = 'cloud';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: CloudOptions) {
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com/v1';
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gpt-4o-mini';
  }

  async available(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(req: LLMRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.8,
        max_tokens: req.maxTokens ?? 200,
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          { role: 'user', content: req.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Cloud HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
