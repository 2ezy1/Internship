#!/bin/bash
# ESP32 to Frontend Complete Setup Script
# Run this to start all components

echo "
╔════════════════════════════════════════════════════════════╗
║    ESP32 Data Transmission Pipeline - Quick Start          ║
╚════════════════════════════════════════════════════════════╝
"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo -e "${BLUE}Project Root: ${PROJECT_ROOT}${NC}\n"

# Function to run command in new terminal
run_in_terminal() {
    local name=$1
    local command=$2
    local dir=$3
    
    echo -e "${YELLOW}▶ Starting: $name${NC}"
    
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows (PowerShell)
        powershell -NoExit -Command "cd '$dir'; $command"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        osascript -e "tell app \"Terminal\" to do script \"cd '$dir' && $command\""
    else
        # Linux/WSL
        gnome-terminal -- bash -c "cd '$dir' && $command; exec bash"
    fi
}

# Step 1: Verify Setup
echo -e "\n${BLUE}Step 1: Verifying Setup...${NC}"
echo "Running verification script..."
python "$PROJECT_ROOT/verify_setup.py"

read -p "Continue to start services? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Step 2: Backend
echo -e "\n${BLUE}Step 2: Starting Backend Server${NC}"
echo -e "${YELLOW}Opening new terminal for backend...${NC}"
cd "$PROJECT_ROOT/backend"
python -m venv venv 2>/dev/null || true
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate 2>/dev/null
pip install -r requirements.txt -q 2>/dev/null || true

echo -e "${GREEN}✅ Backend environment ready${NC}"
echo "Starting: python main.py"
python main.py &
BACKEND_PID=$!
echo -e "${GREEN}Backend PID: $BACKEND_PID${NC}"

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 3

# Step 3: Frontend
echo -e "\n${BLUE}Step 3: Starting Frontend Server${NC}"
cd "$PROJECT_ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install -q
fi

echo -e "${GREEN}✅ Frontend environment ready${NC}"
echo "Starting: npm run dev"
npm run dev &
FRONTEND_PID=$!
echo -e "${GREEN}Frontend PID: $FRONTEND_PID${NC}"

sleep 2

# Step 4: Upload to ESP32 (Optional)
echo -e "\n${BLUE}Step 4: ESP32 Setup${NC}"
read -p "Upload code to ESP32? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd "$PROJECT_ROOT/ESP32/master"
    
    if command -v pio &> /dev/null; then
        echo "Uploading to ESP32..."
        pio run --target upload
        echo "Opening serial monitor..."
        pio device monitor --baud 115200
    else
        echo -e "${YELLOW}⚠️  platformio not installed. Run: pip install platformio${NC}"
        echo "Then run: cd $PROJECT_ROOT/ESP32/master && pio run --target upload"
    fi
fi

# Display URLs
echo -e "\n${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All Services Started!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}\n"

echo "🌐 Frontend:   http://localhost:5173"
echo "🔌 Backend:    http://192.168.254.110:8000"
echo "📊 API Docs:   http://192.168.254.110:8000/docs"
echo ""
echo "Next steps:"
echo "1. Open frontend: http://localhost:5173"
echo "2. Login with your credentials"
echo "3. Navigate to device page to see real-time data"
echo ""
echo "To monitor:"
echo "  Backend logs: Check terminal"
echo "  Frontend logs: Check browser console (F12)"
echo "  ESP32 logs: Open serial monitor (9600 baud)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Wait for all background processes
wait $BACKEND_PID $FRONTEND_PID

echo -e "\n${YELLOW}Services stopped${NC}"
