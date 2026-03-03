@echo off
REM PostgreSQL Setup Script for Windows
REM This script helps set up the database and create the devices_db

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo PostgreSQL Database Setup
echo ============================================================
echo.

REM Check if psql is available
where psql >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: PostgreSQL not found!
    echo.
    echo Please install PostgreSQL first:
    echo  1. Download from: https://www.postgresql.org/download/windows/
    echo  2. During installation, set postgres password to: bisumain
    echo  3. Run this script again
    echo.
    pause
    exit /b 1
)

echo [OK] PostgreSQL is installed
echo.

REM Try to create the database
echo Creating database 'devices_db'...
psql -U postgres -h localhost -c "CREATE DATABASE devices_db;" 2>nul

if %errorlevel% equ 0 (
    echo [OK] Database 'devices_db' created (or already exists)
) else (
    echo [ERROR] Could not create database
    echo.
    echo Possible solutions:
    echo  1. Check PostgreSQL service is running
    echo  2. Verify password is 'bisumain'
    echo  3. Check port 5432 is not blocked
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo [OK] PostgreSQL setup complete!
echo ============================================================
echo.
echo Next steps:
echo  1. cd backend
echo  2. python migrate_database.py
echo  3. uvicorn main:app --reload
echo.
pause
