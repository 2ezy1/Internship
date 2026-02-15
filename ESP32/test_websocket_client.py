#!/usr/bin/env python3
"""
ESP32 WebSocket Client Simulator
Simulates an ESP32 device sending sensor data to the FastAPI WebSocket server.
Useful for testing without physical hardware.

Usage:
    python3 test_websocket_client.py

Requirements:
    pip install websockets asyncio
"""

import asyncio
import json
import random
import time
from datetime import datetime

try:
    import websockets
except ImportError:
    print("❌ Error: websockets library not installed")
    print("Install with: pip install websockets")
    exit(1)

# ==================== Configuration ====================
SERVER_HOST = "localhost"  # Change to your server IP if testing remotely
SERVER_PORT = 8000
DEVICE_ID = 1  # Change to match your device ID in the database

# Sensor baseline values
BASE_TEMPERATURE = 25.0
BASE_HUMIDITY = 60.0
BASE_PRESSURE = 1013.0
BASE_LIGHT = 500.0

# Reading interval (seconds)
READING_INTERVAL = 5


def generate_sensor_data():
    """Generate simulated sensor readings"""
    
    # Add random variations to simulate real sensor readings
    temperature = BASE_TEMPERATURE + random.uniform(-3.0, 3.0)
    humidity = BASE_HUMIDITY + random.uniform(-10.0, 10.0)
    pressure = BASE_PRESSURE + random.uniform(-5.0, 5.0)
    light = BASE_LIGHT + random.uniform(-100, 100)
    motion = random.choice([True, False, False, False])  # Motion detected 25% of the time
    
    # Clamp humidity to valid range
    humidity = max(0.0, min(100.0, humidity))
    light = max(0.0, light)
    
    return {
        "temperature": f"{temperature:.2f}",
        "humidity": f"{humidity:.2f}",
        "pressure": f"{pressure:.2f}",
        "light": f"{light:.0f}",
        "motion": "true" if motion else "false",
        "custom_data": {
            "source": "python_simulator",
            "timestamp": datetime.now().isoformat(),
            "uptime": int(time.time())
        }
    }


async def send_sensor_data():
    """Connect to WebSocket server and send sensor data"""
    
    uri = f"ws://{SERVER_HOST}:{SERVER_PORT}/ws/esp32/send/{DEVICE_ID}"
    
    print("\n" + "=" * 60)
    print("ESP32 WebSocket Client Simulator")
    print("=" * 60)
    print(f"Server: {uri}")
    print(f"Device ID: {DEVICE_ID}")
    print(f"Reading Interval: {READING_INTERVAL}s")
    print("=" * 60 + "\n")
    
    retry_count = 0
    max_retries = 5
    
    while retry_count < max_retries:
        try:
            print(f"🔌 Connecting to WebSocket server...")
            
            async with websockets.connect(uri) as websocket:
                print(f"✅ Connected to {uri}\n")
                retry_count = 0  # Reset retry count on successful connection
                
                # Send sensor data in a loop
                reading_count = 0
                while True:
                    reading_count += 1
                    
                    # Generate sensor data
                    sensor_data = generate_sensor_data()
                    
                    # Convert to JSON string
                    json_data = json.dumps(sensor_data)
                    
                    # Send to server
                    print(f"📤 Sending reading #{reading_count}:")
                    print(f"   Temperature: {sensor_data['temperature']}°C")
                    print(f"   Humidity: {sensor_data['humidity']}%")
                    print(f"   Pressure: {sensor_data['pressure']} hPa")
                    print(f"   Light: {sensor_data['light']} lux")
                    print(f"   Motion: {sensor_data['motion']}")
                    
                    await websocket.send(json_data)
                    
                    # Wait for server response
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                        response_data = json.loads(response)
                        
                        if response_data.get("status") == "ok":
                            print(f"   ✅ Server acknowledged (ID: {response_data.get('reading_id')})")
                        elif "error" in response_data:
                            print(f"   ❌ Server error: {response_data['error']}")
                    except asyncio.TimeoutError:
                        print(f"   ⚠️ No response from server (timeout)")
                    except json.JSONDecodeError:
                        print(f"   ⚠️ Invalid JSON response: {response}")
                    
                    print()  # Empty line for readability
                    
                    # Wait before sending next reading
                    await asyncio.sleep(READING_INTERVAL)
                    
        except websockets.exceptions.WebSocketException as e:
            retry_count += 1
            print(f"❌ WebSocket error: {e}")
            
            if retry_count < max_retries:
                wait_time = retry_count * 2
                print(f"🔄 Retrying in {wait_time} seconds... (Attempt {retry_count}/{max_retries})")
                await asyncio.sleep(wait_time)
            else:
                print(f"❌ Max retries ({max_retries}) reached. Giving up.")
                break
                
        except ConnectionRefusedError:
            retry_count += 1
            print(f"❌ Connection refused. Is the server running?")
            
            if retry_count < max_retries:
                wait_time = retry_count * 2
                print(f"🔄 Retrying in {wait_time} seconds... (Attempt {retry_count}/{max_retries})")
                await asyncio.sleep(wait_time)
            else:
                print(f"❌ Max retries ({max_retries}) reached. Giving up.")
                break
                
        except KeyboardInterrupt:
            print("\n\n⚠️ Interrupted by user. Disconnecting...")
            break
            
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            retry_count += 1
            
            if retry_count < max_retries:
                wait_time = retry_count * 2
                print(f"🔄 Retrying in {wait_time} seconds... (Attempt {retry_count}/{max_retries})")
                await asyncio.sleep(wait_time)
            else:
                print(f"❌ Max retries ({max_retries}) reached. Giving up.")
                break


def main():
    """Main entry point"""
    try:
        asyncio.run(send_sensor_data())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")


if __name__ == "__main__":
    # Check configuration
    print("\n⚙️  Configuration Check:")
    print(f"   Server Host: {SERVER_HOST}")
    print(f"   Server Port: {SERVER_PORT}")
    print(f"   Device ID: {DEVICE_ID}")
    print("\n💡 Make sure:")
    print("   1. Backend server is running (uvicorn main:app --reload --host 0.0.0.0)")
    print("   2. Device ID exists in your database")
    print("   3. Firewall allows WebSocket connections")
    print("\n⌨️  Press Ctrl+C to stop\n")
    
    input("Press Enter to start...")
    
    main()
