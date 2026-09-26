@echo off
rem Arrastra un archivo .csv sobre este .bat y deja el .kmz junto al CSV.
rem Requiere Python 3 instalado (https://www.python.org/downloads/ o "winget install Python.Python.3.12").
chcp 65001 >nul
if "%~1"=="" (
  echo Arrastra un archivo .csv sobre este archivo para generar el KMZ.
  pause
  exit /b 1
)
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% "%~dp0generar_kmz.py" "%~1" "%~dpn1.kmz" --nombre "%~n1" --vertices
echo.
pause
