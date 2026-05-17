import { Agent } from "./Agent.js";
import type { ChatResult } from "../types.js";
import { TerminalError } from "../types.js";

/**
 * ステートレス版Agent
 * Agent（ステートフル基底）を extends し、_runReAct のみ override する。
 * - _createInitialState / _updateStateWithToolResult は呼ばない
 * - toolHistory の result は要約せずそのまま保持する
 */
export class StatelessAgent extends Agent {
  protected override async _runReAct(inputPrompt: string): Promise<ChatResult> {
    let initCtx = "";
    // 初期ツール実行。 stateful と違い state への格納はしない。
    // _executeInitialTool は toolHistory に result をそのまま push する
    if (this.initialTool) {
      const res = await this._executeInitialTool(inputPrompt);
      if (res) initCtx = `\n${res.initialPrompt}`;
    }

    const basePrompt = inputPrompt + initCtx;

    for (let step = 1; step <= this.maxSteps; step++) {
      // ネットワーク全体または自身の強制終了をチェック
      if (this.sessionStatus?.terminateReason) {
        throw new TerminalError(this.sessionStatus.terminateReason!);
      }

      const ctx = this._getContext(step, basePrompt);
      const prompt = await this._applyHarnessBeforePrompt(this._buildPrompt(basePrompt), ctx);
      const { res, durationMs, usage } = await this._generateLLM(prompt, this._llmOpts());

      if (res.kind === "text") {
        return { finalText: res.text, states: { global: this.globalState, local: this.state } };
      }

      if (res.kind === "functionCall") {
        // ステートレス: state 更新なし。Result はそのまま toolHistory に積む。
        const entries = await this._executeTools(res.calls, step, basePrompt, durationMs);
        for (const entry of entries) {
          entry.evaluation = undefined;
        }
        this.toolHistory.push(...entries);
        this._emitLogger("onToolCall", { name: "multiple", args: {}, durationMs, usage });
      }

      if (res.kind === "unknown") {
        console.warn(`[Synapse:StatelessAgent] 予期しないLLM応答: ${res.reason}`);
      }
    }

    const finalText = await this._runFinalAnswer(basePrompt);
    return { finalText, states: { global: this.globalState, local: this.state } };
  }
}
