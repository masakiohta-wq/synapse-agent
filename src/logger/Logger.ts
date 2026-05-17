import type { TokenUsage } from "../llm/LLMClient.js";
import type {
  AgentMeta,
  GlobalState,
  LocalState,
  StateDiff,
  ToolHistoryEntry,
  StateUpdateRecord,
  StateUpdateError,
} from "../types.js";

// ── イベント型定義 ──

export interface StartEvent {
  /** chat() に渡されたメッセージ */
  message: string;
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
}

export interface InitialStateEvent {
  disabledTools: string[];
  disabledAgents: string[];
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
  /** 処理にかかった時間(ミリ秒) */
  durationMs: number;
  usage?: TokenUsage;
}

export interface ToolCallEvent {
  name: string;
  args: Record<string, unknown>;
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
  /** ツール呼び出しの生成にかかった時間(ミリ秒) */
  durationMs: number;
  usage?: TokenUsage;
}

export interface ToolResultEvent {
  /** 今回のtool結果1件 */
  entry: ToolHistoryEntry;
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
  /** ツールの実行にかかった時間(ミリ秒) */
  durationMs: number;
}

export interface StateUpdateEvent {
  diffs: StateDiff;
  success: StateUpdateRecord[];
  errors: StateUpdateError[];
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
  /** State更新の生成にかかった時間(ミリ秒) */
  durationMs: number;
  usage?: TokenUsage;
}

export interface FinalEvent {
  finalText: string;
  /** このセッションの全toolHistory */
  toolHistory: ToolHistoryEntry[];
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
  /** 最終回答の生成にかかった時間(ミリ秒) */
  durationMs: number;
  usage?: TokenUsage;
}

export interface ErrorEvent {
  message: string;
  stack?: string;
  /** どのフェーズでエラーが起きたか */
  context?: string;
  currentState: {
    global: GlobalState;
    local: LocalState;
  };
}

// ── Loggerインターフェース ──

export interface Logger {
  /** ReActループ開始時（chat()の呼び出し直後） */
  onStart?(event: StartEvent, meta: AgentMeta): void;

  /** 初期State生成完了時 */
  onInitialState?(event: InitialStateEvent, meta: AgentMeta): void;

  /** ToolCallHandlerを呼ぶ直前 */
  onToolCall?(event: ToolCallEvent, meta: AgentMeta): void;

  /** ToolCallHandlerが返した直後 */
  onToolResult?(event: ToolResultEvent, meta: AgentMeta): void;

  /** State更新が完了した直後（ステートフルAgentのみ） */
  onStateUpdate?(event: StateUpdateEvent, meta: AgentMeta): void;

  /** 最終回答を確定した時（toolHistory全量を渡す） */
  onFinal?(event: FinalEvent, meta: AgentMeta): void;

  /** エラーが発生した時（throwの直前） */
  onError?(event: ErrorEvent, meta: AgentMeta): void;
}
