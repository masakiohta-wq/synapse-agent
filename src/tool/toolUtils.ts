import type { ToolDefinition } from "./ToolDefinition.js";
import type { FunctionDeclaration } from "../llm/LLMClient.js";

/**
 * ToolDefinition → FunctionDeclaration（Function Calling スキーマ）へ変換
 */
export function toFunctionDeclaration(tool: ToolDefinition): FunctionDeclaration {
  const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
  const required: string[] = [];

  for (const arg of (tool.schema.args ?? [])) {
    properties[arg.name] = {
      type: arg.type,
      ...(arg.desc ? { description: arg.desc } : {}),
      ...(arg.enum ? { enum: arg.enum } : {}),
    };
    if (arg.required) {
      required.push(arg.name);
    }
  }

  return {
    name: tool.name,
    description: [tool.summary, tool.instruction].filter(Boolean).join("\n"),
    parameters: {
      type: "OBJECT",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

/**
 * ToolDefinition → プロンプト埋め込み用テキスト へ変換
 */
export function toPromptDefinition(tool: ToolDefinition): string {
  const lines = [
    `【ツール名】${tool.name}`,
    `【概要】${tool.summary}`,
    `【使い方】${tool.instruction}`,
  ];

  if ((tool.schema.args ?? []).length > 0) {
    lines.push(
      "【引数】",
      ...(tool.schema.args ?? []).map((arg) => {
        const parts = [`  - ${arg.name} (${arg.type})${arg.required ? " ※必須" : ""}`];
        if (arg.desc) parts.push(`    ${arg.desc}`);
        if (arg.enum) parts.push(`    選択肢: ${arg.enum.join(" | ")}`);
        return parts.join("\n");
      })
    );
  }

  return lines.join("\n");
}

/**
 * ToolDefinition → 能力サマリー行 へ変換
 */
export function toCapabilityLine(tool: ToolDefinition): string {
  return `  - ${tool.name}: ${tool.summary}`;
}
