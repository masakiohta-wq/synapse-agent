import type { LLMClient, LLMResult, GenerateOptions, FunctionDeclaration } from "./LLMClient.js";
import { parseGeminiResponse } from "./_parseResponse.js";

export interface GeminiConfig {
  apiKey: string;
  /** default: "gemini-2.5-flash" */
  modelName?: string;
  /** default: 3 */
  maxRetries?: number;
  /** 外部からカスタムの fetch 関数を注入可能にします。 */
  customFetch?: typeof fetch;
}

export class GeminiAdapter implements LLMClient {
  private readonly apiKey: string;
  private readonly defaultModelName: string;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error("GeminiAdapter: apiKey は必須です");
    }
    this.apiKey = config.apiKey;
    this.defaultModelName = config.modelName ?? "gemini-2.5-flash";
    this.maxRetries = config.maxRetries ?? 3;

    // customFetch -> globalThis.fetch -> global.fetch の順で安全に解決
    const resolvedFetch = config.customFetch ?? 
      (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function" ? globalThis.fetch : undefined) ??
      (typeof fetch === "function" ? fetch : undefined);

    if (!resolvedFetch) {
      throw new Error("GeminiAdapter: fetch 関数が検出できませんでした。環境に fetch が存在しない場合は、config.customFetch にカスタムの fetch 関数を渡してください。");
    }
    this.fetchFn = resolvedFetch;
  }

  async generate(prompt: string, options: GenerateOptions): Promise<LLMResult> {
    const modelName = options.modelName ?? this.defaultModelName;
    const endpoint = this._buildEndpoint(modelName);
    const payload = this._buildPayload(prompt, options);
    const raw = await this._fetchWithRetry(endpoint, payload);
    return parseGeminiResponse(raw);
  }

  private _buildEndpoint(modelName: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
  }

  private _buildPayload(prompt: string, options: GenerateOptions): object {
    const contents = [{ role: "user", parts: [{ text: prompt }] }];

    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens ?? 8192,
    };

    if (options.responseMimeType) {
      generationConfig.responseMimeType = options.responseMimeType;
    }
    if (options.responseSchema) {
      generationConfig.responseSchema = options.responseSchema;
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    if (options.tools && options.tools.length > 0) {
      payload.tools = [{ functionDeclarations: options.tools as FunctionDeclaration[] }];
    } else if (options.tools && options.tools.length === 0) {
      payload.tools = [];
    }

    if (options.toolConfig) {
      payload.toolConfig = options.toolConfig;
    }

    return payload;
  }

  private async _fetchWithRetry(endpoint: string, payload: object): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (response.status === 429) {
          const waitMs = Math.pow(2, attempt) * 2000;
          console.warn(
            `GeminiAdapter: レートリミット(429)。${waitMs}ms 後にリトライ (${attempt + 1}/${this.maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          lastError = new Error(`HTTP 429: Rate limit exceeded`);
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`GeminiAdapter: HTTP ${response.status} - ${body}`);
        }

        return (await response.json()) as unknown;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("GeminiAdapter: HTTP 4") && !error.message.includes("429")) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries - 1) {
          const waitMs = Math.pow(2, attempt) * 2000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    throw lastError ?? new Error("GeminiAdapter: maxRetries を超えました");
  }
}
