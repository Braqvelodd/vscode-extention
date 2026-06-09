@echo off
SETLOCAL EnableDelayedExpansion

:: Change directory to the folder containing this script
cd /d "%~dp0"

echo ====================================================
echo  JCL Library Manager Extension Build Script
echo ====================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ to compile this extension.
    goto :error
)

:: Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    echo Please install npm, which is included with Node.js, to compile this extension.
    goto :error
)

:: Install dependencies if node_modules folder is missing
if not exist "node_modules\" (
    echo [INFO] node_modules folder not found. Installing dependencies...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed.
        goto :error
    )
)

echo.
echo [INFO] Compiling TypeScript source files...
call npm run compile
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Compilation failed.
    goto :error
)
echo [SUCCESS] Compilation completed successfully.

echo.
echo [INFO] Packaging extension to .vsix...
call npm run package
if %ERRORLEVEL% neq 0 (
    echo [WARNING] 'npm run package' failed. Trying 'npx @vscode/vsce package'...
    call npx @vscode/vsce package
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Packaging failed.
        goto :error
    )
)

echo.
echo ====================================================
echo [SUCCESS] Build and package completed successfully!
echo The .vsix package has been created in the root folder.
echo ====================================================
goto :end

:error
echo.
echo [ERROR] Build failed. Please check the logs above.
exit /b 1

:end
echo.
pause
