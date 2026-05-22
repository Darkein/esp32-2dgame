export interface LLMRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

/** Interface commune à tous les backends LLM (local ou cloud). */
export interface LLMProvider {
  readonly name: string;
  /** Le backend est-il joignable ? (utilisé pour la dégradation propre.) */
  available(): Promise<boolean>;
  complete(req: LLMRequest): Promise<string>;
}
