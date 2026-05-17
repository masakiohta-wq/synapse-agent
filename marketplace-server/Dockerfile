# 1. ビルド用ステージ
FROM node:20-slim AS builder

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm install

# ソースコードのコピーとビルド
COPY . .
RUN npm run build

# 2. 実行用ステージ
FROM node:20-slim

WORKDIR /app

# 実行に必要なファイルだけをコピー
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

# ポートの指定（Cloud Runはデフォルトで8080を使用）
EXPOSE 8080

# サーバー起動
CMD ["npm", "start"]
