export type { LLMProvider, LLMRequest } from './provider';
export { OllamaProvider } from './ollama';
export { CloudProvider } from './cloud';

import type { LLMProvider } from './provider';
import { OllamaProvider } from './ollama';
import { CloudProvider } from './cloud';

export interface ResolveOptions {
  ollamaUrl?: string;
  ollamaModel?: string;
  cloudApiKey?: string;
  cloudBaseUrl?: string;
  cloudModel?: string;
}

/**
 * Sélectionne le meilleur provider disponible : Ollama local en priorité, sinon
 * cloud si une clé est fournie, sinon null (le jeu reste jouable, fast-layer seul).
 */
export async function resolveProvider(opts: ResolveOptions = {}): Promise<LLMProvider | null> {
  const ollama = new OllamaProvider({ baseUrl: opts.ollamaUrl, model: opts.ollamaModel });
  if (await ollama.available()) return ollama;
  if (opts.cloudApiKey) {
    const cloud = new CloudProvider({
      apiKey: opts.cloudApiKey,
      baseUrl: opts.cloudBaseUrl,
      model: opts.cloudModel,
    });
    if (await cloud.available()) return cloud;
  }
  return null;
}
