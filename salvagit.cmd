@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0salvagit.ps1" -Message "%*"
