@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 (
  echo 作業フォルダーを開けませんでした。
  pause
  exit /b 1
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。Node.js をインストールするか、PATH の設定を確認してください。
  pause
  exit /b 1
)
if not exist "opening-editor-server.cjs" (
  echo 起動に必要なファイルが見つかりません。この起動ファイルを Rookori の作業フォルダーで開いてください。
  pause
  exit /b 1
)
node opening-editor-server.cjs --open
if errorlevel 1 pause
