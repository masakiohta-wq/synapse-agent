# Synapse Framework
### Enterprise-grade State-centric AI Agent Orchestration

**Synapse** は、自律型 AI エージェントの推論プロセスを構造化し、高度な業務遂行を可能にする TypeScript/Node.js 向けフレームワークです。「状態（State）駆動」のアーキテクチャにより、長期の思考ループでも精度を落とさず、一貫性のある意思決定を実現します。

> [!IMPORTANT]
> **🚀 オープンベータ無制限無料開放 ＆ フィードバックのお願い**
> 現在 Synapse はバージョン 0.x のベータ検証フェーズにあります。より堅牢で直感的なフレームワークへと皆さまと共に作り上げるため、**GitHub リポジトリを Public（公開）**に移行しました！
> ベータ期間中は、エージェント数の上限制限やライセンスキー認証を含む**すべての制限を完全に無効化**しており、大規模なマルチエージェント構成も含め**すべての機能を完全無料・無制限**でご利用いただけます。
> ぜひ皆さまのプロジェクトで活用いただき、改善点やご要望などを GitHub の Issues や Discussions にてお気軽にお寄せください！みんなで素晴らしいフレームワークを作り上げましょう！

> [!TIP]
> **📖 公式解説シリーズ公開中！**
> Synapse のコアな設計思想や、商用 AI エージェント開発における実践的なノウハウ（State駆動、フロント防御エージェント、ポインタ設計など）を体系的にまとめた解説記事を各プラットフォームで公開しています。
> - **[Qiita](https://qiita.com)**: 有向グラフの限界やハルシネーション対策などの完全版技術解説
> - **[Zenn](https://zenn.dev)**: マルチエージェント設計の罠や出力トークン最適化などの実践的開発ノウハウ
> - **[note](https://note.com)**: ビジネス実務におけるAIエージェントの思想とシステム設計の真実

---

## 目次
- [1. 導入方法：クイックスタート](#1-導入方法クイックスタート)
- [2. 設計思想：State駆動による自律的推論](#2-設計思想state駆動による自律的推論の実現)
- [3. 設計原理：推論プロセスの構造化](#3-設計原理推論プロセスの構造化)
- [4. 機能仕様：推論精度の制御メカニズム](#4-機能仕様推論精度を制御する技術的アプローチ)
- [5. 運用仕様：実行制御と観測](#5-運用仕様実行制御と観測ハーネスロガー)
- [6. APIリファレンス](#6-apiリファレンス)
- [7. 実装方法：サンプルコード（最大構成）](#7-実装方法サンプルコード最大構成)

---

### 1. 導入方法：クイックスタート

Synapse は Node.js 環境で動作するフレームワークです。複雑なセットアップを必要とせず、以下の手順ですぐに自律型 AI エージェントの構築を開始できます。

- **API キー (Google AI Studio)**: 手軽に検証を開始したい場合に推奨。
- **プロジェクト ID (Vertex AI / GCP)**: エンタープライズ運用や、GCP の既存リソースと連携する場合に使用。

> [!NOTE]
> **実行環境とライセンス**
> - **環境**: Node.js 18 以上が必要です。モジュール形式は **ESM** を推奨します。
> - **ライセンス**: 現在はオープンベータ期間中のため、エージェント数無制限で**完全無料・ライセンスキー不要**でご利用いただけます。



### 2. 設計思想：State駆動による自律的推論の実現

従来の AI アプリケーション開発における課題は、人間が「ワークフロー」を固定的に定義することで、AI の判断を制限してしまう点にあります。静的なフローに基づく設計は、予期せぬ入力や複雑な例外状態に直面した際、システムの硬直化を招きます。

Synapse は、この「ワークフロー型設計」に対する構造的な解法として、State駆動型のアーキテクチャを採用しています。

#### ワークフロー型の限界と複雑性の制御
精度向上を目的に「分岐・検証・リトライ」のノードを増やすほど、フローの複雑性は指数関数的に増加し、微細な修正がシステム全体に予期せぬ影響を及ぼすリスクが高まります。人間がすべての実行パスを網羅的に定義することには構造的な限界が存在します。

#### 「状態監視」に基づく自律的軌道修正
Synapse が提供するのは、固定的な実行パスではなく、エージェントが中央の「状態（State）」を常に参照し、自律的に判断・計画・実行するアーキテクチャです。推論過程において不完全な状態が発生した場合でも、エージェント自身が State の不足を検知し、目標達成に向けて動的に実行戦略を再構成します。

#### 推論プロセスとシステム構造の分離
エンジニアの役割は、AI の各ステップを逐次命令することではありません。AI が論理的な推論と計画を行えるための「データ構造（State）」を設計することです。システムは推論を支えるインフラとして機能し、AI はその構造化された環境下で自律的にゴールを追求します。

#### エージェント単位の責務の独立性
Synapse は、システムの一部として AI を呼び出すだけのライブラリではなく、特定の専門性と責務を持った「自律的エージェント」を構築するためのフレームワークです。各エージェントに独立したコンテキストと責務を持たせることで、システム内での疎結合な連携と、目標に対する自律的な責任遂行を可能にします。

#### ツールの動的結合による柔軟な課題解決
エージェントに提供されるツールやサブエージェントは、状況に応じて動的に組み合わされます。特定の個別課題（点）の処理に留まらず、関連するコンテキスト全体を網羅的に処理（面）することで、静的なワークフローでは対応困難な非定型的なタスクの完遂を実現します。

#### AI オペレーションの構造化
これはインターフェースの改善ではなく、AI 開発における「構造の変革」です。AI の推論能力を最大限に活用し、構造化された State 管理によって真の自律的な AI オペレーションを実現します。


### 3. 設計原理：推論プロセスの構造化

Synapse は、高度な推論プロセスをソフトウェア構造として定義します。複雑な課題解決におけるプロセスを「解釈・計画・実行・評価・統合」のサイクルとして整理し、これをフレームワークの実行エンジンに組み込んでいます。

#### 推論プロセスの 3 フェーズ分離
Synapse は、推論プロセスを以下の 3 つのフェーズに厳格に分離し、実行順序を強制します。これにより、推論の拡散を抑制し、目標達成に向けた論理的なステップを保証します。

1. **解釈と計画 (Init Phase)**: 入力情報を解釈し、現在の「State（状態）」と照らし合わせながら、解決に向けた実行戦略（タスクリスト）を構築します。
2. **実行フェーズ (Execution Phase)**: 構築された計画に基づき、ツール実行やサブエージェントへの委譲を行います。
3. **評価と統合 (Evaluation Phase)**: 実行結果から事実（Facts）や根拠（Evidences）を抽出し、中央の「State」へと反映・統合します。

#### ログと State の分離による推論効率の向上
従来の AI アプリケーションの多くは、肥大化する実行履歴（ログ）をすべてコンテキストとして入力します。しかし、不要な情報を含むノイズは推論精度を劣化させる要因となります。

Synapse は、エージェントに対して生の実行結果を永続的に保持させません。ツール実行後の評価フェーズにおいて、必要な知見を「State」へと抽象化・反映させた後、生の実行ログをコンテキストから除外します。エージェントは常に整理された最新の「State」のみを参照して推論を行うことで、長大なセッションにおいても高い精度を維持します。

### 4. 機能仕様：推論精度を制御する技術的アプローチ

AI の推論精度は、与えられる情報の「量」ではなく「質」と「タイミング」に依存します。Synapse は、AI がハルシネーション（幻覚）を抑制し、常に客観的かつ論理的な判断を下すための高度な制御メカニズムを備えています。

#### ツール単位の評価基準（Evaluation Criterion）
各ツール定義には、その実行結果の妥当性を判定するための自然言語による基準（`evaluation`）を記述できます。この基準は、ツール実行直後の「評価フェーズ」においてのみ提示されます。エージェントは、実行結果がこの基準を満たしているかを客観的に評価し、不十分であれば即座に再試行や戦略変更を選択します。評価基準を必要なフェーズでのみ提示することで、コンテキストの汚染を防ぎ、実行結果の品質をシステムレベルで担保します。

#### 採用・棄却の判断履歴（Decisions）
AI は往々にして、一度検討して棄却した案を忘れて再度提案したり、同じ失敗を繰り返したりします。Synapse は、単なる結論だけでなく、「どの情報を根拠に何を採用し、何を棄却したか」という判断方針の履歴を「記憶」として蓄積します。これにより、長時間の思考においても思考の重複を防ぎ、ハルシネーションを抑制した一貫性のある高度な推論を可能にします。

#### 戦略的な初期コンテキスト注入（initialTool）
AI が最初の思考を開始する際、情報がゼロの状態（コールドスタート）では、推論の方向性が定まらず迷走するリスクがあります。Synapse の `initialTool` 機能は、思考ループが開始される前に特定のツールを強制実行し、その結果をあらかじめ「記憶」に注入します。例えば、ユーザー ID から関連情報を DB 取得しておくことで、AI は「誰についての依頼か」を深く理解した状態で初手の計画を立てることができ、推論の空振りを劇的に減少させます。

#### 実行環境の動的制御（Runtime Control）
エージェントに過剰なツールやサブエージェントを割り当てると、推論のノイズとなり精度を低下させます。Synapse は、初期計画フェーズにおいてエージェント自身に「現在のタスクでは使用しないツール・エージェント」を宣言させ、コンテキストから除外する機能を備えています。これにより、タスクに最適化された最小限の定義群で推論を行うことができます。

### 5. 運用仕様：実行制御と観測（ハーネス・ロガー）

自律型エージェントの運用には、実行の柔軟性を担保しつつ、統制と透明性を確保する必要があります。Synapse は、エージェント内部の推論プロセスを観測し、必要に応じて安全に介入するためのシステムインフラを提供します。

#### 実行ガードレール（Harness）
`Harness` は、エージェントの推論ループに介入するためのインターフェースです。実行のフィルタリングと動的な制御を目的としています。

- **実行前検証 (beforeTool)**: ツール実行の直前に、引数の妥当性やアクセス権限を検証します。不適切な操作を検知した場合は例外を送出し、処理をブロックします。
- **実行後検証 (afterToolResult)**: 実行結果が戻った直後に内容をスキャンします。個人情報（PII）や機密データの露出を検知した場合、内容をマスクした上でエージェントに返却します。
- **自律的リカバー**: ハーネスが実行をブロックした場合、フレームワークはその理由を AI へのフィードバックとして差し戻します。AI は失敗理由を理解し、自律的に代替案を再考することが可能です。

#### 観測と分析（Logger）
`Logger` は、エージェント内部で発生するプロセスを可視化するための仕組みです。Synapse のロガーは、共有記憶（Global State）の遷移、各フェーズでのトークン使用量、および推論時間を追跡します。これにより、マルチエージェント環境における整合性の検証や、パフォーマンスのボトルネック特定を容易にします。

#### ハブ＆スポークによるチーム統制
Synapse は、単一の巨大な AI を作るのではなく、役割が明確な「指示役（オーケストレーター）」と「専門員（スペシャリスト）」を組み合わせる設計を推奨します。オーケストレーターが全体の戦略を練り、個別のタスクは各領域のスペシャリストに委譲するという構造的な責務の分離により、複雑な大規模システムにおいても推論品質を高度に安定させることが可能です。

#### 補足：主要機能の使い分けガイド
エージェントの挙動をカスタマイズする際、以下の 3 つの機能を目的別に使い分けます。

- **Logger（ロガー）**: 「何が起きたか」を**観測・記録**するために使用します（非破壊的）。
- **Harness（ハーネス）**: 「何をさせるか / させないか」を**制御・防衛**するために使用します（介入的）。
- **initialTool（初期実行ツール）**: AI が思考を始める前に「何を知っておくべきか」という**前提知識を注入**するために使用します（構造的）。

### 6. APIリファレンス

本セクションでは、Synapse フレームワークを構成する主要な型定義について解説します。

#### LLM アダプター設定
利用する環境に合わせてアダプターを選択し、`Network` に渡します。

##### **GeminiAdapter (Google AI Studio)**
| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :---: | :--- |
| `apiKey` | `string` | ✅ | Google AI Studio で発行した API キー。 |
| `modelName` | `string` | - | 使用するモデル名（default: `gemini-2.5-flash`）。 |
| `maxRetries` | `number` | - | 通信失敗時の最大リトライ回数（default: `3`）。 |

##### **VertexAIAdapter (Google Cloud)**
| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :---: | :--- |
| `projectId` | `string` | ✅ | Google Cloud プロジェクト ID。 |
| `region` | `string` | - | リージョン（default: `us-central1`）。 |
| `modelName` | `string` | - | 使用するモデル名（default: `gemini-2.5-flash`）。 |
| `maxRetries` | `number` | - | 通信失敗時の最大リトライ回数（default: `3`）。 |

#### 共通データ構造
フレームワーク全体で頻繁に使用される基本オブジェクトの構造です。

| 型名 | プロパティ / 構造 | 説明 |
| :--- | :--- | :--- |
| `ToolCall` | `{ name: string, args: Record<string, unknown> }` | 実行すべきツールの名前と引数のセット。 |
| `ToolHistoryEntry` | `{ toolName, args, result, agentName, status, error, evaluation }` | 実行済みのツールの履歴データ。ロガーや次ステップの判定に使用。 |
| `StateItem` | `{ id: string, text: string }` | 記憶（State）内の最小単位。各要素にはユニークな ID が付与されます。 |
| `StateDiff` | `Record<string, StateItem \| StateItem[] \| string \| string[]>` | 記憶を更新する際の差分データ。キーには `facts` などのプロパティ名を指定します。 |

#### エージェント設定 (`AgentConfig`)
エージェントの挙動、モデル、依存関係を定義するインターフェースです。

| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ✅ | ネットワーク内でユニークなエージェント識別名。 |
| `prompt` | `string` | ✅ | システムプロンプト。エージェントの人格、専門性、責務を定義します。 |
| `summary` | `string` | - | サブエージェントとして他から呼ばれる際に、親エージェントが参照する短い概要。 |
| `instruction` | `string` | - | サブエージェントとして呼ばれる際の使用上の注意点。 |
| `modelName` | `string` | - | 使用するモデル名（default: `gemini-2.5-flash`）。 |
| `initialModelName`| `string` | - | **初期計画フェーズのみ**で使用する高性能モデル名。省略時は `modelName` を使用。 |
| `maxSteps` | `number` | - | 1回の実行における最大思考ステップ数（default: `10`）。 |
| `temperature` | `number` | - | 生成時の多様性パラメータ（default: `0.2`）。 |
| `maxTokens` | `number` | - | 1回の推論あたりの最大出力トークン数（default: `8192`）。 |
| `tools` | `string[]` | - | 使用するツールの名前（`name`）のリスト。 |
| `agents` | `string[]` | - | 使用するサブエージェントの名前のリスト。 |
| `knowledge` | `string` | - | プロンプトに埋め込む固定知識（ナレッジテキスト）。 |
| `inputSchema` | `{ args?: ArgDefinition[] }` | - | サブエージェントとして呼び出される際の引数定義。省略時は `message: string` 引数のみとなりますが、指定することでツールと同様に複数の構造化引数を受け取ることが可能になります。 |
| `outputSchema` | `object` | - | 最終回答に強制したい JSON 構造の雛形を指定します。AI はこの構造を模倣して回答します。例: `{ "status": "COMPLETE | PARTIAL", "reason": "..." }` |
| `enableState` | `boolean` | - | 記憶（State）管理を有効にするか（default: `true`）。`false` で軽量エージェント化。 |
| `initialToolName` | `string` | - | 思考開始前に自動実行するツール名。エージェント自身の `tools` に含まれている必要があり、かつそのツールの必須引数が `inputSchema` にすべて定義されていなければなりません。入力された構造化引数を用いて初手として実行されます。 |

**構成例 (AgentConfig):**
```typescript
{
  name: "market_analyst",
  prompt: "あなたは市場分析のエージェントです...",
  modelName: "gemini-2.5-flash",
  // 計画立案時のみ高性能モデルを使用
  initialModelName: "gemini-2.5-pro",
  tools: ["fetch_stock_price", "search_news"],
  agents: ["sentiment_analyzer"],
  // 構造化入力の定義
  inputSchema: {
    args: [
      { name: "symbol", type: "STRING", required: true, desc: "銘柄コード" }
    ]
  },
  // 初手で必ず株価取得を実行
  initialToolName: "fetch_stock_price",
  // 回答形式を強制
  outputSchema: {
    recommendation: "BUY | SELL | HOLD",
    confidence: "number",
    reasoning: "string"
  }
}
```

#### ツール定義 (`ToolDefinition`)
AI が実行できるツール（関数）の仕様を定義します。

| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ✅ | ツール識別名。 |
| `summary` | `string` | ✅ | このツールの概要 |
| `instruction` | `string` | ✅ | エージェントがこのツールを正しく使うための**具体的な手順や注意点**。 |
| `schema` | `{ args?: ArgDefinition[] }` | ✅ | 引数のデータ構造定義。 |
| `evaluation` | `string` | - | ツール実行結果をどのような基準で評価するかを記載します。 |

**構成例 (ToolDefinition):**
```typescript
{
  name: "search_news",
  summary: "最新ニュースを検索します",
  instruction: "特定の銘柄に関連する直近24時間のニュースを検索し、ポジティブ・ネガティブな要因を抽出せよ。",
  schema: {
    args: [
      { name: "query", type: "STRING", required: true, desc: "検索キーワード" },
      { name: "max_results", type: "NUMBER", desc: "取得件数（最大10件）" }
    ]
  },
  evaluation: "記事が1件も見つからない場合は失敗とみなし、キーワードを広げて再試行せよ。"
}
```

#### 引数定義 (`ArgDefinition`)
ツールが受け取る引数の詳細を定義します。

| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ✅ | 引数名。 |
| `type` | `"STRING" \| "NUMBER" \| "BOOLEAN" \| "OBJECT" \| "ARRAY"` | ✅ | 引数の型。 |
| `desc` | `string` | - | 引数の説明。 |
| `required` | `boolean` | - | 必須パラメータかどうか。 |
| `enum` | `string[]` | - | 許容される値のリスト。 |

**構成例 (ArgDefinition):**
```typescript
{
  name: "priority",
  type: "STRING",
  desc: "タスクの優先度",
  required: true,
  enum: ["high", "medium", "low"]
}
```

#### ネットワーク構成 (`NetworkConfig`)
エージェント群を統合し、実行環境を構築するための設定です。

| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :---: | :--- |
| `llm` | `LLMClient` | ✅ | 使用する LLM アダプター（`GeminiAdapter` 等）。 |
| `tools` | `ToolDefinition[]` | ✅ | ネットワーク全体で使用可能なツールの定義リスト。 |
| `agents` | `AgentConfig[]` | ✅ | ネットワークを構成するエージェントの設定リスト。 |
| `onToolCall` | `ToolCallHandler` | ✅ | ツール実行を一括で受けるハンドラ関数。 |
| `stateSchema` | `States` | - | 標準の記憶項目（facts, tasks等）に加えて、独自のプロパティを追加したり、各項目の運用ルールをカスタマイズしたい場合に指定します。 |
| `logger` | `Logger` | - | 実行プロセスを監視するためのロガー。 |
| `harness` | `Harness` | - | 実行プロセスに介入・防衛するためのハーネス。 |
| `preloadGlobalState` | `StateDiff` | - | 初期起動時に共有記憶に注入する事前知識。 |
| `licenseKey` | `string` | - | 有効なライセンスキー（現在ベータ期間中のため省略可能）。 |

**構成例 (NetworkConfig):**
```typescript
// 1. 実際のロジックをマップで定義（関心の分離）
const handlers: Record<string, (args: any, ctx: AgentContext) => Promise<any>> = {
  fetch_stock_price: async (args) => 150.5,
  search_news: async (args) => ["News A", "News B"],
};

// 2. ネットワークの初期化
const network = new Network({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY }),
  tools: [searchTool, fetchPriceTool],
  agents: [orchestratorConfig, analystConfig],
  onToolCall: async (call, ctx) => {
    const handler = handlers[call.name];
    if (handler) return await handler(call.args, ctx);
    throw new Error(`Handler for ${call.name} not found`);
  },
  logger,
  harness,
  licenseKey: "..." 
});

// 3. 正しい運用フロー
await network.verifyLicense(); // ライセンス認証
network.resetStates();         // 状態リセット
const result = await network.get("orchestrator").chat("分析を開始して"); // 実行
```

#### ネットワークメソッド (`Network` クラス)
| メソッド | 引数 | 戻り値 | 説明 |
| :--- | :--- | :--- | :--- |
| `verifyLicense` | なし | `Promise<void>` | ライセンスサーバーと通信し、有効性を確認します。 |
| `get` | `agentName: string` | `Agent` | 指定された名前のエージェントを取得します。 |
| `terminate` | `reason: string` | `void` | 全エージェントの思考を強制終了し、理由を回答させます。 |
| `resetStates` | なし | `void` | 全エージェントの記憶と累積トークン使用量をリセットします。 |
| `getGlobalState` | なし | `GlobalState` | 現在の共有記憶を取得します（永続化用）。 |
| `loadGlobalState` | `state: GlobalState` | `void` | 保存済みの共有記憶を復元します。 |

#### 実行ガードレール (`Harness`)
各実行フェーズに介入するためのインターフェースです。

| メソッド | 引数の構造 | 戻り値 | 説明 |
| :--- | :--- | :--- | :--- |
| `beforePrompt` | `prompt: string`, `ctx: AgentContext` | `string` | 推論直前のプロンプトを加工・検証します。 |
| `beforeTool` | `call: ToolCall`, `ctx: AgentContext` | `ToolCall` | ツール実行直前に引数を検証し、必要なら例外でブロックします。`call` を加工して返すことも可能です。 |
| `afterToolResult` | `res: ToolResult`, `call: ToolCall`, `ctx: AgentContext` | `ToolResult` | ツール実行結果を検閲・加工します。`res.result` を書き換えて AI に渡すデータを制御できます。 |
| `onStateBeforeUpdate`| `diffs: StateDiff`, `ctx: AgentContext` | `StateDiff` | 記憶（State）反映直前に差分を検証・修正します。 |

---

##### 1. ツール呼び出し情報 (`ToolCall`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `name` | `string` | 実行対象のツール名。 |
| `args` | `Record<string, unknown>` | ツールに渡される引数のキー・値ペア。 |

**データ構造例 (ToolCall):**
```json
{
  "name": "get_user_info",
  "args": {
    "userId": "U12345",
    "fields": ["name", "email"]
  }
}
```

##### 2. ツール実行結果 (`ToolResult`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `status` | `"success" \| "failed"` | (任意) 実行の成否。省略時は `error` の有無で自動判定されます。 |
| `result` | `unknown` | 実行結果データ。ハンドラから生データを直接返した場合は、自動的にこのプロパティに格納されます。 |
| `error` | `string` | (任意) 失敗時のエラーメッセージ。 |
| `log` | `Record<string, unknown>` | (任意) 記憶（State）への自動連動データ。キー名が State プロパティ名と一致する場合、自動更新されます。 |

**データ構造例 (ToolResult):**
```json
{
  "result": { "name": "Alice", "email": "alice@example.com" },
  "log": {
    "facts": ["ユーザー Alice (U12345) の情報を取得した"]
  }
}
```

##### 3. 記憶更新差分 (`StateDiff`)
| 構造 | 説明 |
| :--- | :--- |
| `Record<string, StateItem \| StateItem[] \| string \| string[]>` | キーには `facts` 等のプロパティ名を指定。値に文字列を渡すと自動ID付与の `StateItem` として追加されます。 |

**データ構造例 (StateDiff):**
```json
{
  "facts": ["ユーザーの認証が完了した", "セッションを開始した"],
  "vars": "AUTH_TOKEN_789"
}
```

##### 4. 実行コンテキスト (`AgentContext`)
`Harness` の各フックや `onToolCall` に渡される、エージェントの状態参照および操作用オブジェクトです。

| プロパティ / メソッド | 型 / 戻り値 | 説明 |
| :--- | :--- | :--- |
| `agentName` | `string` | 現在実行中のエージェント名。 |
| `currentInput` | `string` | AI に渡された入力プロンプト。 |
| `step` | `number` | 現在の ReAct ループのステップ番号（state_update フェーズは `-1`、初期ツール実行は `0`）。 |
| `state` | `LocalState \| null` | 現在のエージェント個別記憶。 |
| `globalState` | `GlobalState` | 現在のネットワーク共有記憶。 |
| `currentState` | `{ global: GlobalState, local: LocalState }` | 共有および個別記憶をまとめた全量データ。 |
| `updateState(diffs)` | `(diffs: StateDiff) => void` | 記憶（State）を強制的に更新します。 |
| `disableTool(name)` | `(name: string) => void` | 指定したツールをこのセッション中のみ無効化します。 |
| `disableAgent(name)` | `(name: string) => void` | 指定したサブエージェントを無効化します。 |
| `terminate(reason)` | `(reason: string) => void` | 思考ループを即座に停止し、理由を回答として終了します。 |

**Harness 内での操作例:**
```typescript
async beforeTool(call, ctx) {
  // 特定のエージェントかつ特定のステップ数を超えたら強制終了
  if (ctx.agentName === "analyst" && ctx.step > 5) {
    ctx.terminate("分析ステップが上限に達しました。");
  }
  return call;
}
```

---

#### 実行観測 (`Logger`)
各イベント発生時に詳細なコンテキストを受け取ります。

##### 1. エージェント情報 (`AgentMeta`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `agentName` | `string` | 対象のエージェント名。 |
| `parentMeta` | `AgentMeta \| null` | 親エージェントの情報（再帰構造）。ルートの場合は null。 |
| `enableState` | `boolean` | State 管理が有効かどうか。 |

**データ構造例 (AgentMeta):**
```json
{
  "agentName": "specialist_agent",
  "enableState": true,
  "parentMeta": {
    "agentName": "orchestrator",
    "enableState": true,
    "parentMeta": null
  }
}
```

##### 2. トークン使用量 (`TokenUsage`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `promptTokens` | `number` | 入力プロンプトのトークン数。 |
| `completionTokens` | `number` | AI の回答（出力）のトークン数。 |
| `totalTokens` | `number` | この実行の合計トークン数。 |

##### 監視イベント
| メソッド | 引数 (`event`) の型 | 説明 |
| :--- | :--- | :--- |
| `onStart` | `StartEvent` | 実行開始時（`chat()` 呼び出し直後）。 |
| `onInitialState` | `InitialStateEvent` | 初期計画フェーズ完了時。 |
| `onToolCall` | `ToolCallEvent` | ツール実行を要求する直前。 |
| `onToolResult` | `ToolResultEvent` | ツール実行結果が戻った直後。 |
| `onStateUpdate` | `StateUpdateEvent` | 記憶（State）更新処理が完了した直後。 |
| `onFinal` | `FinalEvent` | 最終回答が確定した時。 |
| `onError` | `ErrorEvent` | エラー発生時（例外送出の直前）。 |

---

#### Logger イベント引数の詳細定義
各イベントの第1引数 (`event`) に含まれるデータの構造例です。

##### **`StartEvent`** (開始時)
```json
{
  "message": "プロジェクトAの進捗を報告して",
  "currentState": { "global": { "vars": [...] }, "local": { "goals": [...] } }
}
```

##### **`InitialStateEvent`** (計画完了時)
```json
{
  "disabledTools": ["delete_user"],
  "disabledAgents": [],
  "durationMs": 1250,
  "usage": { "promptTokens": 1200, "completionTokens": 150, "totalTokens": 1350 }
}
```

##### **`ToolCallEvent`** (ツール実行直前)
```json
{
  "name": "search_knowledge",
  "args": { "query": "進捗報告 テンプレート" },
  "durationMs": 850,
  "usage": { "promptTokens": 2500, "completionTokens: 80, "totalTokens: 2580 }
}
```

##### **`ToolResultEvent`** (ツール実行完了時)
```json
{
  "entry": {
    "toolName": "search_knowledge",
    "args": { "query": "..." },
    "result": "...",
    "status": "success",
    "evaluation": "必要なテンプレートが見つかること"
  },
  "durationMs": 500
}
```

##### **`StateUpdateEvent`** (記憶更新完了時)
```json
{
  "diffs": { "facts": ["進捗報告の期限は明日までである"] },
  "success": [{ "scope": "global", "key": "facts", "id": "F_001", "text": "..." }],
  "errors": [],
  "durationMs": 950,
  "usage": { "promptTokens": 3000, "completionTokens: 120, "totalTokens: 3120 }
}
```

##### **`FinalEvent`** (最終回答時)
```json
{
  "finalText": "プロジェクトAの進捗報告は...",
  "toolHistory": [...],
  "durationMs": 850,
  "usage": { "promptTokens": 4500, "completionTokens": 300, "totalTokens": 4800 }
}
```

##### 5. 実行履歴データ (`ToolHistoryEntry`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `toolName` | `string` | 実行されたツール名。 |
| `args` | `Record<string, unknown>` | 実行時の引数。 |
| `result` | `unknown` | 実行結果。 |
| `agentName` | `string` | 実行したエージェント名。 |
| `status` | `"success" \| "failed"` | 成否。 |
| `error` | `string` | (任意) エラー内容。 |
| `evaluation` | `string` | (任意) ツールに定義された評価基準。 |

**データ構造例 (ToolHistoryEntry):**
```json
{
  "toolName": "get_weather",
  "args": { "city": "Tokyo" },
  "result": { "temp": 25, "sky": "clear" },
  "agentName": "weather_bot",
  "status": "success",
  "evaluation": "気温 and 天気が取得できていること"
}
```

##### 6. エージェントメタ情報 (`AgentMeta`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `agentName` | `string` | 対象のエージェント名。 |
| `parentMeta` | `AgentMeta \| null` | 親エージェントの情報（再帰構造）。 |
| `enableState` | `boolean` | State 管理が有効かどうか。 |

**データ構造例 (AgentMeta):**
```json
{
  "agentName": "data_analyst",
  "enableState": true,
  "parentMeta": {
    "agentName": "orchestrator",
    "enableState": true,
    "parentMeta": null
  }
}
```

---

##### 7. State 更新記録 (`StateUpdateRecord`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `scope` | `"global" \| "local"` | 更新対象のスコープ。 |
| `key` | `string` | 更新対象のプロパティ名（`facts` 等）。 |
| `id` | `string` | 付与されたユニーク ID。 |
| `text` | `string` | 記録されたテキスト内容。 |

**データ構造例 (StateUpdateRecord):**
```json
{
  "scope": "global",
  "key": "facts",
  "id": "F_001",
  "text": "本日は晴天である"
}
```

##### 8. State 更新エラー (`StateUpdateError`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `failed` | `unknown` | 更新に失敗した元のデータ。 |
| `message` | `string` | 失敗の理由（「id/text 形式ではない」「存在しない key」等）。 |

**データ構造例 (StateUpdateError):**
```json
{
  "failed": { "invalid_key": "some value" },
  "message": "id/text 形式ではありません"
}
```

---

#### 標準記憶スキーマ (`States`)
Synapse がデフォルトで提供する記憶（State）の構造定義です。エージェントはこの定義に従って情報を整理します。

##### 共有記憶 (`Global State`)
ネットワーク内の全エージェントで共有される情報です。

| プロパティ | 説明 |
| :--- | :--- |
| `vars` | 不変値（URL、ID、SQL、外部キー等）を保持。推測値は含めない。 |
| `facts` | 検証により確定した共有事実。主語を明示し、単体で意味が通る完結文で記録。 |
| `evidences` | 仮説（hypotheses）を支える根拠情報。事実導出のナレッジとして扱う。 |
| `actions` | 実行した調査・確認の要点。重複調査を防ぎ、何を確認したかを記録。 |
| `openQuestions` | 未解決の論点や追加調査が必要な事項。後続への探索継続テーマ。 |
| `decisions` | 採用・棄却の判断履歴。どの情報を根拠に何を決めたかを記録。 |
| `AgentAnswers` | 各エージェントが生成した回答の一次保管場所（検証前）。 |

##### 個別記憶 (`Local State`)
各エージェントが個別に保持する、そのタスク専用の思考領域です。

| プロパティ | 説明 |
| :--- | :--- |
| `goals` | 最終目的および達成目標。依頼が複数ある場合は論点ごとに保持。 |
| `tasks` | 目標達成のための作業単位（実行判断単位）。AIが自律的に構築・更新。 |
| `notes` | 補助的情報。ツール実行の空振りや失敗など、判断に影響するコンテキスト。 |
| `roles` | どの論点をどのエージェントが担当するか、境界と委譲方針の整理。 |
| `hypotheses` | 検証が必要な未確定の仮説や前提。事実（facts）と明確に分離して保持。 |

**データ蓄積例 (States):**
```json
{
  "facts": [
    { "id": "F_001", "text": "ユーザー U12345 の権限は 'admin' である。" },
    { "id": "F_002", "text": "現在のシステム負荷は 20% 以下である。" }
  ],
  "tasks": [
    { "id": "T_001", "text": "【完了】: ユーザー権限の確認" },
    { "id": "T_002", "text": "【次に実行】: システムリソースの割り当て" }
  ]
}
```

##### 記憶構造の拡張 (Custom States)
デフォルトの `States` を継承することで、独自の記憶プロパティを追加したり、運用ルール（記載方針）をカスタマイズすることが可能です。

```typescript
import { States } from "@synapse-agent/framework";

class MyProjectStates extends States {
  constructor() {
    super();
    // 共有記憶（Global）に新しいプロパティを追加
    this.stateProperties.global.project_context = {
      description: "プロジェクト固有の背景情報や制約事項を保持する領域。",
      howTo: "プロジェクトの目的、主なステークホルダー、および遵守すべき制約を箇条書きで記録してください。"
    };
    // 個別記憶（Local）に新しいプロパティを追加
    this.stateProperties.local.user_preferences = {
      description: "ユーザーの好みや個別設定を保持する領域。",
      howTo: "ツール実行結果から得られたユーザーの嗜好を簡潔に記録してください。"
    };
  }
}

// Network 初期化時に渡す
const network = new Network({
  stateSchema: new MyProjectStates(),
  // ...
});
```



#### その他重要な型定義
##### `agent.chat()` の戻り値 (`ChatResult`)
| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `finalText` | `string` | AI が最終的に生成した回答テキスト。 |
| `states` | `{ global, local }` | 実行終了時点のすべての記憶（共有および個別）。 |

**データ構造例 (ChatResult):**
```json
{
  "finalText": "調査結果を報告します...",
  "states": {
    "global": { "facts": [...], "vars": [...] },
    "local": { "goals": [...], "tasks": [...] }
  }
}
```

##### ツール実行の戻り値 (`ToolResult`)
`onToolCall` ハンドラがフレームワークに返却すべきデータ構造です。

| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `status` | `string` | (任意) 実行の成否。省略時は成功（`success`）とみなされます。 |
| `result` | `any` | 実行結果。AI への回答として渡されるデータ。 |
| `error` | `string` | (任意) 失敗時のエラーメッセージ。 |
| `log` | `Record<string, string \| string[]>` | (任意) 記憶（State）への自動連動データ。 |

> [!TIP]
> **エラーの通知方法**
> 処理に失敗した場合は、独自の `ToolResult` を返さず、単に **`throw new Error("理由")`** を行ってください。フレームワークが自動的にキャッチし、AI に対して「失敗（`failed`）」とその理由を適切にフィードバックします。

> [!CAUTION]
> **戻り値のデータ構造と階層**
> ツールの戻り値（`result`）は、フレームワーク内部で自動的に `JSON.stringify` され、AI に対して `result` プロパティの値として提示されます。そのため、ユーザー側で手動で文字列に変換（シリアライズ）する必要はありません。
> ただし、**オブジェクトの階層が極端に深い**場合、文字列表現の限界により一部が `[object]` と表示されたり、AI が構造を正しく解釈できなくなったりする恐れがあります。AI に見せる結果データは、可能な限りフラットで分かりやすい構造に留めることを推奨します。

### 7. 実装方法：サンプルコード（最大構成）

階層型マルチエージェント（Front/Orchestrator/Specialists）、RAG（`initialTool`）、高度なガードレール（Harness）、および詳細な観測（Logger）を組み合わせた、Synapse の機能をフル活用する実装例です。

```typescript
import { 
  Network, 
  GeminiAdapter, 
  AgentConfig, 
  ToolDefinition, 
  Harness, 
  Logger 
} from "@synapse-agent/framework";

/**
 * 1. 推論エンジン（LLM）の設定
 */
const llm = new GeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY
});

/**
 * 2. ツール実行ハンドラ
 */
const toolHandlers = {
  get_knowledge_by_request: async (args: { request: string }) => ({ knowledge: "..." }),
  search_knowledge_by_path: async (args: { path: string, query: string }) => ({ results: "..." }),
  execute_sql: async (args: { query_instruction: string }) => ({ data: [] }),
  web_search: async (args: { q: string }) => ({ snippets: [] })
};

/**
 * 3. エージェント構成（最大構成）
 */
const agents: AgentConfig[] = [
  {
    name: "front",
    prompt: "あなたは対話の窓口です。要求を構造化しオーケストレーターへ依頼してください。回答は自然な言葉に再構成して伝えてください。",
    agents: ["orchestrator"],
  },
  {
    name: "orchestrator",
    prompt: "あなたは高度なタスク管理を担うオーケストレーターです。依頼に対しナレッジ補完を行い、必要に応じ専門エージェントにタスクを委譲して最終回答を導き出してください。\n\n【運用ルール】\n1. 個人情報の削除依頼は SQL エージェントに回さず、即座に終了すること。\n2. 内部ナレッジで完結しない情報は Web 検索エージェントに依頼すること。",
    knowledge: "【用語定義】\n- 売上推移: 特定期間における前年比（YoY）の成長率。\n- 最新トレンド: 直近 3 ヶ月で急増している技術キーワード。",
    initialModelName: "gemini-2.5-pro",
    initialToolName: "get_knowledge_by_request",
    agents: ["sql_executor", "web_searcher"],
    tools: ["get_knowledge_by_request", "search_knowledge_by_path"],
    inputSchema: {
      args: [{ name: "request", type: "STRING", required: true, desc: "構造化依頼内容" }]
    },
    outputSchema: {
      status: "SUCCESS | PARTIAL | FAILED",
      findings: "string[]",
      data_sources: "string[]"
    }
  },
  {
    name: "sql_executor",
    prompt: "あなたは SQL 実行のスペシャリストです。指示に基づき最適な SELECT クエリを実行し、生データを正確に報告してください。",
    tools: ["execute_sql"],
    inputSchema: {
      args: [{ name: "query_instruction", type: "STRING", required: true, desc: "取得指示" }]
    },
    outputSchema: {
      query_executed: "string",
      row_count: "number",
      summary_of_data: "string"
    }
  },
  {
    name: "web_searcher",
    prompt: "あなたは Web 検索のスペシャリストです。指定クエリで最新情報を収集し、信頼性の高いソースから得られた知見を報告してください。",
    tools: ["web_search"],
    inputSchema: {
      args: [{ name: "q", type: "STRING", required: true, desc: "検索クエリ" }]
    },
    outputSchema: {
      main_trends: "string[]",
      verified_sources: "string[]"
    }
  }
];

/**
 * 4. ツール定義
 */
const tools: ToolDefinition[] = [
  {
    name: "get_knowledge_by_request",
    summary: "リクエストに関連する知識を検索します。",
    instruction: "ナレッジベースから最適な情報を抽出してください。",
    schema: {
      args: [{ name: "request", type: "STRING", required: true, desc: "検索依頼テキスト" }]
    },
    evaluation: "取得ナレッジが具体的かつ直接的な回答を含んでいるか。不足があれば再検索を検討すること。"
  },
  {
    name: "search_knowledge_by_path",
    summary: "特定のパスを指定してナレッジを検索します。",
    instruction: "指定パス以下のドキュメントから情報を検索してください。",
    schema: {
      args: [
        { name: "path", type: "STRING", required: true, desc: "ディレクトリパス" },
        { name: "query", type: "STRING", required: true, desc: "検索クエリ" }
      ]
    },
    evaluation: "断片がクエリに合致しているか。不十分なら条件を調整して再試行すること。"
  },
  {
    name: "execute_sql",
    summary: "SQL を実行してデータを取得します。",
    instruction: "指示を解釈し、適切な SELECT 文を生成・実行してください。",
    schema: {
      args: [{ name: "query_instruction", type: "STRING", required: true, desc: "データ取得指示" }]
    },
    evaluation: "SELECT 文が指示を反映しているか。データが分析に十分か。不十分ならクエリを修正して再実行すること。"
  },
  {
    name: "web_search",
    summary: "Web 検索を実行します。",
    instruction: "外部エンジンを用いて Web 検索を実行してください。",
    schema: {
      args: [{ name: "q", type: "STRING", required: true, desc: "検索キーワード" }]
    },
    evaluation: "最新動向をカバーできているか。情報の鮮度が低い場合は、ワードを絞り込んで再検索すること。"
  }
];

/**
 * 5. 実行制御（ハーネス）
 */
const harness: Harness = {
  beforeTool: async (call) => {
    if (call.name === "execute_sql" && !call.args.query_instruction.startsWith("SELECT")) {
      throw new Error("参照クエリ以外の実行は許可されていません。");
    }
    return call;
  }
};

/**
 * 6. 観測（ロガー）
 */
const logger: Logger = {
  onToolCall: (ev, meta) => console.log(`[${meta.agentName}] calling tool: ${ev.name}`),
  onError: (err) => console.error(`[Error] ${err.message}`)
};

/**
 * 7. ネットワークの初期化と運用
 */
const network = new Network({
  llm,
  agents,
  tools,
  harness,
  logger,
  onToolCall: async (call, ctx) => {
    const handler = toolHandlers[call.name as keyof typeof toolHandlers];
    if (!handler) throw new Error(`Handler for ${call.name} not found`);
    return await handler(call.args as any);
  },
  licenseKey: process.env.SYNAPSE_LICENSE_KEY // ベータ期間中のため省略可能
});

// アプリ起動時に一度だけライセンス認証を実行
await network.verifyLicense();

// 新しいセッションを開始する前に記憶をリセット
network.resetStates();

// 前回のセッション状態があれば復元（永続化の例）
const savedState = await database.loadState(userId);
if (savedState) {
  network.loadGlobalState(savedState);
}

// 実行（開始エージェント 'front' を取得して実行）
const result = await network.get("front").chat(
  "昨年度の売上推移と、業界の最新トレンドを比較して報告して"
);

console.log("Final Report:", result.finalText);

// 完了後の共有記憶（Global State）を保存（永続化の例）
const sessionData = network.getGlobalState();
await database.saveState(userId, sessionData);
```
