/** Function Calling スキーマ（Gemini / Vertex AI 共通形式） */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, FunctionParameter>;
    required?: string[];
  };
}

export interface FunctionParameter {
  type: string; // "STRING" | "NUMBER" | "BOOLEAN" | "OBJECT" | "ARRAY"
  description?: string;
  enum?: string[];
}

export interface GenerateOptions {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: FunctionDeclaration[];
  toolConfig?: { functionCallingConfig: { mode: "AUTO" | "ANY" | "NONE" } };
  responseSchema?: object;
  responseMimeType?: string;
}

// ──────────────────────────────────────────────
// LLMからのレスポンス（正規化済み形式）
// アダプタが必ずこの形式に変換して返す
// ──────────────────────────────────────────────

export interface ParsedFunctionCall {
  name: string;
  args: Record<string, unknown>;
  parseError?: string;
}

export type LLMResponse =
  | { kind: "text"; text: string }
  | { kind: "functionCall"; calls: ParsedFunctionCall[] }
  | { kind: "unknown"; reason: string };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResult {
  res: LLMResponse;
  usage?: TokenUsage;
}

export interface LLMClient {
  /**
   * プロンプトを投げてLLMから正規化済みレスポンスを受け取る。
   * 生レスポンスのパース・正規化はアダプタ内で行う。
   */
  generate(prompt: string, options: GenerateOptions): Promise<LLMResult>;
}
