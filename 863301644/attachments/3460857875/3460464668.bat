@echo off
setlocal

set NAMESPACE= magic-xpi-imm-ns

echo Fetching IMM DB credentials...
for /f "delims=" %%u in ('kubectl get secret imm-db-secret -n %NAMESPACE% -o jsonpath^="{.data.username}"') do set IMMDB_USER_B64=%%u
for /f "delims=" %%p in ('kubectl get secret imm-db-secret -n %NAMESPACE% -o jsonpath^="{.data.password}"') do set IMMDB_PASS_B64=%%p

for /f "delims=" %%d in ('powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%%IMMDB_USER_B64%%'))"') do set IMMDB_USER=%%d
for /f "delims=" %%d in ('powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%%IMMDB_PASS_B64%%'))"') do set IMMDB_PASS=%%d

echo IMM DB Username: %IMMDB_USER%
echo IMM DB Password: %IMMDB_PASS%
echo.

echo Fetching LOG DB credentials...
for /f "delims=" %%u in ('kubectl get secret log-db-secret -n %NAMESPACE% -o jsonpath^="{.data.username}"') do set LOGDB_USER_B64=%%u
for /f "delims=" %%p in ('kubectl get secret log-db-secret -n %NAMESPACE% -o jsonpath^="{.data.password}"') do set LOGDB_PASS_B64=%%p

for /f "delims=" %%d in ('powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%%LOGDB_USER_B64%%'))"') do set LOGDB_USER=%%d
for /f "delims=" %%d in ('powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%%LOGDB_PASS_B64%%'))"') do set LOGDB_PASS=%%d

echo LOG DB Username: %LOGDB_USER%
echo LOG DB Password: %LOGDB_PASS%

endlocal
pause
 