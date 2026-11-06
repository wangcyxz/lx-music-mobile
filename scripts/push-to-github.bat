@echo off
setlocal

rem ============================================================
rem  Push the local fork to GitHub (account: wangcyxz)
rem  - creates nothing on GitHub: create https://github.com/new
rem    with name lx-music-mobile first (public, no README)
rem  - Git Credential Manager will pop a browser login window
rem ============================================================

set "ROOT=D:\ProgramData\workbuddy\LXmusic-MG"
if not exist "%ROOT%\" (echo [ERROR] workspace not found: %ROOT% & exit /b 1)

cd /d "%ROOT%\lx-music-mobile" || exit /b 1

echo === current remote ===
git remote -v
echo.

git remote set-url origin https://github.com/wangcyxz/lx-music-mobile.git 2>nul || git remote add origin https://github.com/wangcyxz/lx-music-mobile.git

echo === pushing main + tags ===
git push -u origin main --tags
if errorlevel 1 (
  echo.
  echo [FAILED] push rejected. common causes:
  echo   1. repository does not exist yet  -^> create it at https://github.com/new
  echo   2. not signed in                  -^> the credential window must be confirmed
  echo   3. remote already has commits     -^> run: git push -u origin main --tags --force
  exit /b 1
)

echo.
echo [DONE] https://github.com/wangcyxz/lx-music-mobile
echo next: create a Release with tag v1.9.2 and upload
echo       release\lx-music-mobile-v1.9.2-arm64-v8a.apk
