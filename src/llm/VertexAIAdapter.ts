import { GoogleAuth } from "google-auth-library";
import type { LLMClient, LLMResult, GenerateOptions, FunctionDeclaration } from "./LLMClient.js";
import { parseGeminiResponse } from "./_parseResponse.js";

export interface VertexAIConfig {
  projectId: string;
  /** default: "us-central1" */
  region?: string;
  /** default: "gemini-2.5-flash" */
  modelName?: string;
  /** default: 3 */
  maxRetries?: number;
  /** 外部からカスタムの fetch 関数を注入可能にします。 */
  customFetch?: typeof fetch;
}

export class VertexAIAdapter implements LLMClient {
  private readonly projectId: string;
  private readonly region: string;
  private readonly defaultModelName: string;
  private readonly maxRetries: number;
  private readonly auth: GoogleAuth;
  private readonly fetchFn: typeof fetch;

  constructor(config: VertexAIConfig) {
    if (!config.projectId) {
      throw new Error("VertexAIAdapter: projectId は必須です");
    }
    this.projectId = config.projectId;
    this.region = config.region ?? "us-central1";
    this.defaultModelName = config.modelName ?? "gemini-2.5-flash";
    this.maxRetries = config.maxRetries ?? 3;
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    // customFetch -> globalThis.fetch -> global.fetch の順で安全に解決
    const resolvedFetch = config.customFetch ?? 
      (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function" ? globalThis.fetch : undefined) ??
      (typeof fetch === "function" ? fetch : undefined);

    if (!resolvedFetch) {
      throw new Error("VertexAIAdapter: fetch 関数が検出できませんでした。環境に fetch が存在しない場合は、config.customFetch にカスタムの fetch 関数を渡してください。");
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
    return `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models/${modelName}:generateContent`;
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
      // tools=[] は「ツール無効」を明示
      payload.tools = [];
    }

    if (options.toolConfig) {
      payload.toolConfig = options.toolConfig;
    }

    return payload;
  }

  private async _getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse?.token;
    if (!token) {
      throw new Error("VertexAIAdapter: アクセストークンの取得に失敗しました");
    }
    return token;
  }

  private async _fetchWithRetry(endpoint: string, payload: object): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const accessToken = await this._getAccessToken();
        const response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 429) {
          const waitMs = Math.pow(2, attempt) * 2000;
          console.warn(
            `VertexAIAdapter: レートリミット(429)。${waitMs}ms 後にリトライ (${attempt + 1}/${this.maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          lastError = new Error(`HTTP 429: Rate limit exceeded`);
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`VertexAIAdapter: HTTP ${response.status} - ${body}`);
        }

        return (await response.json()) as unknown;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("VertexAIAdapter: HTTP 4") && !error.message.includes("429")) {
          // 4xx（429以外）はリトライしない
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries - 1) {
          const waitMs = Math.pow(2, attempt) * 2000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    throw lastError ?? new Error("VertexAIAdapter: maxRetries を超えました");
  }
}
