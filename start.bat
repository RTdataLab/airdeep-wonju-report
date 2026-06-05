@echo off
chcp 65001 >nul
title 원주시설관리공단 리포트 서버
cd /d "%~dp0"

echo ========================================
echo  원주시설관리공단 월간 모니터링 리포트
echo ========================================
echo.

REM Python 설치 확인 (python -^> py 순서로 시도)
set "PYCMD="
where python >nul 2>nul && set "PYCMD=python"
if not defined PYCMD (
  where py >nul 2>nul && set "PYCMD=py"
)

if not defined PYCMD (
  echo [오류] Python이 설치되어 있지 않습니다.
  echo.
  echo  https://www.python.org/downloads/ 에서 Python을 설치한 뒤
  echo  설치 화면에서 "Add Python to PATH" 를 꼭 체크하세요.
  echo.
  pause
  exit /b
)

echo Python 확인 완료. 서버를 시작합니다...
echo.
echo  브라우저가 자동으로 열립니다.
echo  창을 닫으면 서버가 종료됩니다. (이 검은 창은 그대로 두세요)
echo.

REM 2초 뒤 브라우저 열기 (서버가 뜰 시간을 준다)
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8001"

REM 로컬 서버 실행 (포트 8001 - 본사 8000과 겹치지 않게)
%PYCMD% -m http.server 8001

pause
