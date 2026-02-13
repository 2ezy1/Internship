// WebSocket service for real-time sensor data from ESP32

export type SensorData = {
  id: number
  temperature: string | null
  humidity: string | null
  pressure: string | null
  light: string | null
  motion: string | null
  distance: string | null  // Ultrasonic distance in cm
  custom_data: string | null
  timestamp: string
}

export type WebSocketMessage = {
  type: 'sensor_update' | 'pong' | 'error'
  device_id?: number
  data?: SensorData
  error?: string
}

export class DeviceWebSocket {
  private ws: WebSocket | null = null
  private deviceId: number
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 2000
  private reconnectTimeout: number | null = null
  private onMessageCallback: ((message: WebSocketMessage) => void) | null = null
  private onErrorCallback: ((error: Event) => void) | null = null
  private onCloseCallback: (() => void) | null = null
  private onConnectCallback: (() => void) | null = null
  private pingInterval: number | null = null

  constructor(deviceId: number) {
    this.deviceId = deviceId
  }

  /**
   * Get WebSocket URL based on environment
   */
  private getWebSocketUrl(): string {
    const apiBase = (import.meta.env.VITE_API_BASE as string) || `http://${window.location.hostname}:8000`
    
    // Convert http(s) to ws(s)
    const wsBase = apiBase.replace(/^http/, 'ws')
    
    return `${wsBase}/ws/device/${this.deviceId}`
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('⚠️ WebSocket already connected or connecting')
      return
    }

    const wsUrl = this.getWebSocketUrl()
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`)

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log(`✅ WebSocket connected for device ${this.deviceId}`)
        this.reconnectAttempts = 0
        
        // Start ping interval to keep connection alive
        this.startPingInterval()
        
        if (this.onConnectCallback) {
          this.onConnectCallback()
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log('📨 WebSocket message received:', message)
          
          if (this.onMessageCallback) {
            this.onMessageCallback(message)
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        
        if (this.onErrorCallback) {
          this.onErrorCallback(error)
        }
      }

      this.ws.onclose = () => {
        console.log(`🔌 WebSocket closed for device ${this.deviceId}`)
        this.stopPingInterval()
        
        if (this.onCloseCallback) {
          this.onCloseCallback()
        }

        // Attempt to reconnect
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error)
    }
  }

  /**
   * Send ping to keep connection alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping')
      }
    }, 30000) // Send ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts

    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    console.log(`🔌 Disconnecting WebSocket for device ${this.deviceId}`)
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Stop ping interval
    this.stopPingInterval()

    // Close WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // Reset reconnect attempts
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent auto-reconnect
  }

  /**
   * Send a message to the server
   */
  send(message: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message)
    } else {
      console.warn('⚠️ WebSocket is not connected')
    }
  }

  /**
   * Set callback for incoming messages
   */
  onMessage(callback: (message: WebSocketMessage) => void): void {
    this.onMessageCallback = callback
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Event) => void): void {
    this.onErrorCallback = callback
  }

  /**
   * Set callback for connection close
   */
  onClose(callback: () => void): void {
    this.onCloseCallback = callback
  }

  /**
   * Set callback for successful connection
   */
  onConnect(callback: () => void): void {
    this.onConnectCallback = callback
  }

  /**
   * Get connection state
   */
  getReadyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
