import * as esbuild from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

async function build() {
  console.log("1. tsc で型定義ファイル(.d.ts)とJSファイルを生成しています...");
  // typescriptのビルド（型定義ファイルを出力するため）
  execSync("node node_modules/typescript/bin/tsc", { stdio: "inherit" });

  console.log("2. src/index.ts を1つの難読化用JSファイルにバンドルしています...");
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: "dist/index.js", // tscが出力したindex.jsを上書き
    format: "esm",
    // Node組み込みモジュールや外部ライブラリはバンドルから除外
    external: ["google-auth-library"],
  });

  console.log("3. バンドルされたJSファイルを javascript-obfuscator で難読化しています...");
  const codePath = "dist/index.js";
  const code = fs.readFileSync(codePath, "utf8");
  
  // ライブラリとしてエクスポートされるクラス名などが破壊されないように設定
  const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,       // 処理フローを平坦化
    controlFlowFlatteningThreshold: 1, 
    deadCodeInjection: true,           // ダミーコードを注入
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,                 // 文字列を暗号化して配列化
    stringArrayEncoding: ["base64"],   
    stringArrayThreshold: 1,
    renameGlobals: false,              // エクスポートが壊れるのを防ぐ
  });

  fs.writeFileSync(codePath, obfuscationResult.getObfuscatedCode());

  console.log("完了しました！ dist/ フォルダをNPMにパブリッシュする準備が整いました。");
}

build().catch(console.error);
