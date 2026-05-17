import { Agent } from "../agent/Agent.js";
import { StatelessAgent } from "../agent/StatelessAgent.js";
import { States } from "../state/States.js";
import type { LLMClient, TokenUsage } from "../llm/LLMClient.js";
import type { ToolDefinition } from "../tool/ToolDefinition.js";
import type { AgentConfig } from "../agent/AgentConfig.js";
import type { Logger } from "../logger/Logger.js";
import type { Harness } from "../harness/Harness.js";
import type { GlobalState, LocalState, StateDiff, ToolCallHandler, ToolCall, AgentContext, ToolResult } from "../types.js";

export interface NetworkConfig {
  llm: LLMClient;
  tools: ToolDefinition[];
  agents: AgentConfig[];
  /** ツール実行の唯一のハンドラ。必須です。 */
  onToolCall: ToolCallHandler;
  /** 省略時は new States() */
  stateSchema?: States;
  logger?: Logger;
  harness?: Harness;
  /** 初期globalStateへの上書き差分 */
  preloadGlobalState?: StateDiff;
  /** マケプレ等で発行された有効なライセンスキー (4エージェント以下なら不要) */
  licenseKey?: string;
}

export class Network {
  private readonly agentMap: Map<string, Agent>;
  private readonly toolDefinitions: Map<string, ToolDefinition>;
  private globalState: GlobalState;
  private readonly stateSchema: States;
  private readonly logger?: Logger;
  private licenseKey?: string;
  private isLicenseValid: boolean = false;
  /** 全エージェントで共有するセッション状態 */
  private readonly sessionStatus = { terminateReason: null as string | null };

  constructor(config: NetworkConfig) {
    if (!config.llm) throw new Error("Network: llm は必須です");
    if (!config.onToolCall) throw new Error("Network: onToolCall は必須です");

    // ライセンスキーを保持
    this.licenseKey = config.licenseKey;

    this.stateSchema = config.stateSchema ?? new States();
    this.globalState = this.stateSchema.getDefaultState("global") as GlobalState;
    this.logger = config.logger;
    this.agentMap = new Map();
    this.toolDefinitions = new Map();

    // ToolDefinition を Map に格納
    for (const tool of config.tools) {
      if (!tool.name) throw new Error(`Network: ToolDefinition.name が未設定です`);
      this.toolDefinitions.set(tool.name, tool);
    }

    const normalizedToolCall = async (toolCall: ToolCall, context: AgentContext): Promise<ToolResult> => {
      // Agent 側で高度な正規化（statusの自動補完や生データのラップ）を行うため、
      // ここではユーザーの戻り値をそのまま返します。
      return await config.onToolCall(toolCall, context) as ToolResult;
    };

    // stateGuide を生成
    const stateGuide = {
      global: this.stateSchema.getStateDefinition("global"),
      local: this.stateSchema.getStateDefinition("local"),
      howTo: this.stateSchema.getHowtoBuild(),
    };

    // Agent インスタンスを生成
    for (const agentConfig of config.agents) {
      if (!agentConfig.name) throw new Error("Network: AgentConfig.name は必須です");
      if (!agentConfig.prompt) throw new Error(`Network: AgentConfig.prompt は必須です (agent: ${agentConfig.name})`);

      // ⚡️ 事前チェック: 必要なツール定義が存在するか
      for (const toolName of agentConfig.tools ?? []) {
        const toolDef = this.toolDefinitions.get(toolName);
        if (!toolDef) {
          throw new Error(`Network: Agent "${agentConfig.name}" が参照するツール "${toolName}" がNetworkに登録されていません。`);
        }
      }

      // enableState=false → StatelessAgent、それ以外（true/省略）→ Agent
      const AgentClass = agentConfig.enableState === false ? StatelessAgent : Agent;
      const agent = new AgentClass(agentConfig);

      // 依存関係注入（protected フィールドへのアクセスは unknown 経由でキャスト）
      type AgentInternal = {
        llm: LLMClient;
        onToolCall: ToolCallHandler;
        logger: Logger | undefined;
        harness: Harness | undefined;
        globalState: GlobalState;
        state: LocalState;
        stateGuide: { global: string; local: string; howTo: string };
        sessionStatus: { terminateReason: string | null };
      };
      const agentInternal = agent as unknown as AgentInternal;
      agentInternal.llm = config.llm;
      agentInternal.onToolCall = normalizedToolCall as any;
      agentInternal.logger = config.logger;
      agentInternal.harness = config.harness;
      agentInternal.globalState = this.globalState;
      agentInternal.state = this.stateSchema.getDefaultState("local") as LocalState;
      agentInternal.stateGuide = stateGuide;
      agentInternal.sessionStatus = this.sessionStatus;

      this.agentMap.set(agentConfig.name, agent);
    }

    // ツール・エージェント参照解決
    for (const agentConfig of config.agents) {
      const agent = this.agentMap.get(agentConfig.name)!;
      type AgentMaps = {
        toolDefinitions: Map<string, ToolDefinition>;
        agentHandlers: Map<string, Agent>;
        initialTool: { name: string; args: string[] } | null;
      };
      const agentInternal = agent as unknown as AgentMaps;

      for (const toolName of agentConfig.tools ?? []) {
        agentInternal.toolDefinitions.set(toolName, this.toolDefinitions.get(toolName)!);
      }

      for (const subAgentName of agentConfig.agents ?? []) {
        if (!this.agentMap.has(subAgentName)) {
          throw new Error(`Network: Agent "${agentConfig.name}" が参照するエージェント "${subAgentName}" が存在しません`);
        }
        agentInternal.agentHandlers.set(subAgentName, this.agentMap.get(subAgentName)!);
      }

      if (agentConfig.initialToolName) {
        if (!this.toolDefinitions.has(agentConfig.initialToolName)) {
          throw new Error(`Network: Agent "${agentConfig.name}" の initialToolName "${agentConfig.initialToolName}" がNetworkに登録されていません。`);
        }
        if (!(agentConfig.tools ?? []).includes(agentConfig.initialToolName)) {
          throw new Error(`Network: Agent "${agentConfig.name}" の initialToolName "${agentConfig.initialToolName}" は、そのエージェントの tools リストに含まれている必要があります。`);
        }
        const toolDef = this.toolDefinitions.get(agentConfig.initialToolName)!;

        // ⚡️ initialTool のバリデーション: inputSchema に必須引数の定義があるかチェック
        const inputArgs = agentConfig.inputSchema?.args ?? [];
        for (const arg of (toolDef.schema.args ?? [])) {
          if (arg.required) {
            const exists = inputArgs.some(a => a.name === arg.name);
            if (!exists) {
              throw new Error(`Network: Agent "${agentConfig.name}" の inputSchema に、initialTool "${agentConfig.initialToolName}" の必須引数 "${arg.name}" が定義されていません。AIが外部から引数を受け取れるよう、inputSchema.args にこの引数名を追加してください。`);
            }
          }
        }

        agentInternal.initialTool = {
          name: agentConfig.initialToolName,
          args: (toolDef.schema.args ?? []).map(argDef => argDef.name),
        };
      }
    }

    // preloadGlobalState の反映
    if (config.preloadGlobalState) {
      for (const [key, val] of Object.entries(config.preloadGlobalState)) {
        if (key in this.globalState) {
          const items = Array.isArray(val) ? val : [val];
          this.globalState[key].push(...(items as any[]));
        }
      }
    }
  }

  /**
   * ネットワーク全体の実行を強制終了します。
   * AIには処理を戻さず、指定した理由を最終回答として終了します。
   */
  public terminate(reason: string): void {
    this.sessionStatus.terminateReason = reason;
  }

  /**
   * ライセンスサーバーと通信し、有効性を確認します。
   * (アプリ起動時に1度だけ await network.verifyLicense() を呼ぶ想定)
   */
  public async verifyLicense(): Promise<void> {
    // すでに認証済みならスキップ
    if (this.isLicenseValid) return;

    // ⚡️ フリーミアム・ロジック: 4エージェント以下なら無料で利用可能
    const agentCount = this.agentMap.size;
    if (agentCount <= 4) {
      if (!this.isLicenseValid) {
        console.log(`[Synapse] Free Tier Active: Running with ${agentCount} agents. (Limit: 4 for free)`);
        this.isLicenseValid = true;
      }
      return;
    }

    // 5エージェント以上の場合は、ライセンスキーが必須
    if (!this.licenseKey) {
      throw new Error(`Synapse: 5エージェント以上の構成にはライセンスキーが必要です。現在のエージェント数: ${agentCount}`);
    }

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch("https://marketplace-server-arr2bpx7bq-an.a.run.app/api/verify-license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseKey: this.licenseKey })
        });

        const data = await response.json();
        if (!response.ok || !data.valid) {
          throw new Error("ライセンスキーが無効、または解約されています。GCP Marketplaceでサブスクリプションを確認してください。");
        }
        this.isLicenseValid = true;
        console.log("Synapse Framework: ライセンス認証に成功しました。");
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          const waitMs = Math.pow(2, attempt) * 2000;
          console.warn(`Synapse Framework: ライセンス認証リトライ中... (${attempt + 1}/${maxRetries}) - ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }

    throw new Error("Synapse Framework 認証エラー: " + lastError?.message);
  }

  /** 指定名のAgentを返す。存在しない場合はエラー。 */
  get(agentName: string): Agent {
    const agent = this.agentMap.get(agentName);
    if (!agent) throw new Error(`Network: Agent "${agentName}" が見つかりません`);
    return agent;
  }

  /** 全エージェントのstateをリセットする。新セッション開始時に呼ぶ。 */
  resetStates(): void {
    const newGlobal = this.stateSchema.getDefaultState("global") as GlobalState;
    // globalState の参照を維持しつつ内容をリセット
    for (const key of Object.keys(this.globalState)) delete this.globalState[key];
    Object.assign(this.globalState, newGlobal);

    // 強制終了フラグもリセット
    this.sessionStatus.terminateReason = null;

    for (const agent of this.agentMap.values()) {
      type AgentState = { state: LocalState; toolHistory: unknown[]; cumulativeUsage: TokenUsage };
      const agentInternal = agent as unknown as AgentState;
      agentInternal.state = this.stateSchema.getDefaultState("local") as LocalState;
      agentInternal.toolHistory = [];
      agentInternal.cumulativeUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
  }

  /** 現在のglobalStateを返す（永続化用）。 */
  getGlobalState(): GlobalState {
    return this.globalState;
  }

  /**
   * 外部から保存済みglobalStateを復元する。
   * セッション継続時に呼ぶ。構造バリデーションは行わない（利用者責任）。
   */
  loadGlobalState(state: GlobalState): void {
    for (const key of Object.keys(this.globalState)) delete this.globalState[key];
    Object.assign(this.globalState, state);
  }
}
