@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Đang khởi động máy chủ ở chế độ sửa bài...
node edit-server.js --edit
pause
