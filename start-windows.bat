@echo off
title AgriConnect Server
cd /d "%~dp0backend"

if not exist node_modules (
  echo Installing dependencies for the first time, please wait...
  call npm install
)

start "" http://localhost:4000/login.html
echo Starting AgriConnect... keep this window open while you use the app.
echo Closing this window will stop the server.
node server.js
pause
