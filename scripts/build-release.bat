@echo off
setlocal

rem ============================================================
rem  Build signed arm64-v8a release APK
rem  Usage: double-click, or: build-release.bat --dry
rem ============================================================

set "ROOT=D:\ProgramData\workbuddy\2026-10-19-12-14-06"
set "PROJECT=%ROOT%\lx-music-mobile"
set "JAVA_HOME=%ROOT%\.tools\jdk17\jdk-17.0.20.1+1"
set "ANDROID_HOME=%ROOT%\.tools\sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [ERROR] JDK17 not found: %JAVA_HOME%
  goto :fail
)
if not exist "%ANDROID_HOME%\platforms\android-36\android.jar" (
  echo [ERROR] Android SDK platform 36 not found: %ANDROID_HOME%
  goto :fail
)
if not exist "%PROJECT%\android\app\lxmusic.keystore" (
  echo [ERROR] Signing key missing: %PROJECT%\android\app\lxmusic.keystore
  echo         Restore it from D:\ProgramData\workbuddy\lx-music-signing\
  goto :fail
)

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -Raw '%PROJECT%\package.json' | ConvertFrom-Json).version"`) do set "VER=%%v"
for /f "usebackq delims=" %%c in (`powershell -NoProfile -Command "(Get-Content -Raw '%PROJECT%\package.json' | ConvertFrom-Json).versionCode"`) do set "VCODE=%%c"

if not defined VER (
  echo [ERROR] Failed to read version from package.json
  goto :fail
)

echo ============================================================
echo   version %VER%   versionCode %VCODE%   abi arm64-v8a
echo   final versionCode = %VCODE% * 1000 + 3
echo ============================================================

if /i "%~1"=="--dry" (
  echo [dry] environment OK, build skipped
  exit /b 0
)

cd /d "%PROJECT%\android"
call gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
if errorlevel 1 (
  echo [FAILED] Gradle build failed, see log above
  goto :fail
)

set "APK=%PROJECT%\android\app\build\outputs\apk\release\lx-music-mobile-v%VER%-arm64-v8a.apk"
if not exist "%APK%" (
  echo [FAILED] APK not found: %APK%
  goto :fail
)

if not exist "%ROOT%\release" mkdir "%ROOT%\release"
copy /y "%APK%" "%ROOT%\release\" >nul

echo.
echo [DONE] %ROOT%\release\lx-music-mobile-v%VER%-arm64-v8a.apk
echo.
echo For GitHub Release: tag = v%VER%, upload that same file name
echo so the in-app update checker can download it.
exit /b 0

:fail
exit /b 1
