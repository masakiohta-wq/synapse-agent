import type { LLMResponse, ParsedFunctionCall, LLMResult, TokenUsage } from "./LLMClient.js";

/**
 * Vertex AI / Gemini API 共通レスポンス形式から LLMResult を生成する。
 */
export function parseGeminiResponse(raw: unknown): LLMResult {
  const usageRaw = (raw as Record<string, unknown>)?.usageMetadata as any;
  const usage: TokenUsage | undefined = usageRaw ? {
    promptTokens: usageRaw.promptTokenCount ?? 0,
    completionTokens: usageRaw.candidatesTokenCount ?? 0,
    totalTokens: usageRaw.totalTokenCount ?? 0,
  } : undefined;

  const response = parseGeminiCandidates(raw);
  return { res: response, usage };
}

/**
 * Vertex AI / Gemini API 共通レスポンス形式（candidates[].content.parts[]）を
 * LLMResponse に正規化する。
 */
export function parseGeminiCandidates(raw: unknown): LLMResponse {
  const candidates = (raw as Record<string, unknown>)?.candidates;
  if (!Array.isArray(candidates)) {
    return {
      kind: "unknown",
      reason: "レスポンスに candidates フィールドが存在しません",
    };
  }

  // 有効な parts を持つ最初の candidate を探す
  const parts = (candidates as Record<string, unknown>[])
    .find(
      (candidate) =>
        candidate?.content &&
        Array.isArray((candidate.content as Record<string, unknown>).parts) &&
        ((candidate.content as Record<string, unknown>).parts as unknown[]).length > 0
    )
    ?.content;

  const partsArr = parts
    ? ((parts as Record<string, unknown>).parts as Record<string, unknown>[])
    : null;

  if (!partsArr) {
    return {
      kind: "unknown",
      reason: "有効な content.parts を含む candidate が見つかりませんでした",
    };
  }

  const functionCalls: ParsedFunctionCall[] = [];
  let text = "";

  for (const part of partsArr) {
    if (part.functionCall) {
      const functionCall = part.functionCall as Record<string, unknown>;
      const name = functionCall.name;
      const args = functionCall.args;

      if (typeof name !== "string" || name === "") {
        functionCalls.push({
          name: "invalid_function_name",
          args: typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {},
          parseError: "functionCall.name は空でない文字列で指定してください",
        });
        continue;
      }

      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        functionCalls.push({
          name,
          args: {},
          parseError: `functionCall.args はオブジェクトで指定してください: ${name}`,
        });
        continue;
      }

      functionCalls.push({ name, args: args as Record<string, unknown> });
    } else if (typeof part.text === "string") {
      text += part.text;
    }
  }

  if (functionCalls.length > 0) {
    return { kind: "functionCall", calls: functionCalls };
  }

  if (text) {
    return { kind: "text", text };
  }

  return {
    kind: "unknown",
    reason: "content.parts に functionCall も text も含まれていません",
  };
}
