import { useEffect, useState, useCallback, useRef } from 'react'

export type VFDUpdate = {
  id: number
  frequency: string | null
  speed: string | null
  current: string | null
  voltage: string | null
  power: string | null
  torque: string | null
  status: number | null
  fault_code: number | null
  custom_data: string | null
  timestamp: string
}

export type RealtimeMessage = {
  type: 'vfd_update'
  device_id: number
  data?: VFDUpdate
  error?: string
}

/**
 * Hook to listen for real-time VFD data updates via WebSocket
 * Connects to /ws/device/{deviceId} endpoint on backend
 */
export function useDeviceRealtime(deviceId: number | string) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<VFDUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const getWebSocketUrl = useCallback(() => {
    const apiBase = (import.meta.env.VITE_API_BASE as string) || 
      `${window.location.protocol}//${window.location.hostname}:8000`
    
    // Convert http(s) to ws(s)
    const wsBase = apiBase.replace(/^http/, 'ws')
    
    return `${wsBase}/ws/device/${deviceId}`
  }, [deviceId])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      const wsUrl = getWebSocketUrl()
      console.log(`🔌 Connecting to VFD WebSocket: ${wsUrl}`)
      
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log(`✅ VFD WebSocket connected for device ${deviceId}`)
        setIsConnected(true)
        setError(null)
        reconnectAttemptsRef.current = 0
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data)
          console.log('📨 VFD update received:', message)
          
          if (message.type === 'vfd_update' && message.data) {
            setLastUpdate(message.data)
          }
          
          if (message.error) {
            setError(message.error)
          }
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err)
        }
      }

      wsRef.current.onerror = (event) => {
        console.error('❌ WebSocket error:', event)
        setError('Connection error')
      }

      wsRef.current.onclose = () => {
        console.log(`🔌 VFD WebSocket closed for device ${deviceId}`)
        setIsConnected(false)
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`)
          
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        } else {
          console.log('❌ Max reconnection attempts reached')
          setError('Connection lost and max reconnection attempts reached')
        }
      }
    } catch (err) {
      console.error('❌ Failed to create WebSocket:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [deviceId, getWebSocketUrl])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    setIsConnected(false)
    reconnectAttemptsRef.current = maxReconnectAttempts // Prevent auto-reconnect
  }, [])

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected,
    lastUpdate,
    error,
    disconnect,
    reconnect: connect,
  }
}
