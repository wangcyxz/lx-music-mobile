@echo off
setlocal enabledelayedexpansion

rem ============================================================
rem  Push the local fork to GitHub (account: wangcyxz)
rem  repo: https://github.com/wangcyxz/lx-music-mobile
rem
rem  first run: Git Credential Manager pops a browser window,
rem  sign in as wangcyxz once and the token is stored for good.
rem ============================================================

set "ROOT=D:\ProgramData\workbuddy\LXmusic-MG"
if not exist "%ROOT%\" (echo [ERROR] workspace not found: %ROOT% & exit /b 1)

cd /d "%ROOT%\lx-music-mobile" || exit /b 1

set "BRANCH=master"
for %%v in (package.json) do for /f "delims=" %%i in ('node -p "require('./package.json').version"') do set "VER=%%i"

echo === current remote ===
git remote -v
echo.

git remote set-url origin https://github.com/wangcyxz/lx-music-mobile.git 2>nul || git remote add origin https://github.com/wangcyxz/lx-music-mobile.git

echo === pushing %BRANCH% ===
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo [FAILED] push rejected. checklist:
  echo   1. repository exists?           https://github.com/wangcyxz/lx-music-mobile
  echo   2. signed in?                   look for a Git Credential Manager window
  echo   3. "did not receive expected object" / shallow clone:
  echo      git fetch --unshallow upstream master
  exit /b 1
)

echo === pushing tag v%VER% ===
git push origin v%VER%
if errorlevel 1 echo [WARN] tag push failed - create the tag first: git tag v%VER%

echo.
echo [DONE] https://github.com/wangcyxz/lx-music-mobile
echo next: scripts\create-release.ps1  (uploads the APK to a GitHub Release)
