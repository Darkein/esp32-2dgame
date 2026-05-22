import type { LLMProvider, LLMRequest } from './provider';

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
}

/** Backend local via Ollama (http://localhost:11434). Gratuit, hors-ligne. */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? 'http://localhost:11434';
    this.model = opts.model ?? 'qwen2.5:3b-instruct';
  }

  async available(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(req: LLMRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: { temperature: req.temperature ?? 0.8, num_predict: req.maxTokens ?? 200 },
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          { role: 'user', content: req.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() ?? '';
  }
}
