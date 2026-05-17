import type { AgentContext, StateDiff, ToolCall, ToolResult } from "../types.js";

export interface Harness {
  /**
   * LLMに投げる直前のプロンプトを受け取り、加工して返す。
   * RAG注入・Guardrailなどに使う。
   */
  beforePrompt?(
    prompt: string,
    ctx: AgentContext
  ): Promise<string> | string;

  /**
   * ツール（またはサブエージェント）を実行する直前に呼ばれる。
   * 引数の検証や、権限チェック（実行ブロック）に使う。
   */
  beforeTool?(
    call: ToolCall,
    ctx: AgentContext
  ): Promise<ToolCall> | ToolCall;

  /**
   * ToolCallHandlerの戻り値を受け取り、加工して返す。
   * 結果への注記追加・フィルタリングなどに使う。
   */
  afterToolResult?(
    result: ToolResult,
    call: ToolCall,
    ctx: AgentContext
  ): Promise<ToolResult> | ToolResult;

  /**
   * State更新差分をLLMが生成した後、実際のState反映の前に呼ばれる。
   * 追加差分を返すことで、State更新に介入できる。
   * ステートフルAgentのみ発火。
   */
  onStateBeforeUpdate?(
    diffs: StateDiff,
    ctx: AgentContext
  ): Promise<StateDiff> | StateDiff;
}
