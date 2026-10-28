@echo off
rem Runs the program server. Started hidden by gizli-baslat.vbs; can also be run directly to see messages.
cd /d "%~dp0.."
set PORT=3000
set HOST=127.0.0.1
set TRUST_PROXY=1
set BACKUP_DIR=%~dp0..\yedekler
node --disable-warning=ExperimentalWarning src\server.js
