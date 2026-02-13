#!/bin/bash

# Quick Start Script for ESP32 Integration
# This script helps you get started quickly with the ESP32 integration

echo "================================================"
echo "  ESP32 Device Management System - Quick Start"
echo "================================================"
echo ""

# Check if backend directory exists
if [ ! -d "/home/bits/Desktop/Internship/backend" ]; then
    echo "❌ Error: Backend directory not found!"
    exit 1
fi

# Check if frontend directory exists
if [ ! -d "/home/bits/Desktop/Internship/frontend" ]; then
    echo "❌ Error: Frontend directory not found!"
    exit 1
fi

echo "📋 Pre-flight checks..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed!"
    echo "   Install with: sudo apt install python3 python3-pip"
    exit 1
else
    echo "✅ Python3 found: $(python3 --version)"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Install with: sudo apt install nodejs npm"
    exit 1
else
    echo "✅ Node.js found: $(node --version)"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    echo "   Install with: sudo apt install npm"
    exit 1
else
    echo "✅ npm found: $(npm --version)"
fi

echo ""
echo "================================================"
echo "  Step 1: Backend Setup"
echo "================================================"
echo ""

cd /home/bits/Desktop/Internship/backend

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found!"
    exit 1
fi

echo "📦 Installing backend dependencies..."
pip3 install -r requirements.txt --quiet

if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies!"
    echo "   Try: pip3 install -r requirements.txt"
    exit 1
fi

echo "✅ Backend dependencies installed!"
echo ""

echo "================================================"
echo "  Step 2: Frontend Setup"
echo "================================================"
echo ""

cd /home/bits/Desktop/Internship/frontend

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found!"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies (this may take a few minutes)..."
    npm install
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install frontend dependencies!"
        echo "   Try: cd frontend && npm install"
        exit 1
    fi
    
    echo "✅ Frontend dependencies installed!"
else
    echo "✅ Frontend dependencies already installed!"
fi

echo ""
echo "================================================"
echo "  All Set! 🎉"
echo "================================================"
echo ""
echo "To start the system, open TWO terminal windows:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd /home/bits/Desktop/Internship/backend"
echo "  uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd /home/bits/Desktop/Internship/frontend"
echo "  npm run dev"
echo ""
echo "Then open your browser to: http://localhost:5173"
echo ""
echo "================================================"
echo "  Testing ESP32 (without hardware)"
echo "================================================"
echo ""
echo "To test WebSocket functionality:"
echo "  cd /home/bits/Desktop/ESP32"
echo "  python3 test_websocket_client.py"
echo ""
echo "================================================"
echo "  Next Steps"
echo "================================================"
echo ""
echo "1. Read ESP32_INTEGRATION.md for complete guide"
echo "2. Check ESP32/README.md for ESP32 hardware setup"
echo "3. View API docs at: http://localhost:8000/docs"
echo ""
echo "Happy Monitoring! 🚀"
echo ""
