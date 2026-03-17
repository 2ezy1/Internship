import { useCallback, useEffect, useRef, useState } from 'react'

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
  type: 'vfd_update' | 'pong' | string
  device_id?: number
  data?: VFDUpdate
  error?: string
}

export function useDeviceRealtime(deviceId: number | string) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<VFDUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepaliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)

  const getWebSocketUrl = useCallback(() => {
    const apiBase = (import.meta.env.VITE_API_BASE as string) || window.location.origin
    const wsBase = apiBase.replace(/^http/, 'ws')
    return `${wsBase}/ws/device/${deviceId}`
  }, [deviceId])

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current)
      keepaliveIntervalRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    const numericDeviceId = Number(deviceId)
    if (!Number.isFinite(numericDeviceId) || numericDeviceId <= 0) {
      return
    }

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return
    }

    shouldReconnectRef.current = true

    const ws = new WebSocket(getWebSocketUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)
      reconnectAttemptsRef.current = 0

      keepaliveIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send('ping')
        }
      }, 30000)
    }

    ws.onmessage = (event) => {
      try {
        const message: RealtimeMessage = JSON.parse(event.data)
        if (message.type === 'vfd_update' && message.data) {
          setLastUpdate(message.data)
        }
        if (message.error) {
          setError(message.error)
        }
      } catch {
        // Ignore malformed frames.
      }
    }

    ws.onerror = () => {
      setError('Connection error')
    }

    ws.onclose = () => {
      setIsConnected(false)
      clearTimers()

      if (!shouldReconnectRef.current) {
        return
      }

      reconnectAttemptsRef.current += 1
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttemptsRef.current))
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }
  }, [clearTimers, deviceId, getWebSocketUrl])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    clearTimers()
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [clearTimers])

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
