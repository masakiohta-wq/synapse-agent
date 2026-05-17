import type { LLMClient, FunctionDeclaration, TokenUsage } from "../llm/LLMClient.js";
import type { ToolDefinition, ArgDefinition } from "../tool/ToolDefinition.js";
import type { Logger } from "../logger/Logger.js";
import type { Harness } from "../harness/Harness.js";
import type { AgentConfig } from "./AgentConfig.js";
import {
  GlobalState, LocalState, StateDiff, ToolCall, ToolCallHandler, ToolResult,
  ToolHistoryEntry, ChatResult, SubAgentResult, AgentMeta, AgentContext,
  StateUpdateResult, StateUpdateRecord, StateUpdateError, DisabledRuntime,
  BuildPromptOptions, StateGuide, TerminalError,
} from "../types.js";
import { toFunctionDeclaration, toPromptDefinition, toCapabilityLine } from "../tool/toolUtils.js";

const EXEC_RULES = `
【実行ルール】
function callingを使って、tasksに従った次の最適行動を1回だけ選ぶこと

【最重要禁止事項】
- 直前のfunction callingと完全一致（name/args同一）の再実行
- tasks,rolesを無視し、関係ないツールやサブエージェントを呼ぶこと
- 別々のtasksを1度に解決しようとする事も禁止
- tasksの順番を無視することを絶対に禁止する
- 原則として自分に与えられたtoolは別エージェントは実行できないことを念頭におく

【tasksに関する重要前提】
- tasksは初期計画であり、絶対的に正しいとは限らない
- 常に「今取り組むべき先頭taskを前進または完了させる行動か」で判断すること
- 先頭taskの達成に直接必要であり、かつ同時に後続taskも自然に満たせる場合のみ、1回のfunction callingで複数taskをまとめて解決してよい
- 後続taskのためだけに、先頭taskと無関係な行動を先回りして実行してはならない

【task状態ラベルの扱い】
- 「【完了】」で始まるtaskは実行済みであり、再実行してはならない
- 「【不要】」で始まるtaskは実行対象ではない
- 「【条件付き】」で始まるtaskは、条件が満たされるまで実行してはならない
- 「【次に実行】」で始まる未完了taskのうち、最も先頭にある1件だけを currentTask とする
- 次のfunction callingでは currentTask だけを前進させる

【行動選択の原則】
- まず tasks を順番に確認し、未解決の先頭taskを特定すること
- 次の行動は、必ずその先頭taskを前進・検証・完了させるものだけを選ぶこと
- 先頭taskの解決に直接寄与しないツールやサブエージェントの利用は禁止

【tool と サブエージェントの違い】
- tool: 単機能の処理を呼ぶ実行対象。入出力はツールschemaに従う
- サブエージェント: 別の担当AIに依頼する実行対象。toolとは別物として扱う
- stateに存在する事実をサブエージェントにそのまま転記する必要はない。何をしてほしいかだけを具体的に指示すること

【ReAct実行形式ルール】
- テキストを生成した時点であなたのReActは終了する
- プロンプト内に存在するツール以外を勝手に作成してはいけない
- tool またはサブエージェントを使う必要があるときは、定義済み名で function calling を行う
- 念のため・保険目的のtool呼び出しは禁止
- 最終回答ができるくらい tasks が終わっている場合は function calling せず最終回答すること
- 直前に実行したfunction callingと完全一致（name/args同一）の呼び出しを連続実行しない

【行動前チェック】
次のfunction callingを行う前に、必ず自問すること
- これは未解決の先頭taskを直接前進させるか？
- これは先頭taskと無関係な寄り道ではないか？
- これは直前と完全一致する再実行ではないか？
- 先頭taskがすでに十分に満たされており、もう最終回答できる状態ではないか？
上記を満たす場合のみ function calling を実行すること
`;

const AGENT_CAUTION = `【サブエージェント委譲の判定ルール】

サブエージェントは、話題の近さ・単語の一致・表面的な関連性では選ばない。
必ず「現在のtaskが要求する成果物の型」と「そのサブエージェントが返す成果物の型」で一致判定を行うこと。

■ 委譲前に必ず行う判定
1. まず、現在のtaskが最終的に何を必要としているかを1つに定める
2. 次に、呼び出し候補のサブエージェントが返せる成果物を description / schema から判定する
3. 以下の3点がすべて一致する場合のみ委譲を許可する
   - 主要求 / 成果の方向 / 返却されるべき成果物の型

■ 特に重要な禁止事項
- 単語が近いという理由だけで委譲してはならない
- 適切なサブエージェントが存在しない場合、無理に委譲してはならない

■ 許可条件
- そのサブエージェントが、現在のtaskの成果物を直接返せる
- 自身のtoolではその成果物を返せない、または自分で扱うべき責務ではない
- その委譲が現在のtaskを直接前進させる
`;

const FINAL_STEP_MSG = `【最重要指示】許可されたstep上限に到達したため、これ以上のfunction callingは禁止です。現在保持している情報とこれまでの履歴のみから、最終回答を生成してください。`;

const SUB_CRITICAL = `この回答はサブエージェント単体の出力であり最終結論ではない。

あなたの役割は評価と統合であり、サブエージェントの見解をそのまま採用することではない。
常にセッションの目的（ユーザーの主要求と成果の方向）に立ち戻り、
この回答がそれを満たしているかを自分の基準で判断せよ。

重要：
- サブエージェントの結論に思考を委ねてはならない
- 回答内容をそのまま正解として扱ってはならない
- 判断主体は常にあなた自身である

この回答によって目的が達成されていない場合、
それは「回答が不十分」なのであり「依頼が不可能」ではない。
目的未達であれば、問いを維持したまま、次に何をすべきかを自ら判断せよ。`;

const HUMAN_IN_LOOP_BASE = `本システム(あなた)はヒューマンインザループ非対応である。

tasksにおいて、
AI/tool以外の主体（人間・外部担当者/slack/lookerなど）への依存を前提とする処理は禁止する。

- 人間への確認を「行う」
- 手動対応の前提
- 現実世界での調査・連絡

これらを含むtaskは無効とみなし、生成/実行しようとしてはならない。
すべてのtaskはAI単独で実行・完結できる形で定義すること。`;

const STATE_INIT_TOP = `【実行コンテキスト】
- context: state_init
- 現在は初期stateの作成ステップにいる。
- 出力先は内部stateのみ。親ユーザーへ直接回答してはならない。
- tool / サブエージェント呼び出しは禁止。
- この段階では、ユーザー依頼を達成するための初期状態を作る。
- ユーザーの要求はfactではない。勘違いの可能性もあるためhypothesesに絡める。勝手に事実と決め打ちしてはならない

【state_init の目的】
初期stateでは、ユーザー依頼を受けて、これから何を達成し、どの順序で進め、どの前提・分岐・未確定点を保持すべきかを整理する。

【重要】
- global / local の振り分けはシステムが自動で行う。
- あなたは global / local を判断してはならない。
- 出力JSONに "global" や "local" というキーを含めてはならない。

【state_init 出力形式の絶対ルール】
- 出力は JSON オブジェクトのみ。
- トップキーは stateプロパティ名、または "_runtime" のみ許可。
- "global", "local", "status", "answer", "result", "message", "output" などは禁止。
- 各プロパティの値は必ず配列。
- 各配列要素は必ず { "id": "...", "text": "..." } の形式。
- 空配列は出力しない。
- 追加する項目がないプロパティは、キーごと省略する。

【初期stateで特に重要なこと】
- goals はユーザーの依頼目的を1件以上作る。
- tasks は現在すぐ実行すべき作業を1件以上作る。（「【次に実行】」で始める）
- tasks に入れなかった未確定の前提・分岐・結果次第の次アクションは hypotheses に残す。
- roles は、自分・tool・サブエージェントの責務境界が関係する場合に書く。
- openQuestions は、回答成立に必要だが現時点では未確定の論点がある場合に書く。
- hypothesesは必ず論点ごとにもれなく作成する
- facts には、まだ検証していない内容を書いてはならない。
- evidences には、まだ取得していない根拠を書いてはならない。

【runtime制御】
初期state JSONには、stateプロパティとは別に"_runtime"を含める。
"_runtime" は state ではなく、以降このエージェントが使用できる tool / agent を制限するためのシステム制御情報である。

形式:
{
  "_runtime": {
    "disabledTools": ["使用しないtool名"],
    "disabledAgents": ["使用しないagent名"]
  }
}

【disabledTools / disabledAgents の判断ルール】
- このセッション中に条件付きでも使用する可能性がない tool / agent だけを入れる。
- 初手では使わないが、fallbackとして使う可能性がある tool / agent は disabled に入れてはならない。
- 判断できない場合は disabled に入れない。

【重要】
- "_runtime" は state ではない
- "_runtime" の中に goals / tasks / facts などを書いてはならない`;


export class Agent {
  readonly name: string;
  readonly prompt: string;
  readonly summary: string;
  readonly instruction: string;
  readonly modelName: string;
  readonly initialModelName: string | undefined;
  readonly maxSteps: number;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly knowledge: string;
  readonly inputSchema: { args?: ArgDefinition[] } | undefined;
  readonly outputSchema: object | undefined;
  readonly enableState: boolean;
  readonly initialToolName: string | undefined;

  // Network から注入するフィールド（protected: サブクラスのみアクセス可）
  protected llm!: LLMClient;
  protected toolDefinitions: Map<string, ToolDefinition> = new Map();
  protected agentHandlers: Map<string, Agent> = new Map();
  protected onToolCall!: ToolCallHandler;
  protected logger: Logger | undefined;
  protected harness: Harness | undefined;
  protected toolHistory: ToolHistoryEntry[] = [];
  protected globalState: GlobalState = {};
  protected state: LocalState = {};
  protected stateGuide: StateGuide = { global: "", local: "", howTo: "" };
  protected currentParentMeta: AgentMeta | null = null;
  /** セッション単位で動的に無効化されたツール名のセット */
  protected disabledTools: Set<string> = new Set();
  /** セッション単位で動的に無効化されたサブエージェント名のセット */
  protected disabledAgents: Set<string> = new Set();
  /** initialToolName から Network が解決した実行情報 */
  protected initialTool: { name: string; args: string[] } | null = null;
  /** セッション全体で共有されるステータス (Network から注入) */
  protected sessionStatus!: { terminateReason: string | null };
  /** セッション全体の累計トークン使用量 */
  protected cumulativeUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(config: AgentConfig) {
    if (!config.name) throw new Error("Agent: name は必須です");
    if (!config.prompt) throw new Error("Agent: prompt は必須です");
    this.name = config.name;
    this.prompt = config.prompt;
    this.summary = config.summary ?? "";
    this.instruction = config.instruction ?? "";
    this.modelName = config.modelName ?? "gemini-2.5-flash";
    this.initialModelName = config.initialModelName;
    this.maxSteps = config.maxSteps ?? 10;
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens ?? 8192;
    this.knowledge = config.knowledge ?? "";
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
    this.enableState = config.enableState ?? true;
    this.initialToolName = config.initialToolName;
  }

  async chat(message: string, history: string[] = []): Promise<ChatResult> {
    if (!Array.isArray(history)) throw new Error("history は配列で指定してください");
    this.toolHistory = [];
    this.disabledTools.clear();
    this.disabledAgents.clear();
    this.cumulativeUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const parts = ["【ユーザーの要求原文】", message];
    if (history.length > 0) {
      parts.push("【原文に至るまでのチャット履歴】", "---", ...history, "---", "今回の要求は原文です。背景情報の補完として履歴を扱ってください");
    }
    const inputPrompt = parts.join("\n");
    // 入力メッセージ自体が JSON の場合は引数としてパースを試みる
    let initialArgs: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        initialArgs = parsed as Record<string, unknown>;
      }
    } catch {
      // JSON でない場合は通常のテキストとして扱う
      initialArgs = { message };
    }

    const startMs = Date.now();
    this._emitLogger("onStart", { message });
    try {
      const result = await this._runReAct(inputPrompt, initialArgs);
      const durationMs = Date.now() - startMs;
      this._emitLogger("onFinal", {
        finalText: result.finalText,
        toolHistory: this.toolHistory,
        durationMs,
        usage: this.cumulativeUsage
      });
      return result;
    } catch (error) {
      if (error instanceof TerminalError) {
        const durationMs = Date.now() - startMs;
        this._emitLogger("onFinal", {
          finalText: error.reason,
          toolHistory: this.toolHistory,
          durationMs,
          usage: this.cumulativeUsage
        });
        return { finalText: error.reason, states: { global: this.globalState, local: this.state } };
      }
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "chat" });
      throw error;
    }
  }

  async _chatAsSubAgent(inputPrompt: string, parentMeta: AgentMeta): Promise<SubAgentResult> {
    this.currentParentMeta = parentMeta;
    this.toolHistory = [];
    this.disabledTools.clear();
    this.disabledAgents.clear();
    this.cumulativeUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    try {
      this._emitLogger("onStart", { message: inputPrompt });
      const startMs = Date.now();
      // サブエージェント呼び出し時は、親から渡された args をそのまま渡す
      const initialArgs = typeof inputPrompt === "string" && inputPrompt.startsWith("{") 
        ? JSON.parse(inputPrompt) 
        : { message: inputPrompt };
      const result = await this._runReAct(inputPrompt, initialArgs);
      const durationMs = Date.now() - startMs;
      this._updateState(
        { AgentAnswers: [{ id: `${this.name}-${Date.now()}`, text: `${this.name}: ${result.finalText}` }] },
        {}
      );
      this._emitLogger("onFinal", {
        finalText: result.finalText,
        toolHistory: this.toolHistory,
        durationMs,
        usage: this.cumulativeUsage
      });
      return { answerText: result.finalText, message: SUB_CRITICAL };
    } catch (error) {
      if (error instanceof TerminalError) {
        return { answerText: error.reason, message: SUB_CRITICAL };
      }
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "chatAsSubAgent" });
      throw error;
    } finally {
      this.currentParentMeta = null;
    }
  }

  _getFunctionDeclaration(): FunctionDeclaration {
    const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
    const required: string[] = [];

    if (this.inputSchema?.args) {
      for (const arg of this.inputSchema.args) {
        properties[arg.name] = {
          type: arg.type,
          ...(arg.desc ? { description: arg.desc } : {}),
          ...(arg.enum ? { enum: arg.enum } : {}),
        };
        if (arg.required) required.push(arg.name);
      }
    } else {
      // デフォルト: message のみ
      properties["message"] = { type: "STRING", description: "サブエージェントへの依頼内容" };
      required.push("message");
    }

    return {
      name: this.name,
      description: [this.summary, this.instruction].filter(Boolean).join("\n"),
      parameters: {
        type: "OBJECT",
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
  }

  getCapability(): string {
    return `name: ${this.name}\ndescription: ${this.summary}`;
  }

  getAgentDescription(): string {
    const desc = [this.summary, this.instruction];
    if (this.inputSchema?.args) desc.push(`【依頼形式（引数）】\n${JSON.stringify(this.inputSchema.args, null, 2)}`);
    if (this.outputSchema) desc.push("【返却形式】\n" + JSON.stringify(this.outputSchema, null, 2));
    const toolCaps = [...this.toolDefinitions.values()].map(tool => toCapabilityLine(tool));
    const agentCaps = [...this.agentHandlers.values()].map(agent => agent.getCapability());
    return [
      `agentname: ${this.name}`,
      `description: ${desc.join("\n")}`,
      `tools: ${toolCaps.length > 0 ? toolCaps.join(", ") : "なし"}`,
      `agents: ${agentCaps.length > 0 ? agentCaps.join(", ") : "なし"}`,
    ].join("\n");
  }

  // ───────── ステートフル版 ReAct（基底クラスの標準実装） ─────────

  protected async _runReAct(inputPrompt: string, initialArgs?: Record<string, unknown>): Promise<ChatResult> {
    let initCtx = "";
    // initialTool は Network が AgentConfig.initialToolName から解決して注入済み
    if (this.initialTool) {
      const initialToolResult = await this._executeInitialTool(inputPrompt, initialArgs);
      // initialPrompt: GAS版準拠の「次ステップで破棄される」指示テキスト付き結果
      if (initialToolResult) initCtx = `\n${initialToolResult.initialPrompt}`;
    }

    const disabledRuntime = await this._createInitialState(inputPrompt + initCtx);
    for (const toolName of disabledRuntime.disabledTools) this.disabledTools.add(toolName);
    for (const agentName of disabledRuntime.disabledAgents) this.disabledAgents.add(agentName);

    for (let step = 1; step <= this.maxSteps; step++) {
      // ネットワーク全体または自身の強制終了をチェック
      if (this.sessionStatus?.terminateReason) {
        throw new TerminalError(this.sessionStatus.terminateReason!);
      }

      const ctx = this._getContext(step, inputPrompt);
      const prompt = await this._applyHarnessBeforePrompt(this._buildPrompt(inputPrompt), ctx);
      const { res, durationMs, usage } = await this._generateLLM(prompt, this._llmOpts());

      if (res.kind === "text") {
        return { finalText: res.text, states: { global: this.globalState, local: this.state } };
      }
      if (res.kind === "functionCall") {
        const entries = await this._executeTools(res.calls, step, inputPrompt, durationMs);
        await this._updateStateWithToolResult(inputPrompt, entries);
        // state_update 完了後、 result・evaluation はどちらも「消費済み」なので破棄する
        //   result    -> State に要約・格納された。生データを LLM に再送する必要はない。
        //   evaluation -> state_update フェーズで判定に使い終わった。次ステップ以降は不要。
        for (const entry of entries) {
          // result が truthy な場合のみ破棄（失敗エントリ result=null には上書きしない）
          if (entry.result) entry.result = "要約してstateへ格納済み";
          entry.evaluation = undefined;
        }
        this.toolHistory.push(...entries);
        this._emitLogger("onToolCall", { name: "multiple", args: {}, durationMs, usage });
      }
      if (res.kind === "unknown") console.warn(`[Synapse] 予期しないLLM応答: ${res.reason}`);
    }

    const finalText = await this._runFinalAnswer(inputPrompt);
    return { finalText, states: { global: this.globalState, local: this.state } };
  }

  protected async _runFinalAnswer(inputPrompt: string): Promise<string> {
    const prompt = this._buildPrompt(inputPrompt, { topText: FINAL_STEP_MSG });
    const { res, usage, durationMs } = await this._generateLLM(prompt, { ...this._llmOpts(), tools: [] });
    return res.kind === "text"
      ? res.text
      : "【システム通知】Agentが規定ステップ内で結論に到達できませんでした。";
  }

  protected _buildPrompt(inputPrompt: string, opts: BuildPromptOptions = {}): string {
    const { topText = "", afterRulesText = "", isStateContext = false } = opts;
    const today = new Date().toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo",
    });
    const lines: string[] = [
      topText,
      "【依頼内容】", inputPrompt,
      this.inputSchema ? `【依頼形式の説明】\n${this.inputSchema}` : "",
      "【システムプロンプト】", this.prompt,
      "【ツール一覧】", ...[...this.toolDefinitions.values()].map(tool => toPromptDefinition(tool)),
      "【サブエージェント一覧】", AGENT_CAUTION,
      ...[...this.agentHandlers.values()].map(agent => agent.getAgentDescription()),
      "【ナレッジ】",
      "以下のあなたの知識として備わっている内容です。",
      HUMAN_IN_LOOP_BASE,
      this.knowledge,
      "【今日の日付】", today,
      "【ツール実行履歴】", JSON.stringify(this.toolHistory, null, 2),
      isStateContext ? "" : EXEC_RULES,
      afterRulesText,
      this._buildStateGuideText(),
    ].filter((line): line is string => typeof line === "string" && line.length > 0);

    if (this.outputSchema && !isStateContext) {
      lines.push("【最終出力形式】自然言語回答は禁止。以下の形式で回答すること。",
        JSON.stringify(this.outputSchema, null, 2));
    }
    return lines.join("\n");
  }

  protected _buildStateGuideText(): string {
    let stateGuideText = `\n【グローバルstate】\n${JSON.stringify(this.globalState, null, 2)}\n【state構造解説】\n${this.stateGuide.global}`;
    if (this.enableState) {
      stateGuideText += `\n【ローカルstate（現在値）】\n${JSON.stringify(this.state, null, 2)}\n【stateプロパティの意味】\n${this.stateGuide.local}`;
    }
    return stateGuideText;
  }

  protected _getToolSchemas(): FunctionDeclaration[] {
    const tools = [...this.toolDefinitions.values()]
      .filter((tool) => !this.disabledTools.has(tool.name))
      .map((tool) => toFunctionDeclaration(tool));

    const agents = [...this.agentHandlers.values()]
      .filter((agent) => !this.disabledAgents.has(agent.name))
      .map((agent) => agent._getFunctionDeclaration());

    return [...tools, ...agents];
  }

  protected async _executeTools(
    calls: Array<{ name: string; args: Record<string, unknown>; parseError?: string }>,
    step = 0,
    currentInput = "",
    durationMs = 0
  ): Promise<ToolHistoryEntry[]> {
    const results: ToolHistoryEntry[] = [];
    const meta = this._getMeta();
    const ctx = this._getContext(step, currentInput);
    for (const call of calls) {
      if (this.sessionStatus?.terminateReason) {
        throw new TerminalError(this.sessionStatus.terminateReason!);
      }
      // LLM が不正なレスポンスを返した場合（parseError あり）は実行せずにログ通知して skip
      if (call.parseError) {
        const msg = `LLM の functionCall パースエラー (${call.name}): ${call.parseError}`;
        console.warn(`[Synapse] ${msg}`);
        this._emitLogger("onError", { message: msg, context: `parseError:${call.name}` });
        results.push({
          toolName: call.name, args: call.args, result: null,
          agentName: this.name, status: "failed", error: msg,
        });
        continue;
      }

      try {
        let toolCall = { name: call.name, args: call.args };
        toolCall = await this._applyHarnessBeforeTool(toolCall, ctx);
        this._emitLogger("onToolCall", { name: toolCall.name, args: toolCall.args, durationMs });

        let toolResult: ToolResult;
        const toolStartMs = Date.now();
        if (this.disabledTools.has(toolCall.name) || this.disabledAgents.has(toolCall.name)) {
          throw new Error(`ツールまたはエージェント "${toolCall.name}" は現在無効化されています`);
        }
        if (this.toolDefinitions.has(toolCall.name)) {
          const toolDef = this.toolDefinitions.get(toolCall.name)!;
          const validatedArgs: Record<string, unknown> = {};
          const schemaArgs = toolDef.schema.args ?? [];
          const schemaArgNames = schemaArgs.map(argDefinition => argDefinition.name);

          // 未定義の引数がないかチェックしつつ、定義済みのものだけを抽出
          for (const key in toolCall.args) {
            if (schemaArgNames.includes(key)) {
              validatedArgs[key] = toolCall.args[key];
            } else {
              throw new Error(`ツール "${toolCall.name}" に存在しない引数 "${key}" が指定されました。`);
            }
          }

          // 必須引数のチェック
          for (const argDef of schemaArgs) {
            if (argDef.required && !(argDef.name in validatedArgs)) {
              throw new Error(`ツール "${toolCall.name}" の必須引数 "${argDef.name}" が不足しています。`);
            }
          }

          toolCall.args = validatedArgs;
          const rawResult = await (this.onToolCall as Function)(toolCall, ctx);
          // 戻り値の正規化: ユーザーが ToolResult オブジェクトを返さなかった場合は result にラップする
          if (rawResult && typeof rawResult === "object" && ("result" in rawResult || "status" in rawResult || "error" in rawResult)) {
            toolResult = rawResult as ToolResult;
          } else {
            toolResult = { result: rawResult };
          }
          // status の自動補完: 未定義なら error の有無で判定
          if (!toolResult.status) {
            toolResult.status = toolResult.error ? "failed" : "success";
          }
        } else if (this.agentHandlers.has(toolCall.name)) {
          const sub = this.agentHandlers.get(toolCall.name)!;
          // inputSchema がある場合は JSON 形式で、ない場合は message 文字列として渡す
          const prompt = sub.inputSchema?.args ? JSON.stringify(toolCall.args, null, 2) : (toolCall.args.message as string);
          const subRes = await sub._chatAsSubAgent(prompt, meta);
          toolResult = { status: "success", result: subRes };
        } else {
          throw new Error(`存在しないツール/エージェントです: ${toolCall.name}`);
        }
        const toolDurationMs = Date.now() - toolStartMs;
        // Harness.afterToolResult に正しい call 情報を渡す
        const processed = await this._applyHarnessToolResult(toolResult, toolCall, ctx);
        // ToolResult.log がある場合は state に自動反映
        if (processed.log && typeof processed.log === "object") {
          ctx.updateState(processed.log as StateDiff);
        }
        const entry: ToolHistoryEntry = {
          toolName: toolCall.name,
          args: toolCall.args,
          result: processed.result,
          agentName: this.name,
          status: processed.status || "success",
          error: processed.error,
          // ToolDefinition の evaluation を結果とセットで記録する
          // 次ステップのプロンプトに toolHistory として展開され、LLM が結果を自己評価できるようになる
          evaluation: this.toolDefinitions.get(toolCall.name)?.evaluation,
        };
        this._emitLogger("onToolResult", { entry, durationMs: toolDurationMs });
        results.push(entry);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const entry: ToolHistoryEntry = {
          toolName: call.name, args: call.args, result: null,
          agentName: this.name, status: "failed", error: msg,
        };
        this._emitLogger("onError", { message: msg, context: `executeTools:${call.name}` });
        results.push(entry);
      }
    }
    return results;
  }

  protected _updateState(
    diffs: Record<string, unknown>,
    option: { autoIdPrefix?: string } = {}
  ): StateUpdateResult {
    const errs: StateUpdateError[] = [];
    const success: StateUpdateRecord[] = [];
    const pfx = option.autoIdPrefix ?? "";
    const normalizeKey = (key: string) => String(key).replace(/^on/i, "").toLowerCase();

    const findTarget = (path: string) => {
      const rawPath = String(path).trim();
      let scope = "", key = rawPath;
      if (rawPath.includes(".")) {
        const parts = rawPath.split(".");
        scope = parts[0];
        key = parts.slice(1).join(".");
      }
      const normalizedKey = normalizeKey(key);
      const findKey = (obj: Record<string, unknown[]>) => Object.keys(obj).find(keyName => normalizeKey(keyName) === normalizedKey) ?? null;

      if (scope === "global") {
        const targetKey = findKey(this.globalState);
        if (!targetKey) throw new Error(`globalState に存在しないkey: ${path}`);
        return { scope: "global" as const, key: targetKey, bucket: this.globalState[targetKey] };
      }
      if (scope === "local") {
        const targetKey = findKey(this.state);
        if (!targetKey) throw new Error(`localState に存在しないkey: ${path}`);
        return { scope: "local" as const, key: targetKey, bucket: this.state[targetKey] };
      }

      const localKey = findKey(this.state);
      const globalKey = findKey(this.globalState);
      if (localKey && globalKey) throw new Error(`'${path}' が local/global 両方に存在します`);
      if (localKey) return { scope: "local" as const, key: localKey, bucket: this.state[localKey] };
      if (globalKey) return { scope: "global" as const, key: globalKey, bucket: this.globalState[globalKey] };
      throw new Error(`存在しないstate key: ${path}`);
    };

    const toText = (value: unknown) => typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
    const makeId = (bucket: { id: string }[], prefix: string) => {
      const sanitizedPrefix = prefix.replace(/[^\w-]/g, "_").replace(/_+/g, "_");
      let counter = 1;
      let newId = `${sanitizedPrefix}-${counter}`;
      while (bucket.some(item => item.id === newId)) {
        counter++;
        newId = `${sanitizedPrefix}-${counter}`;
      }
      return newId;
    };

    for (const path in diffs) {
      try {
        const target = findTarget(path);
        if (!Array.isArray(target.bucket)) throw new Error(`state.${target.key} は配列である必要があります`);
        const items = Array.isArray(diffs[path]) ? diffs[path] as unknown[] : [diffs[path]];
        for (const raw of items) {
          try {
            let id: string, text: string;
            if (raw && typeof raw === "object" && !Array.isArray(raw) && "id" in raw && "text" in raw) {
              id = (raw as { id: string }).id;
              text = toText((raw as { text: unknown }).text);
            } else {
              if (!pfx) throw new Error(`id/text 形式ではありません: ${JSON.stringify(raw)}`);
              id = makeId(target.bucket, `${pfx}-${target.key}`);
              text = toText(raw);
            }
            if (!id) throw new Error("id が不正です");
            if (!text) throw new Error("text が不正です");
            const index = target.bucket.findIndex(item => item.id === id);
            if (index === -1) target.bucket.push({ id, text });
            else target.bucket[index].text = text;
            success.push({ scope: target.scope, key: target.key, id, text });
          } catch (innerError) { errs.push({ failed: raw, message: (innerError as Error).message }); }
        }
      } catch (pathError) { errs.push({ failed: { path, value: diffs[path] }, message: (pathError as Error).message }); }
    }
    return { success, errs };
  }

  protected async _executeInitialTool(
    inputPrompt: string, 
    initialArgs?: Record<string, unknown>
  ): Promise<{ result: unknown; initialPrompt: string } | false> {
    // initialTool は Network が AgentConfig.initialToolName から解決して注入済み
    if (!this.initialTool) return false;
    const originalToolName = this.initialTool.name;
    const toolDef = this.toolDefinitions.get(originalToolName);
    if (!toolDef) {
      console.warn(`[Synapse] initialTool "${originalToolName}" の定義が見つかりません。`);
      return false;
    }

    try {
      const args: Record<string, unknown> = {};
      const schemaArgs = toolDef.schema.args ?? [];

      // initialArgs があれば優先的に使用、なければ prompt からの抽出を試みる（後方互換性）
      const source = initialArgs || (JSON.parse(inputPrompt) as Record<string, unknown>);

      // スキーマに含まれる引数のみを抽出
      for (const argDef of schemaArgs) {
        if (argDef.name in source) {
          args[argDef.name] = source[argDef.name];
        }
      }

      // 必須引数のチェック
      for (const argDef of schemaArgs) {
        if (argDef.required && !(argDef.name in args)) {
          throw new Error(`initialTool "${originalToolName}" の必須引数 '${argDef.name}' が不足しています`);
        }
      }

      const ctx = this._getContext(0, inputPrompt);
      const toolCall = await this._applyHarnessBeforeTool({ name: originalToolName, args }, ctx);

      const rawResult = await (this.onToolCall as Function)(toolCall, ctx);
      let toolResult: ToolResult;
      if (rawResult && typeof rawResult === "object" && ("result" in rawResult || "status" in rawResult || "error" in rawResult)) {
        toolResult = rawResult as ToolResult;
      } else {
        toolResult = { result: rawResult };
      }
      if (!toolResult.status) {
        toolResult.status = toolResult.error ? "failed" : "success";
      }

      this.toolHistory.push({
        toolName: toolCall.name, args: toolCall.args, result: toolResult.result,
        agentName: this.name, status: toolResult.status || "success",
      });
      // stateful 時 初期State構築の材料として使ったあと、次ステップでは破棄されることを提示する指示テキストを付与する
      const initialPrompt = [
        "【初期tool実行結果】",
        "以下はシステムが機械的に実行したtool結果である。",
        "この結果を、初期state構築の材料として必ず考慮すること。",
        "次以降のステップではこの結果は全て破棄されます。重要情報は必ず漏れなくstateに格納してください。",
        "",
        "- 初期toolで得られた情報は、必要に応じて facts / evidences / actions / decisions / openQuestions / hypotheses / tasks に反映する。",
        "- tool結果を丸写しせず、後続判断に必要な粒度で要約する。",
        "- 初期toolを実行済みであることは actions に残す。",
        "- 初期tool結果だけで回答可能か、追加toolが必要かを tasks / hypotheses / openQuestions に反映する。",
        "",
        JSON.stringify(toolResult.result, null, 2),
      ].join("\n");
      return { result: toolResult.result, initialPrompt };
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "initialTool" });
      throw errorInstance;
    }
  }

  protected async _createInitialState(inputPrompt: string): Promise<DisabledRuntime> {
    const prompt = this._buildPrompt(inputPrompt, {
      topText: STATE_INIT_TOP,
      afterRulesText: this.stateGuide.howTo,
      isStateContext: true,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { res, durationMs, usage } = await this._generateLLM(prompt, {
          modelName: this.initialModelName ?? this.modelName,
          temperature: 0,
          maxTokens: this.maxTokens,
          tools: [], responseMimeType: "application/json",
        });
        if (res.kind !== "text") throw new Error("LLMがJSONテキスト以外を返しました");
        const parsed = JSON.parse(res.text) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("JSONオブジェクトである必要があります");
        }
        if ("global" in parsed || "local" in parsed) throw new Error("global/local キーは禁止です");
        const runtime = (parsed._runtime ?? {}) as { disabledTools?: string[]; disabledAgents?: string[] };
        delete parsed._runtime;
        const diffs: Record<string, unknown> = {};
        for (const key in parsed) {
          const value = parsed[key];
          if (Array.isArray(value) && value.length === 0) continue;
          diffs[key] = value;
        }
        const updateResult = this._updateState(diffs);
        if (updateResult.errs.length > 0) throw new Error(`state反映エラー: ${JSON.stringify(updateResult.errs)}`);

        const disabledTools = runtime.disabledTools ?? [];
        const disabledAgents = runtime.disabledAgents ?? [];
        this._emitLogger("onInitialState", { disabledTools, disabledAgents, durationMs, usage });

        return { disabledTools, disabledAgents };
      } catch (error) {
        if (attempt >= 1) throw new Error(`初期state作成失敗: ${(error as Error).message}`);
        console.warn(`[Synapse] 初期state作成リトライ: ${(error as Error).message}`);
      }
    }
    throw new Error("初期state作成失敗");
  }

  protected async _updateStateWithToolResult(
    inputPrompt: string,
    toolExecutions: ToolHistoryEntry[]
  ): Promise<void> {
    // toolExecutions には ToolDefinition.evaluation が含まれている（executeTools で設定済み）
    // -> LLM は evaluation を参照してツール結果の合否を判断したうえで state に反映できる
    const topText = [
      "【context: state_update】",
      "あなたは state の差分JSONを作る専用AIです。",
      "",
      "【入力】",
      `message: ${inputPrompt}`,
      `tool_executions: ${JSON.stringify(toolExecutions, null, 2)}`,
      "",
      "【目的】",
      "今回のツール実行結果を state に反映する最小差分を返すこと。",
      "各tool_executionの evaluation フィールドが存在する場合、その評価基準に従って結果の合否・品質を判定してから state に反映すること。",
      "",
      "【重要な前提】",
      "この更新以降、ReActループ中のエージェントはツール実行結果を直接参照できません。",
      "したがって、以降の判断に必要になりそうな情報は、漏れなくこの更新で必ず保持してください。",
      "state を破棄することは絶対に存在せず、追加もしくはアップデートのみです。",
      "",
      "重要：",
      "この更新で保持すべきなのは「何が得られたか」だけではありません。",
      "「その情報をどう判断したか」「なぜ残したか」「次にどう使う前提か」も、既存stateのどこかに必ず残してください。",
      "state は情報の倉庫ではなく、判断の履歴です。",
      "",
      "【state 記述の最重要原則】",
      "state の各項目は、単なる情報断片として書いてはなりません。",
      "必ず、「何の論点・主題に属するか」「その情報をどう扱うか」が単体で分かる完結文で記載してください。",
      "",
      "────────────────",
      "【taskの評価と更新ルール】",
      "────────────────",
      "今回のツール実行結果を受けて、既存のすべての tasks について以下を必ず評価し、必要なら更新すること：",
      "",
      "1. 完了・不要の判定:",
      "   - このtaskは、今回の結果だけで既に目的が満たされていないか？",
      "   - 不要になった場合は、完了した旨を update すること。",
      "",
      "2. 更新・追加の許可条件:",
      "   - 既存taskの前提がツール結果により崩れた",
      "   - 既存taskでは goals に到達できないことが確定した",
      "   - 新たに「回答成立に必須な未確定論点」が発生した",
      "",
      "■ task.text の状態表現",
      "- 完了した task は、同じ id の text を必ず「【完了】」で始める",
      "- 不要になった task は、同じ id の text を必ず「【不要】」で始める",
      "- 継続が必要な task は、同じ id の text を書き換え、何が不足し次に何を確認するかを明記する",
      "- 新しく実行すべき task を追加する場合は、「【次に実行】」で始める",
      "- 条件が満たされた「【条件付き】」task は「【次に実行】」へ更新する",
      "- 条件が満たされなかった場合は「【不要】」へ更新する",
      "",
      "■ 禁止",
      "- 既存 tasks の text を一字一句同じまま update してはならない",
      "- tool実行後に tasks を更新しないことは禁止",
      "- 完了した task を未完了に見える文面のまま残すことは禁止",
      "",
      "────────────────",
      "【終了判定】",
      "────────────────",
      "以下を満たす場合、tasksは更新（追加）してはならない：",
      "- factsのみで goals に対する回答が構築可能",
      "- 未解決論点が「回答成立に必須ではない」",
      "",
      "────────────────",
      "【厳守ルール（出力フォーマット）】",
      "────────────────",
      "1) 出力は JSON のみ。形式は各プロパティをキーとし、配列を値とするオブジェクトのみ。",
      "2) 変更がない配列（空配列）は絶対に出力せず、キーごと省略すること。",
      "3) 既存の項目を更新する場合、既存の id を指定し、text に変更後の全文を入れること。",
      "4) 新規追加の場合、既存と被らない新しい id を指定すること。",
      "5) tasks の更新では text の内容自体を更新すること（status など未定義キーを使わない）。",
      "6) stateの変更が一切不要な場合は {} （空のJSONオブジェクト）を返すこと。",
      "7) actions には必ず1つは入れること。",
      "8) 絶対に各プロパティの description と howToBuild にのっとって格納すること。",
      "",
      "JSONのキーは facts|vars|goals|tasks|decisions|openQuestions|actions|... のトップキー名のみ。",
      "絶対に global.facts など階層を深く記載してはならない。適用先はシステムが自動判定する。",
    ].join("\n");
    // afterRulesText に stateGuide.howTo を渡す（各プロパティの記載方針ガイドをプロンプトに含める）
    let prompt = this._buildPrompt(inputPrompt, {
      topText,
      afterRulesText: this.stateGuide.howTo,
      isStateContext: true,
    });
    let updateResult: { errs: StateUpdateError[]; success: StateUpdateRecord[] } | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { res, durationMs, usage } = await this._generateLLM(prompt, {
          modelName: this.modelName, temperature: 0, maxTokens: this.maxTokens,
          tools: [], responseMimeType: "application/json",
        });
        if (res.kind !== "text") throw new Error("LLMがJSONテキスト以外を返しました");
        const text = res.text.trim();
        if (text === "{}") {
          this._emitLogger("onStateUpdate", {
            diffs: {} as StateDiff, success: [], errors: [],
            currentState: { global: this.globalState, local: this.state },
            durationMs,
          });
          return;
        }
        const diffs = JSON.parse(text) as Record<string, unknown>;
        const ctx = this._getContext(-1, inputPrompt);
        const processed = await this._applyHarnessStateUpdate(diffs as StateDiff, ctx) as Record<string, unknown>;
        updateResult = this._updateState(processed);
        if (updateResult.errs.length === 0) {
          // 全件成功
          this._emitLogger("onStateUpdate", {
            diffs: diffs as StateDiff, success: updateResult.success, errors: updateResult.errs,
            currentState: { global: this.globalState, local: this.state },
            durationMs, usage,
          });
          return;
        }
        // 部分的にエラーがある場合。リトライしてもエラーが残れば例外を投げて中断
        if (attempt >= 2) {
          const errMsg = `[Synapse] state更新エラーが上限に達しました:\n${JSON.stringify(updateResult.errs, null, 2)}`;
          this._emitLogger("onError", { message: errMsg, context: "stateUpdate.retryLimit" });
          throw new Error(errMsg);
        }
        // リトライ: 前回のエラー内容をプロンプトに追記する（GAS版準拠）
        console.warn(`[Synapse] state更新リトライ (${attempt + 1}/3): エラーあり`);
        prompt += `\n前回のstate更新で以下のエラーが発生しました。要因をよく確認し、失敗した内容を修正して再度更新差分を出力してください。\n${JSON.stringify(updateResult, null, 2)}`;
      } catch (error) {
        if (attempt >= 2) {
          const errorInstance = error instanceof Error ? error : new Error(String(error));
          this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "stateUpdate.exception" });
          throw error;
        }
        console.warn(`[Synapse] state更新リトライ (${attempt + 1}/3): ${(error as Error).message}`);
        // JSON パースエラー等の場合もエラー内容を追記してリトライ
        prompt += `\n前回の出力でエラーが発生しました: ${(error as Error).message}\n正しいJSON形式で再出力してください。`;
      }
    }
  }

  protected _emitLogger<K extends keyof Logger>(
    event: K,
    payload: any
  ): void {
    if (!this.logger) return;
    const handler = this.logger[event] as ((payload: any, meta: AgentMeta) => void) | undefined;
    if (typeof handler === "function") {
      try {
        // すべてのイベントに currentState を注入
        const fullPayload = {
          ...payload,
          currentState: { global: this.globalState, local: this.state }
        };
        handler(fullPayload, this._getMeta());
      } catch (error) {
        // ロガー内のエラーを onError に飛ばして報告する
        if (event !== "onError") {
          const errorInstance = error instanceof Error ? error : new Error(String(error));
          this._emitLogger("onError", {
            message: `Logger.${String(event)} 実行エラー: ${errorInstance.message}`,
            stack: errorInstance.stack,
            context: `logger.${String(event)}`
          });
        } else {
          // onError 自体が失敗した場合は console.error で最終報告
          console.error(`[Synapse] Logger.onError 自体が失敗しました:`, error);
        }
      }
    }
  }

  /** Harness.beforePrompt を適用する */
  protected async _applyHarnessBeforePrompt(prompt: string, ctx: AgentContext): Promise<string> {
    if (!this.harness?.beforePrompt) return prompt;
    try {
      return await this.harness.beforePrompt(prompt, ctx);
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "harness.beforePrompt" });
      throw error;
    }
  }

  /** Harness.beforeTool を適用する */
  protected async _applyHarnessBeforeTool(call: ToolCall, ctx: AgentContext): Promise<ToolCall> {
    if (!this.harness?.beforeTool) return call;
    try {
      return await this.harness.beforeTool(call, ctx);
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "harness.beforeTool" });
      throw error;
    }
  }

  /** Harness.afterToolResult を適用する（call 情報を正しく渡す） */
  protected async _applyHarnessToolResult(
    result: ToolResult,
    call: ToolCall,
    ctx: AgentContext
  ): Promise<ToolResult> {
    if (!this.harness?.afterToolResult) return result;
    try {
      return await this.harness.afterToolResult(result, call, ctx);
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "harness.afterToolResult" });
      throw error;
    }
  }

  /** Harness.onStateBeforeUpdate を適用する */
  protected async _applyHarnessStateUpdate(diffs: StateDiff, ctx: AgentContext): Promise<StateDiff> {
    if (!this.harness?.onStateBeforeUpdate) return diffs;
    try {
      return await this.harness.onStateBeforeUpdate(diffs, ctx);
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this._emitLogger("onError", { message: errorInstance.message, stack: errorInstance.stack, context: "harness.onStateBeforeUpdate" });
      throw error;
    }
  }

  protected _getMeta(): AgentMeta {
    return { agentName: this.name, parentMeta: this.currentParentMeta, enableState: this.enableState };
  }

  protected _getContext(step: number, currentInput: string): AgentContext {
    const currentState = {
      global: this.globalState,
      local: this.state
    };
    return {
      agentName: this.name, currentInput, step,
      state: this.enableState ? this.state : null,
      globalState: this.globalState,
      currentState,
      updateState: (diffs: StateDiff) => {
        const updateResult = this._updateState(diffs, { autoIdPrefix: `harness-${this.name}` });
        this._emitLogger("onStateUpdate", {
          diffs, success: updateResult.success, errors: updateResult.errs,
          currentState: { global: this.globalState, local: this.state },
          durationMs: 0 // プログラムからの強制反映のため推論時間は0
        });
      },
      disableTool: (name: string) => this.disabledTools.add(name),
      disableAgent: (agentName: string) => {
        this.disabledAgents.add(agentName);
      },
      terminate: (reason: string) => {
        if (this.sessionStatus) this.sessionStatus.terminateReason = reason;
        throw new TerminalError(reason);
      },
    };
  }

  protected _llmOpts() {
    return {
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      tools: this._getToolSchemas(),
    };
  }

  protected async _generateLLM(prompt: string, opts: Parameters<LLMClient["generate"]>[1]) {
    const start = Date.now();
    const result = await this.llm.generate(prompt, opts);
    const durationMs = Date.now() - start;

    if (result.usage) {
      this.cumulativeUsage.promptTokens += result.usage.promptTokens;
      this.cumulativeUsage.completionTokens += result.usage.completionTokens;
      this.cumulativeUsage.totalTokens += result.usage.totalTokens;
    }

    return { res: result.res, usage: result.usage, durationMs };
  }
}
