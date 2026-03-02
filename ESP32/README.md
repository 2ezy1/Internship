# Modbus Jig Setup Instructions

## Hardware Requirements
- 2x RS485 boards
- USB cables for programming and serial connection

## Setup Steps

### 1. Upload Firmware to Boards

**Board 1 - UART Bridge:**
- Open `uart_bridge/uart_bridge.ino` in Arduino IDE
- Upload this firmware to the first RS485 board
- This board will act as the bridge between USB and RS485

**Board 2 - VFD Slave:**
- Open `vfd_slave_uart/vfd_slave_uart.ino` in Arduino IDE
- Upload this firmware to the second RS485 board
- This board will simulate a VFD (Variable Frequency Drive) slave device

### 2. Connect the Boards

Connect the two RS485 boards together:
- Connect **A** terminal of Board 1 to **A** terminal of Board 2
- Connect **B** terminal of Board 1 to **B** terminal of Board 2

### 3. Test the Setup

1. Keep the board with **uart_bridge** firmware connected to your computer via USB
2. Open `index.html` in a web browser (Chrome, Edge, or another browser that supports Web Serial API)
3. Click **"Connect to Serial"** button
4. In the port selection dialog, choose the serial port corresponding to the board with **uart_bridge** firmware
5. You should now be able to communicate with the VFD slave board through the Modbus interface
