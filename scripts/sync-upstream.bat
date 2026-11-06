@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem  同步上游 lyswhut/lx-music-mobile 的新版本到本地定制版
rem  upstream 远程已在仓库中配置好，无需重复添加
rem ============================================================

set "ROOT=D:\ProgramData\workbuddy\2026-10-19-12-14-06"
set "PROJECT=%ROOT%\lx-music-mobile"
cd /d "%PROJECT%" || (echo [错误] 项目目录不存在 & exit /b 1)

echo === 1/3 拉取上游 tag 与提交 ===
git fetch upstream --tags --prune
if errorlevel 1 (echo [错误] 拉取失败，检查网络或代理 & exit /b 1)

echo.
echo === 2/3 上游新增提交（当前分支尚未包含） ===
git log --oneline --no-decorate HEAD..upstream/master
echo.
echo 最近 5 个上游 tag：
powershell -NoProfile -Command "git tag --sort=-creatordate | Where-Object { $_ -like 'v*' } | Select-Object -First 5 | ForEach-Object { '    ' + $_ }"

echo.
set /p TAG=输入要合并的上游版本号（如 v1.9.3；直接回车=upstream/master）:
if "%TAG%"=="" set "TAG=upstream/master"

echo.
echo === 3/3 合并 %TAG% ===
git merge %TAG% --no-edit
if errorlevel 1 (
  echo.
  echo [注意] 出现冲突。处理方式：
  echo   1^) 编辑冲突文件，保留定制功能同时接受上游修复
  echo   2^) git add 冲突文件
  echo   3^) git commit
  echo   4^) 再运行 scripts\build-release.bat
  exit /b 1
)

echo.
echo [完成] 已合并 %TAG%
echo 下一步：
echo   1^) 修改 package.json：version 递增、versionCode 加 1
echo   2^) 更新 publish\version.json 与 CHANGELOG.md
echo   3^) 运行 scripts\build-release.bat 出包
echo   4^) git push，并创建 tag v新版本号、上传 APK
exit /b 0
