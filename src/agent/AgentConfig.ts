import type { ArgDefinition } from "../tool/ToolDefinition.js";

export interface AgentConfig {
  // ── 必須 ──
  /** ネットワーク内でユニークであること */
  name: string;
  /** システムプロンプト（エージェントの人格・責務定義） */
  prompt: string;

  // ── 表示・説明用 ──
  /** サブエージェントとして呼ばれる際の概要 */
  summary?: string;
  /** サブエージェントとして呼ばれる際の使い方 */
  instruction?: string;

  // ── LLM設定（省略時はNetworkのデフォルト値を使用） ──
  /** default: "gemini-2.5-flash" */
  modelName?: string;
  /**
   * 初期State生成フェーズのみ使用するモデル名。
   * 省略時は modelName を使用。
   * 初期State生成は推論コストが高いため、より高性能なモデルを指定できる。
   * 例: "gemini-2.5-pro"
   */
  initialModelName?: string;
  /** default: 10 */
  maxSteps?: number;
  /** default: 0.2 */
  temperature?: number;
  /** default: 8192 */
  maxTokens?: number;

  // ── 依存関係 ──
  /** 使用するToolDefinition.name の一覧 */
  tools?: string[];
  /** 使用するサブエージェント名の一覧（network内に存在すること） */
  agents?: string[];

  // ── プロンプト拡張 ──
  /** ナレッジテキスト（プロンプトに埋め込む固定知識） */
  knowledge?: string;
  /** 入力形式の定義（サブエージェントとしての引数定義。省略時は message: string のみ） */
  inputSchema?: { args?: ArgDefinition[] };
  /** JSON構造化出力スキーマ（最終回答の雛形） */
  outputSchema?: object;

  // ── State ──
  /**
   * default: true。
   * false のとき StatelessAgent として生成（state管理なし・軽量）。
   */
  enableState?: boolean;

  // ── 初期ツール実行 ──
  /**
   * ReAct開始前に自動実行するツール名。
   * inputPromptをJSONパースしてツール引数を抽出する。
   */
  initialToolName?: string;
}
