@echo off
cd /d C:\Users\t6e26\inventory-manager-app
start "Inventory Manager" cmd /k npm run dev
timeout /t 3 /nobreak >nul
start http://localhost:5173
