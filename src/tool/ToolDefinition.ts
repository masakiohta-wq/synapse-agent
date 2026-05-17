export interface ArgDefinition {
  name: string;
  type: "STRING" | "NUMBER" | "BOOLEAN" | "OBJECT" | "ARRAY";
  desc?: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  /** 俯瞰用の短い概要（親向け） */
  summary: string;
  /** 詳細な使い方の指示（自身向け） */
  instruction: string;
  schema: {
    args?: ArgDefinition[];
  };
  /** LLMへの「この結果をどう評価するか」の指示 */
  evaluation?: string;
}
