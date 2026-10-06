@echo off
setlocal EnableDelayedExpansion
title Magic Knowledge Center - Merge Dev-Abhishek into main
echo ======================================================================
echo    MAGIC KNOWLEDGE CENTER - MERGE 'Dev-Abhishek' INTO 'main'
echo ======================================================================
echo.
echo  This merges what is on GitHub's 'Dev-Abhishek' into GitHub's 'main'.
echo  It works in a temporary folder: this folder (the running portal) is
echo  never switched to 'main', and nothing is force-pushed.
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."
set "REPO_DIR=%CD%"
set "DEV_BRANCH=Dev-Abhishek"
set "MAIN_BRANCH=main"

set "GIT_CMD="
if exist "%SCRIPT_DIR%portable_git\cmd\git.exe" (
    set "GIT_CMD=%SCRIPT_DIR%portable_git\cmd\git.exe"
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
) else if exist "C:\Program Files\Git\bin\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\bin\git.exe"
) else if exist "%LocalAppData%\Programs\Git\cmd\git.exe" (
    set "GIT_CMD=%LocalAppData%\Programs\Git\cmd\git.exe"
) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files (x86)\Git\cmd\git.exe"
) else (
    where git >nul 2>&1
    if !ERRORLEVEL! EQU 0 set "GIT_CMD=git"
)

if "%GIT_CMD%"=="" (
    echo [ERROR] Git was not found on this computer.
    pause
    exit /b 1
)

:: This folder may be owned by another Windows account (service / admin install).
:: (quoted: "call" would otherwise split the value at "=")
set "SAFE=-c "safe.directory=%REPO_DIR:\=/%""
set "WORK="

:: ---------------------------------------------------------------------
:: [1/6] Local branch must be committed and already pushed to GitHub
:: ---------------------------------------------------------------------
echo [1/6] Checking that '%DEV_BRANCH%' is committed and pushed...
set "CHANGES=0"
for /f %%C in ('call "%GIT_CMD%" %SAFE% status --porcelain ^| find /c /v ""') do set "CHANGES=%%C"
if not "!CHANGES!"=="0" (
    echo.
    echo [STOP] There are !CHANGES! uncommitted change^(s^) in this folder.
    echo        Run 2_commit.bat and 3_push.bat first, then run this again.
    goto :fail
)

set "REMOTE_URL="
for /f "delims=" %%U in ('call "%GIT_CMD%" %SAFE% remote get-url origin') do set "REMOTE_URL=%%U"
set "LOCAL_DEV="
for /f "delims=" %%S in ('call "%GIT_CMD%" %SAFE% rev-parse --verify -q %DEV_BRANCH%') do set "LOCAL_DEV=%%S"
set "REMOTE_DEV="
for /f "tokens=1" %%S in ('call "%GIT_CMD%" %SAFE% ls-remote origin refs/heads/%DEV_BRANCH%') do set "REMOTE_DEV=%%S"

if "!REMOTE_DEV!"=="" (
    echo [ERROR] Could not read '%DEV_BRANCH%' from GitHub. Check your network / sign-in.
    goto :fail
)
if /i not "!LOCAL_DEV!"=="!REMOTE_DEV!" (
    echo.
    echo [STOP] Your local '%DEV_BRANCH%' differs from the one on GitHub.
    echo        Local : !LOCAL_DEV!
    echo        GitHub: !REMOTE_DEV!
    echo        Run 3_push.bat ^(or 4_pull_updates.bat^) first, then run this again.
    goto :fail
)
echo       OK - '%DEV_BRANCH%' is at !REMOTE_DEV:~0,7! on GitHub.
echo.

:: ---------------------------------------------------------------------
:: [2/6] Temporary blob-less clone of main (commits + file lists only)
:: ---------------------------------------------------------------------
echo [2/6] Downloading '%MAIN_BRANCH%' history into a temporary folder...
set "WORK=%TEMP%\kc_merge_%RANDOM%%RANDOM%"
"%GIT_CMD%" clone --quiet --filter=blob:none --no-checkout --single-branch -b %MAIN_BRANCH% "%REMOTE_URL%" "%WORK%"
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] Could not download '%MAIN_BRANCH%' from GitHub.
    goto :fail
)
set "G="%GIT_CMD%" -C "%WORK%""
!G! fetch --quiet origin %DEV_BRANCH%:refs/heads/dev
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] Could not download '%DEV_BRANCH%' from GitHub.
    goto :fail
)
echo.

:: ---------------------------------------------------------------------
:: [3/6] Work out how to merge
:: ---------------------------------------------------------------------
echo [3/6] Comparing '%DEV_BRANCH%' with '%MAIN_BRANCH%'...
for /f "delims=" %%S in ('call !G! rev-parse main') do set "MAIN_SHA=%%S"
for /f "delims=" %%S in ('call !G! rev-parse dev') do set "DEV_SHA=%%S"

!G! merge-base --is-ancestor dev main >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo.
    echo [INFO] '%MAIN_BRANCH%' already contains everything from '%DEV_BRANCH%'. Nothing to do.
    goto :done
)

!G! merge-base --is-ancestor main dev >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo       '%MAIN_BRANCH%' has nothing new: a simple fast-forward is enough.
    set "NEW_SHA=!DEV_SHA!"
    goto :review
)

!G! merge-base main dev >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo       Both branches have new commits: creating a normal merge...
    !G! -c merge.conflictstyle=merge merge-tree --write-tree --name-only main dev > "%WORK%\merge-result.txt" 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo [STOP] '%DEV_BRANCH%' and '%MAIN_BRANCH%' changed the same lines in these files:
        more +1 "%WORK%\merge-result.txt"
        echo.
        echo        Nothing was pushed. Resolve this with a pull request on GitHub,
        echo        or ask a developer to merge these files by hand.
        goto :fail
    )
    set /p TREE_SHA=<"%WORK%\merge-result.txt"
    goto :commit
)

:: No shared history ^(Dev-Abhishek was restarted from a snapshot^): take every
:: file from Dev-Abhishek and keep files that only main tracks. Nothing is deleted.
echo       The branches share no history: applying every '%DEV_BRANCH%' file onto
echo       '%MAIN_BRANCH%' and keeping the files only '%MAIN_BRANCH%' has.
set "GIT_INDEX_FILE=%WORK%\merge-index"
!G! read-tree main
!G! ls-tree -r -z dev > "%WORK%\dev-files.bin"
!G! update-index -z --index-info < "%WORK%\dev-files.bin"
!G! write-tree --missing-ok > "%WORK%\tree.txt"
set "WRITE_ERR=!ERRORLEVEL!"
set "GIT_INDEX_FILE="
if not "!WRITE_ERR!"=="0" (
    echo [ERROR] Could not build the merged file list.
    goto :fail
)
set /p TREE_SHA=<"%WORK%\tree.txt"

:commit
!G! commit-tree !TREE_SHA! -p main -p dev -m "Merge %DEV_BRANCH% into %MAIN_BRANCH%" > "%WORK%\commit.txt"
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] Could not create the merge commit.
    goto :fail
)
set /p NEW_SHA=<"%WORK%\commit.txt"

:: ---------------------------------------------------------------------
:: [4/6] Show what will change on main
:: ---------------------------------------------------------------------
:review
echo.
echo [4/6] Changes that will reach '%MAIN_BRANCH%'  ^(A=added  M=modified  D=deleted^):
echo ----------------------------------------------------------------------
!G! -c core.quotepath=off diff --no-renames --name-status main !NEW_SHA!
echo ----------------------------------------------------------------------
set "DELETED=0"
for /f %%C in ('call !G! diff --no-renames --name-only --diff-filter=D main !NEW_SHA! ^| find /c /v ""') do set "DELETED=%%C"
if not "!DELETED!"=="0" echo [WARNING] !DELETED! file^(s^) will be DELETED from '%MAIN_BRANCH%'. Check the list above.
echo.

:: ---------------------------------------------------------------------
:: [5/6] Confirm and push (never --force)
:: ---------------------------------------------------------------------
set "CONFIRM="
set /p CONFIRM="[5/6] Push this to '%MAIN_BRANCH%' on GitHub? (Y/N): "
if /i not "!CONFIRM!"=="Y" (
    echo.
    echo [CANCELLED] Nothing was pushed.
    goto :done
)

echo.
echo Pushing to '%MAIN_BRANCH%'...
!G! push origin !NEW_SHA!:refs/heads/%MAIN_BRANCH%
if !ERRORLEVEL! EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] '%DEV_BRANCH%' is merged into '%MAIN_BRANCH%' on GitHub!
    echo           main is now at !NEW_SHA:~0,7!
    echo ======================================================================
    goto :done
)

:: main may be protected (pull requests only) - publish a branch for a PR instead.
for /f "delims=" %%D in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmm"') do set "STAMP=%%D"
set "PR_BRANCH=release/merge-!STAMP!"
echo.
echo [NOTICE] GitHub did not accept a direct push to '%MAIN_BRANCH%'.
echo          Publishing the merge as branch '!PR_BRANCH!' instead...
!G! push origin !NEW_SHA!:refs/heads/!PR_BRANCH!
if !ERRORLEVEL! EQU 0 (
    echo.
    echo ======================================================================
    echo [ACTION NEEDED] Open a pull request on GitHub:
    echo   %REMOTE_URL:.git=%/compare/%MAIN_BRANCH%...!PR_BRANCH!
    echo ======================================================================
    goto :done
)
echo [ERROR] Push failed. Check your GitHub sign-in or permissions.
goto :fail

:: ---------------------------------------------------------------------
:: [6/6] Clean up
:: ---------------------------------------------------------------------
:done
if defined WORK if exist "%WORK%" rmdir /s /q "%WORK%"
echo.
echo [6/6] Temporary files removed.
echo.
pause
exit /b 0

:fail
if defined WORK if exist "%WORK%" rmdir /s /q "%WORK%"
echo.
pause
exit /b 1
