// ──────────────────────────────────────────────
// State 関連
// ──────────────────────────────────────────────

/** State配列の1要素 */
export interface StateItem {
  id: string;
  text: string;
}

/** State更新差分。キー=stateプロパティ名、値=追加/更新アイテム、または自動ID付与を期待する文字列 */
export type StateDiff = Record<string, StateItem | StateItem[] | string | string[]>;

/** globalState の実体 */
export type GlobalState = Record<string, StateItem[]>;

/** localState（エージェント固有）の実体 */
export type LocalState = Record<string, StateItem[]>;

// ──────────────────────────────────────────────
// Tool 関連
// ──────────────────────────────────────────────

/** フレームワークが ToolCallHandler に渡す呼び出し情報 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** ToolCallHandler が返す実行結果 */
export interface ToolResult {
  status?: "success" | "failed";
  result: unknown;
  error?: string;
  /**
   * state に自動連動させたい場合に使う。
   * キー名が stateプロパティ名と一致した場合、フレームワークが自動で State を更新する。
   */
  log?: Record<string, unknown>;
}

/** Logger に渡される toolHistory 1件分 */
export interface ToolHistoryEntry {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  agentName: string;
  status: "success" | "failed";
  error?: string;
  /**
   * ToolDefinition.evaluation からコピーされる。
   * toolHistory に展開されることで、LLM が次のステップで結果を評価しやすくなる。
   */
  evaluation?: string;
}

/** 
 * Tool 呼び出しハンドラ型。
 * すべてのツール呼び出しを1つの関数で受け、実行の責任をユーザー側に委譲します。
 */
export type ToolCallHandler = (
  toolCall: ToolCall,
  context: AgentContext
) => Promise<ToolResult | unknown>;

// ──────────────────────────────────────────────
// Agent 関連
// ──────────────────────────────────────────────

/** イベント発火時にフレームワークが渡す Agent のメタ情報 */
export interface AgentMeta {
  agentName: string;
  parentMeta: AgentMeta | null;
  enableState: boolean;
}

/** Harness のコールバックコンテキストとして Agent の実行状況を渡す */
export interface AgentContext {
  agentName: string;
  currentInput: string;
  /** ReAct ループの現在ステップ番号。state_update フェーズは -1 */
  step: number;
  state: LocalState | null;
  globalState: GlobalState;
  /** globalState と localState をまとめた現在の状態 */
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
  /**
   * HarnessのフックからStateを強制更新するためのヘルパー関数。
   * 自動でIDが付与され、Loggerの onStateUpdate にも記録されます。
   */
  updateState: (diffs: StateDiff) => void;
  /**
   * 現在のセッションにおいて、特定のツールを無効化します。
   */
  disableTool: (toolName: string) => void;
  /**
   * 現在のセッションにおいて、特定のサブエージェントを無効化します。
   */
  disableAgent: (agentName: string) => void;
  /**
   * 現在の実行（ReActループ）を強制終了します。
   * AIには処理を戻さず、指定した理由を最終回答として終了します。
   */
  terminate: (reason: string) => void;
}

/** agent.chat() の戻り値 */
export interface ChatResult {
  finalText: string;
  states: {
    global: GlobalState;
    local: LocalState;
  };
}

/** サブエージェントとして呼ばれた時の内部戻り値 */
export interface SubAgentResult {
  answerText: string;
  message: string;
}

// ──────────────────────────────────────────────
// 内部型（フレームワーク内部で使用。公開 API には含まれるが利用者が直接生成する必要はない）
// ──────────────────────────────────────────────

export interface StateUpdateResult {
  success: StateUpdateRecord[];
  errs: StateUpdateError[];
}

export interface StateUpdateRecord {
  scope: "global" | "local";
  key: string;
  id: string;
  text: string;
}

export interface StateUpdateError {
  failed: unknown;
  message: string;
}

export interface DisabledRuntime {
  disabledTools: string[];
  disabledAgents: string[];
}

export interface BuildPromptOptions {
  topText?: string;
  afterRulesText?: string;
  isStateContext?: boolean;
}

export interface StateGuide {
  global: string;
  local: string;
  howTo: string;
}

/** 強制終了（Kill Switch）用の特殊エラー */
export class TerminalError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "TerminalError";
  }
}
