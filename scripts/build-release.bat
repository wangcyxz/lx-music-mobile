@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem  一键打包 arm64-v8a 正式版 APK（使用固定签名密钥）
rem  用法：双击运行，或在命令行执行 scripts\build-release.bat
rem ============================================================

set "ROOT=D:\ProgramData\workbuddy\2026-10-19-12-14-06"
set "PROJECT=%ROOT%\lx-music-mobile"
set "JAVA_HOME=%ROOT%\.tools\jdk17\jdk-17.0.20.1+1"
set "ANDROID_HOME=%ROOT%\.tools\sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [错误] 找不到 JDK17: %JAVA_HOME%
  goto :fail
)
if not exist "%ANDROID_HOME%\platforms\android-36\android.jar" (
  echo [错误] 找不到 Android SDK platform 36: %ANDROID_HOME%
  goto :fail
)
if not exist "%PROJECT%\android\app\lxmusic.keystore" (
  echo [错误] 签名文件缺失: %PROJECT%\android\app\lxmusic.keystore
  echo        可从 D:\ProgramData\workbuddy\lx-music-signing\ 复制回来
  goto :fail
)

for /f "delims=" %%v in ('node -p "require('%PROJECT:\=/%/package.json').version"') do set "VER=%%v"
for /f "delims=" %%c in ('node -p "require('%PROJECT:\=/%/package.json').versionCode"') do set "VCODE=%%c"
echo ============================================================
echo   版本 %VER%  /  versionCode %VCODE%  /  arm64-v8a
echo ============================================================

cd /d "%PROJECT%\android"
call gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
if errorlevel 1 (
  echo [失败] Gradle 构建失败，请查看上方日志
  goto :fail
)

set "APK=%PROJECT%\android\app\build\outputs\apk\release\lx-music-mobile-v%VER%-arm64-v8a.apk"
if not exist "%APK%" (
  echo [失败] 未找到产物: %APK%
  goto :fail
)

if not exist "%ROOT%\release" mkdir "%ROOT%\release"
copy /y "%APK%" "%ROOT%\release\" >nul

echo.
echo [完成] 产物已复制到： %ROOT%\release\lx-music-mobile-v%VER%-arm64-v8a.apk
echo.
echo 发布到 GitHub Release 时，请创建 tag： v%VER%
echo 并上传同名文件，这样应用内「检查更新」才能自动下载。
exit /b 0

:fail
exit /b 1
