@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Đang khởi động máy chủ xem bài index.html...
node edit-server.js
pause
