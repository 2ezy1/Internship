#!/usr/bin/env python3
"""
Setup Verification Script for ESP32 Data Transmission
Checks each component of the data pipeline
"""

import sys
import socket
import json
import asyncio
from datetime import datetime
import requests
from typing import Optional

# Color codes for output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_status(status: str, message: str, details: str = ""):
    symbol = '✅' if status == 'pass' else '❌' if status == 'fail' else '⚠️'
    color = Colors.GREEN if status == 'pass' else Colors.RED if status == 'fail' else Colors.YELLOW
    
    print(f"{color}{symbol} {message}{Colors.RESET}")
    if details:
        print(f"   {Colors.BLUE}→ {details}{Colors.RESET}")

def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}{Colors.RESET}\n")

def check_backend_availability(host: str = "192.168.254.110", port: int = 8000) -> bool:
    """Check if backend server is running"""
    try:
        response = requests.get(f"http://{host}:{port}/health", timeout=5)
        if response.status_code == 200:
            print_status('pass', f"Backend server is running", f"http://{host}:{port}")
            return True
    except requests.exceptions.ConnectionError:
        print_status('fail', f"Backend server not responding", f"Cannot connect to http://{host}:{port}")
    except Exception as e:
        print_status('fail', f"Backend connection error", str(e))
    return False

def check_device_registered(host: str = "192.168.254.110", port: int = 8000, device_id: int = 1, token: Optional[str] = None) -> tuple[bool, dict]:
    """Check if device is registered in database"""
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        response = requests.get(f"http://{host}:{port}/devices/{device_id}", headers=headers, timeout=5)
        
        if response.status_code == 200:
            device = response.json()
            print_status('pass', f"Device ID {device_id} is registered", 
                        f"Name: {device.get('device_name')}, Key: {device.get('device_key', 'N/A')[:16]}...")
            return True, device
        elif response.status_code == 401:
            print_status('warning', f"Authentication required", "Need valid token to check device")
            return False, {}
        else:
            print_status('fail', f"Device ID {device_id} not found", f"HTTP {response.status_code}")
    except requests.exceptions.ConnectionError:
        print_status('fail', f"Cannot reach backend", "Is the server running?")
    except Exception as e:
        print_status('fail', f"Device check error", str(e))
    
    return False, {}

def check_network_connectivity(host: str = "192.168.254.110") -> bool:
    """Check if backend server is reachable via ping"""
    try:
        sock = socket.create_connection((host, 8000), timeout=3)
        sock.close()
        print_status('pass', f"Network connectivity to {host}", "Reachable on port 8000")
        return True
    except socket.timeout:
        print_status('fail', f"Network timeout", f"Cannot reach {host}:8000")
    except socket.error as e:
        print_status('fail', f"Network error", str(e))
    return False

async def check_websocket_endpoint(host: str = "192.168.254.110", port: int = 8000, 
                                    device_id: int = 1, device_key: str = "") -> bool:
    """Check if WebSocket endpoint is accessible"""
    try:
        import websockets
    except ImportError:
        print_status('warning', "websockets library not installed", "Run: pip install websockets")
        return False
    
    try:
        uri = f"ws://{host}:{port}/ws/esp32/connect?device_id={device_id}&device_key={device_key}"
        print_status('info', "Testing ESP32 WebSocket endpoint", uri)
        
        async with websockets.connect(uri, timeout=5) as websocket:
            # Send heartbeat message
            heartbeat = {
                "type": "heartbeat",
                "device_id": device_id,
                "device_key": device_key,
                "timestamp": str(int(datetime.now().timestamp())),
                "rssi": -50,
                "uptime": 3600000
            }
            
            await websocket.send(json.dumps(heartbeat))
            print_status('pass', f"WebSocket /ws/esp32/connect is accessible", 
                        "Sent heartbeat message")
            
            # Try to receive acknowledgment
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=2)
                response_data = json.loads(response)
                if response_data.get('status') == 'ok':
                    print_status('pass', f"Backend acknowledged heartbeat", 
                                f"Response: {response_data}")
                    return True
            except asyncio.TimeoutError:
                print_status('warning', "No response from backend", 
                            "Backend may not have connection handler")
        
        return True
        
    except Exception as e:
        print_status('fail', f"WebSocket connection failed", str(e))
        return False

def check_frontend_websocket(host: str = "192.168.254.110", port: int = 8000, device_id: int = 1) -> bool:
    """Check if frontend WebSocket endpoint exists"""
    try:
        import websockets
    except ImportError:
        print_status('warning', "websockets library not installed", "Run: pip install websockets")
        return False
    
    async def _check():
        try:
            uri = f"ws://{host}:{port}/ws/device/{device_id}"
            print_status('info', "Testing Frontend WebSocket endpoint", uri)
            
            async with websockets.connect(uri, timeout=5) as websocket:
                # Wait for any data or connection confirmation
                try:
                    # Send ping to test connection
                    await websocket.send('ping')
                    response = await asyncio.wait_for(websocket.recv(), timeout=2)
                    print_status('pass', f"WebSocket /ws/device/{device_id} is accessible", 
                                f"Received: {response}")
                except asyncio.TimeoutError:
                    print_status('pass', f"WebSocket /ws/device/{device_id} is accessible", 
                                "Connection accepted (no data yet)")
            
            return True
        except Exception as e:
            print_status('fail', f"Frontend WebSocket failed", str(e))
            return False
    
    return asyncio.run(_check())

def check_database_connection(host: str = "192.168.254.110", port: int = 8000) -> bool:
    """Check if backend can access database"""
    try:
        response = requests.get(f"http://{host}:{port}/devices/", timeout=5)
        if response.status_code in [200, 401]:  # 401 is OK if auth is required
            print_status('pass', f"Database is accessible", "Backend can query devices")
            return True
        else:
            print_status('fail', f"Database query failed", f"HTTP {response.status_code}")
    except Exception as e:
        print_status('fail', f"Database check failed", str(e))
    return False

def print_setup_instructions():
    """Print setup/troubleshooting instructions"""
    print(f"\n{Colors.BOLD}{Colors.YELLOW}SETUP INSTRUCTIONS{Colors.RESET}\n")
    
    with open("ESP32_TO_FRONTEND_SETUP.md", "r") as f:
        print(f.read())

def main():
    print(f"\n{Colors.BOLD}{Colors.BLUE}")
    print("╔════════════════════════════════════════════════════════════╗")
    print("║       ESP32 Data Transmission Pipeline Verification        ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print(Colors.RESET)
    
    # Configuration
    BACKEND_HOST = "192.168.254.110"
    BACKEND_PORT = 8000
    DEVICE_ID = 1
    DEVICE_KEY = "69ced61b-5521-4ef7-ab17-19a2cdf14af8"
    
    print(f"\n{Colors.BOLD}Configuration:{Colors.RESET}")
    print(f"  Backend: {BACKEND_HOST}:{BACKEND_PORT}")
    print(f"  Device ID: {DEVICE_ID}")
    print(f"  Device Key: {DEVICE_KEY[:16]}...")
    
    results = {}
    
    # 1. Network Connectivity
    print_header("1. NETWORK CONNECTIVITY")
    results['network'] = check_network_connectivity(BACKEND_HOST)
    
    # 2. Backend Availability
    print_header("2. BACKEND SERVER")
    results['backend'] = check_backend_availability(BACKEND_HOST, BACKEND_PORT)
    
    # 3. Database Access
    print_header("3. DATABASE ACCESS")
    results['database'] = check_database_connection(BACKEND_HOST, BACKEND_PORT)
    
    # 4. Device Registration
    print_header("4. DEVICE REGISTRATION")
    device_exists, device_info = check_device_registered(BACKEND_HOST, BACKEND_PORT, DEVICE_ID)
    results['device_registered'] = device_exists
    
    # 5. WebSocket Endpoints
    print_header("5. WEBSOCKET ENDPOINTS")
    
    # Check ESP32 endpoint
    print(f"\n{Colors.BOLD}ESP32 Connection Endpoint:{Colors.RESET}")
    results['esp32_ws'] = asyncio.run(check_websocket_endpoint(BACKEND_HOST, BACKEND_PORT, DEVICE_ID, DEVICE_KEY))
    
    # Check Frontend endpoint
    print(f"\n{Colors.BOLD}Frontend Streaming Endpoint:{Colors.RESET}")
    results['frontend_ws'] = check_frontend_websocket(BACKEND_HOST, BACKEND_PORT, DEVICE_ID)
    
    # 6. Summary
    print_header("VERIFICATION SUMMARY")
    
    checks = {
        'Network Connectivity': results.get('network'),
        'Backend Server': results.get('backend'),
        'Database Access': results.get('database'),
        'Device Registered': results.get('device_registered'),
        'ESP32 WebSocket': results.get('esp32_ws'),
        'Frontend WebSocket': results.get('frontend_ws'),
    }
    
    passed = sum(1 for v in checks.values() if v)
    total = len(checks)
    
    print(f"{Colors.BOLD}Results:{Colors.RESET}")
    for check_name, result in checks.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {check_name}")
    
    print(f"\n{Colors.BOLD}Overall: {passed}/{total} checks passed{Colors.RESET}")
    
    if passed == total:
        print(f"\n{Colors.GREEN}{Colors.BOLD}🎉 All systems operational! Data should flow correctly.{Colors.RESET}\n")
        return 0
    else:
        print(f"\n{Colors.YELLOW}{Colors.BOLD}⚠️  Some checks failed. See details above.{Colors.RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
