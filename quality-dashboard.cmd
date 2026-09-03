@echo off
setlocal
cd /d "%~dp0"
node tools\openspec-dashboard\serve.mjs
