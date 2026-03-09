import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Layout,
  Modal,
  Row,
  Select,
  Statistic,
  Typography,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import '../styles/DeviceDetails.css'
import { useDeviceRealtime } from '../hooks/useDeviceRealtime'

const { Content } = Layout
const { Text } = Typography

type Register = {
  address: number
  name: string
  unit: string
  divisor: number
}

type Stats = {
  totalReads: number
  successReads: number
  errorReads: number
  dataRecords: number
  lastRead: string
}

type LogEntry = {
  id: number
  timestamp: string
  message: string
  type: 'info' | 'success' | 'error'
}

type RegisterState = {
  raw: string
  value: string
  status: string
  hasError: boolean
}

type SerialPortLike = {
  open: (options: {
    baudRate: number
    dataBits: number
    stopBits: number
    parity: string
    flowControl: string
  }) => Promise<void>
  close: () => Promise<void>
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}

type SerialLike = {
  requestPort: () => Promise<SerialPortLike>
}

type DataPoint = {
  timestamp: string
  registerNames: string[]
  values: (string | number)[]
}

type RuntimePoint = {
  key: string
  label: string
  hours: number
  seconds: number
}

type DeviceRouteState = {
  device?: {
    vfdBrandModel?: string
  }
}

const defaultStats: Stats = {
  totalReads: 0,
  successReads: 0,
  errorReads: 0,
  dataRecords: 0,
  lastRead: '--:--:--',
}

// Helper function to format numbers to 2 decimal places
function formatDecimal(value: string | number | null | undefined): string {
  if (value == null || value === '') return '–'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toFixed(2)
}

export default function DeviceDetails() {
  const runtimeStorageKey = 'modbus_runtime_history_v1'
  const statsStorageKey = 'modbus_stats_v1'
  const { id: routeDeviceId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const selectedBrandFromDevice = (
    ((location.state as DeviceRouteState | null)?.device?.vfdBrandModel ?? '') || ''
  ).trim()
  const selectedBrandFromStorage = (
    routeDeviceId ? localStorage.getItem(`device_brand_${routeDeviceId}`) ?? '' : ''
  ).trim()
  const resolvedSavedBrand = selectedBrandFromDevice || selectedBrandFromStorage
  const [slaveId, setSlaveId] = useState(1)
  const [baudRate, setBaudRate] = useState(9600)
  const [dataBits, setDataBits] = useState(8)
  const [stopBits, setStopBits] = useState(1)
  const [parity, setParity] = useState('none')
  const [brandModel, setBrandModel] = useState(resolvedSavedBrand)

  // WebSocket configuration (auto-detect server from current host or use default)
  const [serverHost, setServerHost] = useState(
    window.location.hostname === 'localhost' ? '192.168.254.110' : window.location.hostname
  )
  const [serverPort, setServerPort] = useState(8000)
  const [deviceId, setDeviceId] = useState(1)
  const [useWebSocket] = useState(true) // Always use WebSocket

  const [registers, setRegisters] = useState<Register[]>([])
  const [brandData, setBrandData] = useState<Record<string, Register[]>>({})
  const [registerState, setRegisterState] = useState<Record<number, RegisterState>>({})

  const [stats, setStats] = useState<Stats>(defaultStats)
  const [, setDataLog] = useState<DataPoint[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])

  const [statusText, setStatusText] = useState('Ready - Configure connection and click Connect')
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info')

  const [brandModalOpen, setBrandModalOpen] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [connectModalState, setConnectModalState] = useState<
    'connecting' | 'success' | 'error'
  >('connecting')
  const [connectMessage, setConnectMessage] = useState('Establishing connection...')
  const [connectInProgress, setConnectInProgress] = useState(false)
  const [connected, setConnected] = useState(false)

  // Live VFD data from server (for static "Testing" / ESP32_Master device)
  const { isConnected: vfdWsConnected, lastUpdate: vfdLastUpdate, error: vfdError } = useDeviceRealtime(routeDeviceId ?? 0)

  const portRef = useRef<SerialPortLike | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const webSocketRef = useRef<WebSocket | null>(null)
  const pollingRef = useRef(false)
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statsRef = useRef<Stats>(defaultStats)
  const dataLogRef = useRef<DataPoint[]>([])
  const logIdRef = useRef(0)
  const lastLogRef = useRef<{ message: string; type: 'info' | 'success' | 'error'; at: number } | null>(null)
  const runtimeSessionStartRef = useRef<number | null>(null)
  const runtimeTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [runtimeHistory, setRuntimeHistory] = useState<RuntimePoint[]>([])

  const toDateKey = (date: Date) => {
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const readRuntimeMap = () => {
    try {
      const raw = localStorage.getItem(runtimeStorageKey)
      if (!raw) return {} as Record<string, number>
      const parsed = JSON.parse(raw) as Record<string, number>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {} as Record<string, number>
    }
  }

  const writeRuntimeMap = (map: Record<string, number>) => {
    localStorage.setItem(runtimeStorageKey, JSON.stringify(map))
  }

  const buildLast30Days = (map: Record<string, number>) => {
    const points: RuntimePoint[] = []
    for (let i = 29; i >= 0; i -= 1) {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)
      const key = toDateKey(day)
      const seconds = Number(map[key] ?? 0)
      const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      points.push({
        key,
        label,
        seconds,
        hours: Number((seconds / 3600).toFixed(1)),
      })
    }
    return points
  }

  const refreshRuntimeHistory = () => {
    const runtimeMap = readRuntimeMap()
    setRuntimeHistory(buildLast30Days(runtimeMap))
  }

  const addRuntimeSeconds = (secondsToAdd: number) => {
    if (secondsToAdd <= 0) return
    const runtimeMap = readRuntimeMap()
    const todayKey = toDateKey(new Date())
    runtimeMap[todayKey] = Math.max(0, Math.floor((runtimeMap[todayKey] ?? 0) + secondsToAdd))

    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffKey = toDateKey(cutoff)

    Object.keys(runtimeMap).forEach((key) => {
      if (key < cutoffKey) delete runtimeMap[key]
    })

    writeRuntimeMap(runtimeMap)
  }

  const commitRuntimeChunk = (resetStart = true) => {
    if (!runtimeSessionStartRef.current) return
    const elapsed = Math.floor((Date.now() - runtimeSessionStartRef.current) / 1000)
    if (elapsed > 0) {
      addRuntimeSeconds(elapsed)
      refreshRuntimeHistory()
    }
    runtimeSessionStartRef.current = resetStart ? Date.now() : null
  }

  const serialSupported = useMemo(() => {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }, [])

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const now = Date.now()
    const last = lastLogRef.current

    // Drop repeated noisy entries that usually come from per-message ACK chatter.
    if (last && last.message === message && last.type === type && now - last.at < 1000) {
      return
    }

    lastLogRef.current = { message, type, at: now }

    const timestamp = new Date().toLocaleTimeString()
    const entry: LogEntry = {
      id: logIdRef.current + 1,
      timestamp,
      message,
      type,
    }
    logIdRef.current += 1
    setLogs((prev) => {
      const updated = [entry, ...prev]
      if (updated.length > 300) return updated.slice(0, 300)
      return updated
    })
  }

  const updateStats = (updates?: Partial<Stats>) => {
    statsRef.current = {
      ...statsRef.current,
      lastRead: new Date().toLocaleTimeString(),
      ...updates,
    }
    setStats({ ...statsRef.current })
      // Persist stats to localStorage
      if (routeDeviceId) {
        try {
          localStorage.setItem(`${statsStorageKey}_${routeDeviceId}`, JSON.stringify(statsRef.current))
        } catch (error) {
          console.error('Failed to save stats to localStorage:', error)
        }
      }
  }

  const formatTimestamp = () => {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }
    return now.toLocaleDateString('en-US', options)
  }

  const saveDataToLog = (values: (string | number)[]) => {
    const timestamp = formatTimestamp()
    const registerNames = registers.map((reg) => reg.name)
    const dataPoint: DataPoint = { timestamp, registerNames, values }
    dataLogRef.current = [...dataLogRef.current, dataPoint]
    setDataLog([...dataLogRef.current])
    updateStats({ dataRecords: dataLogRef.current.length })
  }

  const arrayToCSV = (data: DataPoint[]) => {
    if (!data || data.length === 0) return ''
    const headers = ['Timestamp', ...registers.map((reg) => reg.name)]
    const csvRows = [headers.map((val) => `"${val}"`).join(',')]
    data
      .slice()
      .reverse()
      .forEach((entry) => {
        const row = [entry.timestamp, ...entry.values]
        const quotedRow = row.map((val) => `"${String(val).replace(/"/g, '""')}"`)
        csvRows.push(quotedRow.join(','))
      })
    return csvRows.join('\n')
  }

  const downloadData = () => {
    if (dataLogRef.current.length === 0) {
      window.alert('No data to download. Start collecting data first.')
      return
    }
    const csvContent = arrayToCSV(dataLogRef.current)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const filename = `modbus_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } else {
      const url = URL.createObjectURL(blob)
      window.open(url)
      URL.revokeObjectURL(url)
    }
    addLog(`Data exported to ${filename} (${dataLogRef.current.length} records)`, 'success')
  }

  const applyDivisor = (value: number, divisor: number) => {
    return (value * divisor).toFixed(1)
  }

  const buildRequest = (sid: number, functionCode: number, address: number, quantity: number) => {
    const buffer = new Uint8Array(8)
    buffer[0] = sid
    buffer[1] = functionCode
    buffer[2] = (address >> 8) & 0xff
    buffer[3] = address & 0xff
    buffer[4] = (quantity >> 8) & 0xff
    buffer[5] = quantity & 0xff
    const crc = calculateCRC(buffer.slice(0, 6))
    buffer[6] = crc & 0xff
    buffer[7] = (crc >> 8) & 0xff
    return buffer
  }

  const calculateCRC = (buffer: Uint8Array) => {
    let crc = 0xffff
    for (const b of buffer) {
      crc ^= b
      for (let i = 0; i < 8; i += 1) {
        if (crc & 1) {
          crc = (crc >> 1) ^ 0xa001
        } else {
          crc >>= 1
        }
      }
    }
    return crc
  }

  const sendRequest = async (request: Uint8Array) => {
    if (useWebSocket) {
      // Skip serial write in WebSocket mode
      return
    }
    if (!writerRef.current) throw new Error('Writer not available')
    await writerRef.current.write(request)
  }

  const readResponse = async (timeout = 2000) => {
    if (useWebSocket) {
      // Return mock response in WebSocket mode - data comes from backend
      await new Promise((resolve) => setTimeout(resolve, 100))
      // Return a dummy Modbus response with random values for demonstration
      const response = new Uint8Array([slaveId, 3, 2, 0, Math.floor(Math.random() * 100), 0])
      return response
    }

    return new Promise<Uint8Array | null>(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Response timeout'))
      }, timeout)

      try {
        const chunks: number[][] = []
        let totalLength = 0
        let expectedLength = 0

        while (true) {
          if (!readerRef.current) {
            clearTimeout(timeoutId)
            resolve(null)
            return
          }

          const { value, done } = await readerRef.current.read()
          if (done) {
            clearTimeout(timeoutId)
            resolve(chunks.length > 0 ? new Uint8Array(chunks.flat()) : null)
            return
          }

          if (value && value.length > 0) {
            chunks.push(Array.from(value))
            totalLength += value.length

            if (totalLength >= 3 && expectedLength === 0) {
              const flatChunks = chunks.flat()
              if (flatChunks[1] === 3) {
                expectedLength = 3 + flatChunks[2] + 2
              } else if (flatChunks[1] & 0x80) {
                expectedLength = 5
              }
            }

            if (expectedLength > 0 && totalLength >= expectedLength) {
              clearTimeout(timeoutId)
              resolve(new Uint8Array(chunks.flat().slice(0, expectedLength)))
              return
            }
          }

          if (totalLength > 256) {
            clearTimeout(timeoutId)
            resolve(new Uint8Array(chunks.flat()))
            return
          }
        }
      } catch (err) {
        clearTimeout(timeoutId)
        reject(err)
      }
    })
  }

  const parseResponse = (response: Uint8Array | null) => {
    if (!response || response.length < 5) return null
    const expectedSlaveId = slaveId
    if (response[0] !== expectedSlaveId) return null
    if (response[1] & 0x80) return null
    if (response[1] !== 3) return null
    const dataLength = response[2]
    if (response.length < 3 + dataLength + 2) return null
    const receivedCRC = response[response.length - 2] | (response[response.length - 1] << 8)
    const calculatedCRC = calculateCRC(response.slice(0, response.length - 2))
    if (receivedCRC !== calculatedCRC) return null
    const high = response[3]
    const low = response[4]
    const value = (high << 8) + low
    return value
  }

  const startPolling = async () => {
    pollingRef.current = true
    const sid = slaveId
    while (pollingRef.current) {
      const cycleValues: (string | number)[] = []

      for (const reg of registers) {
        if (!pollingRef.current) break
        try {
          statsRef.current.totalReads += 1
          const request = buildRequest(sid, 3, reg.address, 1)
          await sendRequest(request)
          const response = await readResponse(2000)
          if (response) {
            const rawValue = parseResponse(response)
            if (rawValue !== null) {
              const actualValue = applyDivisor(rawValue, reg.divisor)
              statsRef.current.successReads += 1

              setRegisterState((prev) => ({
                ...prev,
                [reg.address]: {
                  raw: String(rawValue),
                  value: String(actualValue),
                  status: 'OK',
                  hasError: false,
                },
              }))

              // Avoid per-register success log spam to keep the UI responsive.
              cycleValues.push(actualValue)
            } else {
              throw new Error('Invalid response format')
            }
          } else {
            throw new Error('No response received')
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          statsRef.current.errorReads += 1
          setRegisterState((prev) => ({
            ...prev,
            [reg.address]: {
              raw: 'Error',
              value: 'Error',
              status: 'Error',
              hasError: true,
            },
          }))
          addLog(`Error reading ${reg.name} (${reg.address}): ${message}`, 'error')
          cycleValues.push('ERROR')
        }

        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      updateStats()

      if (cycleValues.length === registers.length) {
        saveDataToLog(cycleValues)

        // Send data via WebSocket if enabled
        if (useWebSocket && webSocketRef.current?.readyState === WebSocket.OPEN) {
          const registerData: Record<string, number | string> = {}
          registers.forEach((reg, idx) => {
            registerData[reg.name] = cycleValues[idx] ?? 0
          })
          sendDataViaWebSocket(registerData)
        }
      }

      if (pollingRef.current) {
        await new Promise((resolve) => {
          readTimeoutRef.current = setTimeout(resolve, 1000)
        })
      }
    }
  }

  const connectWebSocket = async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUri = `${protocol}//${serverHost}:${serverPort}/ws/rs485/send/${deviceId}`

        const ws = new WebSocket(wsUri)

        ws.onopen = () => {
          webSocketRef.current = ws
          addLog(`Connected to WebSocket server at ${serverHost}:${serverPort}`, 'success')
          resolve()
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.status === 'ok') {
              // Intentionally skip ACK success logs to avoid render-heavy log floods.
            } else if (data.error) {
              addLog(`Server error: ${data.error}`, 'error')
            }
          } catch (err) {
            addLog(`Received: ${event.data}`, 'info')
          }
        }

        ws.onerror = () => {
          webSocketRef.current = null
          reject(new Error('WebSocket connection error'))
        }

        ws.onclose = () => {
          webSocketRef.current = null
          addLog('WebSocket connection closed', 'info')
        }

        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close()
            reject(new Error('WebSocket connection timeout'))
          }
        }, 5000)
      } catch (err) {
        reject(err)
      }
    })
  }

  const sendDataViaWebSocket = (registerData: Record<string, number | string>) => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    const payload = {
      device_id: deviceId,
      timestamp: new Date().toISOString(),
      modbus_slave_id: slaveId,
      registers: registerData,
      custom_data: {
        brand: brandModel,
        connection_type: 'websocket',
        client_ip: window.location.hostname,
      },
    }

    try {
      webSocketRef.current.send(JSON.stringify(payload))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      addLog(`WebSocket send error: ${message}`, 'error')
    }
  }

  const canConnect = () => {

    if (!registers || registers.length === 0) {
      setBrandModalOpen(true)
      return false
    }
    return true
  }

  const connectSerial = async () => {
    try {
      if (!canConnect()) return

      setConnectInProgress(true)
      setConnectModalState('connecting')
      setConnectMessage('Connecting to ESP32 via WebSocket...')
      setConnectModalOpen(true)

      // Connect via WebSocket
      setConnectMessage(`Connecting to ${serverHost}:${serverPort}...`)
      await connectWebSocket()
      setConnectMessage('WebSocket connected. Starting data stream...')

      setConnected(true)
      setStatusType('success')
      setStatusText(`Connected to ESP32 (Device ${deviceId}) via ${serverHost}:${serverPort}`)
      addLog(`Connected to WebSocket server at ${serverHost}:${serverPort}`, 'success')

      setConnectModalState('success')
      setConnectMessage('Connected successfully.')
      setTimeout(() => setConnectModalOpen(false), 1500)

      await startPolling()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setStatusType('error')
      setStatusText(`Connection failed: ${message}`)
      addLog(`Connection failed: ${message}`, 'error')
      setConnectModalState('error')
      setConnectMessage(`Connection failed: ${message}`)
    } finally {
      setConnectInProgress(false)
    }
  }

  const disconnectSerial = async () => {
    commitRuntimeChunk(false)
    pollingRef.current = false
    if (readTimeoutRef.current) {
      clearTimeout(readTimeoutRef.current)
      readTimeoutRef.current = null
    }

    try {
      if (webSocketRef.current) {
        webSocketRef.current.close()
        webSocketRef.current = null
        addLog('WebSocket connection closed', 'info')
      }

      if (readerRef.current) {
        await readerRef.current.cancel()
        readerRef.current.releaseLock()
      }
      if (writerRef.current) {
        writerRef.current.releaseLock()
      }
      if (portRef.current) {
        await portRef.current.close()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      addLog(`Disconnect error: ${message}`, 'error')
    }

    setConnected(false)
    setStatusType('info')
    setStatusText('Disconnected')
    addLog('Connection disconnected', 'info')
  }

  const cancelConnect = async () => {
    setConnectModalOpen(false)
    pollingRef.current = false
    if (portRef.current) {
      try {
        await portRef.current.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        addLog(`Disconnect error: ${message}`, 'error')
      }
    }
  }

  const clearLog = () => {
    setLogs([])
    addLog('Log cleared', 'info')
  }

  useEffect(() => {
    refreshRuntimeHistory()

    const loadBrandData = async () => {
      try {
        const response = await fetch('/vfd_brand_model_registers.json')
        const data = (await response.json()) as Record<string, Register[]>
        setBrandData(data)
        addLog('Brand data loaded successfully', 'success')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        addLog(`Error loading brand data: ${message}`, 'error')
      }
    }

    loadBrandData()
    addLog('WebSocket Modbus System initialized', 'info')
    addLog(`Server: ${serverHost}:${serverPort} | Device ID: ${deviceId}`, 'info')
    if (resolvedSavedBrand) {
      addLog(`Loaded saved VFD brand/model: ${resolvedSavedBrand}`, 'success')
    } else {
      addLog('No saved VFD brand/model found on this device', 'info')
    }

    return () => {
      if (pollingRef.current) {
        disconnectSerial().catch(() => undefined)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load stats from localStorage on mount
  useEffect(() => {
    if (routeDeviceId) {
      try {
        const savedStats = localStorage.getItem(`${statsStorageKey}_${routeDeviceId}`)
        if (savedStats) {
          const parsed = JSON.parse(savedStats) as Stats
          statsRef.current = parsed
          setStats(parsed)
          console.log('Loaded stats from localStorage:', parsed)
        }
      } catch (error) {
        console.error('Failed to load stats from localStorage:', error)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDeviceId])

  useEffect(() => {
    if (!brandModel || Object.keys(brandData).length === 0) return
    if (brandData[brandModel]) return

    const resolvedKey = Object.keys(brandData).find(
      (key) => key.toLowerCase() === brandModel.toLowerCase()
    )
    if (resolvedKey && resolvedKey !== brandModel) {
      setBrandModel(resolvedKey)
      addLog(`Matched saved VFD brand/model to ${resolvedKey}`, 'success')
    }
  }, [brandModel, brandData])

  // Track runtime based on VFD connection status (connected or receiving VFD data)
  useEffect(() => {
    const isRunning = connected || (vfdWsConnected && vfdLastUpdate !== null)
    
    if (isRunning) {
      runtimeSessionStartRef.current = Date.now()
      runtimeTickRef.current = setInterval(() => {
        commitRuntimeChunk(true)
      }, 30000)
      return () => {
        if (runtimeTickRef.current) {
          clearInterval(runtimeTickRef.current)
          runtimeTickRef.current = null
        }
      }
    }

    if (runtimeTickRef.current) {
      clearInterval(runtimeTickRef.current)
      runtimeTickRef.current = null
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, vfdWsConnected, vfdLastUpdate])

  // Update stats when VFD data is received
  useEffect(() => {
    if (vfdLastUpdate) {
      const hasError = vfdLastUpdate.status === 2 // Fault status
      updateStats({
        totalReads: statsRef.current.totalReads + 1,
        successReads: statsRef.current.successReads + (hasError ? 0 : 1),
        errorReads: statsRef.current.errorReads + (hasError ? 1 : 0),
        dataRecords: statsRef.current.dataRecords + 1,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfdLastUpdate])

  useEffect(() => {
    if (!brandModel || !brandData[brandModel]) {
      setRegisters([])
      setRegisterState({})
      addLog('No brand selected', 'info')
      return
    }
    const selected = brandData[brandModel]
    setRegisters(selected)
    setRegisterState({})
    addLog(`Switched to ${brandModel.toUpperCase()} - ${selected.length} registers loaded`, 'success')
  }, [brandModel, brandData])

  const tableData = useMemo(() => {
    return registers.map((reg) => {
      const state = registerState[reg.address]
      return {
        key: reg.address,
        name: reg.name,
        address: reg.address,
        raw: state?.raw ?? '--',
        value: state?.value ?? '--',
        unit: reg.unit,
        status: state?.status ?? 'Waiting',
        hasError: state?.hasError ?? false,
      }
    })
  }, [registers, registerState])

  const registerSnapshots = useMemo(() => {
    const fallback = [
      { name: 'Voltage', address: 1002, raw: '2304', value: '230.4', unit: 'V', status: 'OK', hasError: false },
      { name: 'Current', address: 1003, raw: '178', value: '17.8', unit: 'A', status: 'OK', hasError: false },
      { name: 'Power', address: 1001, raw: '42', value: '4.2', unit: 'kW', status: 'OK', hasError: false },
      { name: 'Frequency', address: 1004, raw: '599', value: '59.9', unit: 'Hz', status: 'OK', hasError: false },
      { name: 'Energy', address: 1000, raw: '1286', value: '128.6', unit: 'kWh', status: 'OK', hasError: false },
    ]

    // When VFD data is available from server (e.g. Testing device / ESP32 Master), show it in Live Register Values
    if (vfdLastUpdate) {
      const statusLabel =
        vfdLastUpdate.status === 0
          ? 'Stop'
          : vfdLastUpdate.status === 1
            ? 'Run'
            : vfdLastUpdate.status === 2
              ? 'Fault'
              : vfdLastUpdate.status === 3
                ? 'Ready'
                : String(vfdLastUpdate.status ?? '–')
      const vfdRows = [
        { name: 'Frequency', value: formatDecimal(vfdLastUpdate.frequency), unit: 'Hz', isOk: true },
        { name: 'Speed', value: formatDecimal(vfdLastUpdate.speed), unit: 'RPM', isOk: true },
        { name: 'Current', value: formatDecimal(vfdLastUpdate.current), unit: 'A', isOk: true },
        { name: 'Voltage', value: formatDecimal(vfdLastUpdate.voltage), unit: 'V', isOk: true },
        { name: 'Power', value: formatDecimal(vfdLastUpdate.power), unit: 'kW', isOk: true },
        { name: 'Torque', value: formatDecimal(vfdLastUpdate.torque), unit: 'Nm', isOk: true },
        { name: 'Status', value: statusLabel, unit: '', isOk: vfdLastUpdate.status !== 2 },
        ...(vfdLastUpdate.status === 2 && vfdLastUpdate.fault_code != null
          ? [{ name: 'Fault code', value: String(vfdLastUpdate.fault_code), unit: '', isOk: false }]
          : []),
      ]
      return vfdRows.map((row, idx) => ({
        key: row.name,
        name: row.name,
        address: 1000 + idx,
        rawDisplay: row.value + (row.unit ? ` ${row.unit}` : ''),
        actualDisplay: row.value + (row.unit ? ` ${row.unit}` : ''),
        isOk: row.isOk,
      }))
    }

    const source = tableData.length > 0 ? tableData : fallback
    return source.slice(0, 12).map((row) => {
      const isOk = !row.hasError && String(row.status).toLowerCase() === 'ok'
      return {
        key: row.name,
        name: row.name,
        address: row.address,
        rawDisplay: `${row.raw}${row.unit ? ` ${row.unit}` : ''}`,
        actualDisplay: `${row.value}${row.unit ? ` ${row.unit}` : ''}`,
        isOk,
      }
    })
  }, [tableData, vfdLastUpdate])

  const hasRuntimeData = useMemo(
    () => runtimeHistory.some((point) => point.seconds > 0),
    [runtimeHistory]
  )

  const runtimeSeries = useMemo(() => {
    if (hasRuntimeData) return runtimeHistory

    return runtimeHistory.map((point, idx) => {
      const demoHours = Number(
        (5 + Math.abs(Math.sin((idx + 1) * 0.52)) * 8 + (idx % 6 === 0 ? 1.2 : 0)).toFixed(1)
      )
      return {
        ...point,
        hours: demoHours,
        seconds: Math.round(demoHours * 3600),
      }
    })
  }, [runtimeHistory, hasRuntimeData])

  const isUsingDemoRuntime = !hasRuntimeData && runtimeHistory.length > 0

  const runtimeAnalytics = useMemo(() => {
    const totalHours = runtimeSeries.reduce((sum, point) => sum + point.hours, 0)
    const maxHours = Math.max(...runtimeSeries.map((point) => point.hours), 1)
    const activeDays = runtimeSeries.filter((point) => point.seconds > 0).length
    const avgHours = runtimeSeries.length ? totalHours / runtimeSeries.length : 0

    return {
      totalHours,
      maxHours,
      activeDays,
      avgHours,
    }
  }, [runtimeSeries])

  const runtimeLineChart = useMemo(() => {
    const pointSpacing = 52
    const width = Math.max(1500, runtimeSeries.length * pointSpacing + 120)
    const height = 250
    const padding = { top: 16, right: 14, bottom: 54, left: 42 }
    const innerWidth = width - padding.left - padding.right
    const innerHeight = height - padding.top - padding.bottom
    const maxHours = 16

    const points = runtimeSeries.map((point, idx) => {
      const ratioX = runtimeSeries.length > 1 ? idx / (runtimeSeries.length - 1) : 0
      const x = padding.left + ratioX * innerWidth
      const boundedHours = Math.max(0, Math.min(point.hours, maxHours))
      const y = padding.top + (1 - boundedHours / maxHours) * innerHeight
      return { ...point, x, y }
    })

    const toSmoothPath = (pathPoints: Array<{ x: number; y: number }>) => {
      if (pathPoints.length === 0) return ''
      if (pathPoints.length === 1) return `M ${pathPoints[0].x},${pathPoints[0].y}`

      let d = `M ${pathPoints[0].x},${pathPoints[0].y}`
      for (let i = 0; i < pathPoints.length - 1; i += 1) {
        const p0 = pathPoints[i - 1] ?? pathPoints[i]
        const p1 = pathPoints[i]
        const p2 = pathPoints[i + 1]
        const p3 = pathPoints[i + 2] ?? p2

        const cp1x = p1.x + (p2.x - p0.x) / 6
        const cp1y = p1.y + (p2.y - p0.y) / 6
        const cp2x = p2.x - (p3.x - p1.x) / 6
        const cp2y = p2.y - (p3.y - p1.y) / 6

        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
      }
      return d
    }

    const baselineY = padding.top + innerHeight
    const smoothLinePath = toSmoothPath(points)
    const smoothAreaPath =
      points.length > 0
        ? `${smoothLinePath} L ${points[points.length - 1].x},${baselineY} L ${points[0].x},${baselineY} Z`
        : ''

    return {
      width,
      height,
      padding,
      maxHours,
      points,
      linePath: smoothLinePath,
      areaPath: smoothAreaPath,
      ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t) => ({
        y: padding.top + (1 - t / maxHours) * innerHeight,
        value: `${t}h`,
      })),
    }
  }, [runtimeSeries])

  return (
    <Layout className="device-details-layout">
      <Content className="device-details-content">
        <div className="modbus-shell">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/home')}
            className="device-back-btn"
          >
            Back to Home
          </Button>
          <div className="modbus-header">
            <div className="modbus-title">
              <span className="modbus-title-icon">🔌</span>
              <span>Live Performance Data</span>
            </div>
            <div className="modbus-subtitle">Reading Holding Registers from Configurable Slave ID</div>
          </div>

          <div className="modbus-divider" />

          <Form layout="inline" className="modbus-form">
            <Form.Item label="VFD Brand-Model">
              <Select
                value={brandModel}
                onChange={setBrandModel}
                placeholder="-- Select Brand --"
                style={{ minWidth: 180 }}
              >
                {Object.keys(brandData).map((brand) => (
                  <Select.Option key={brand} value={brand}>
                    {brand}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Server Host">
              <input
                className="modbus-text-input"
                type="text"
                value={serverHost}
                onChange={(e) => setServerHost(e.target.value)}
                placeholder="Server IP Address"
              />
            </Form.Item>
            <Form.Item label="Port">
              <InputNumber
                min={1}
                max={65535}
                value={serverPort}
                onChange={(val) => setServerPort(val ?? 8000)}
                style={{ minWidth: '80px' }}
              />
            </Form.Item>
            <Form.Item label="Device ID">
              <InputNumber
                min={1}
                value={deviceId}
                onChange={(val) => setDeviceId(val ?? 1)}
                style={{ minWidth: '80px' }}
              />
            </Form.Item>
          </Form>

          <div className="modbus-actions">
            <Button
              className="modbus-btn modbus-btn-connect"
              onClick={connectSerial}
              disabled={!serverHost || !serverPort || connected || connectInProgress}
            >
              🔌 Connect to ESP32
            </Button>
            <Button
              className="modbus-btn modbus-btn-disconnect"
              onClick={disconnectSerial}
              disabled={!connected}
            >
              🔌 Disconnect
            </Button>
            <Button className="modbus-btn modbus-btn-download" onClick={downloadData}>
              📊 Download CSV
            </Button>
          </div>

          <Row gutter={[16, 16]} className="modbus-stats">
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card className="modbus-stat-card">
                <Statistic title="Total Reads" value={stats.totalReads} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card className="modbus-stat-card">
                <Statistic title="Successful" value={stats.successReads} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card className="modbus-stat-card">
                <Statistic title="Errors" value={stats.errorReads} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card className="modbus-stat-card">
                <Statistic title="Data Records" value={stats.dataRecords} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card className="modbus-stat-card">
                <Statistic title="Last Read" value={stats.lastRead} />
              </Card>
            </Col>
          </Row>

          <Card className="modbus-runtime-card">
            <div className="modbus-chart-header">
              <div className="modbus-chart-title">Running Time (Last 30 Days)</div>
              <div className="modbus-chart-subtitle">
                {isUsingDemoRuntime ? 'Demo preview | ' : ''}
                Total {runtimeAnalytics.totalHours.toFixed(1)}h | Avg {runtimeAnalytics.avgHours.toFixed(1)}h/day
                | Active days {runtimeAnalytics.activeDays}/30
              </div>
            </div>

            <div className="modbus-runtime-line-wrap">
              <svg
                className="modbus-runtime-line-chart"
                viewBox={`0 0 ${runtimeLineChart.width} ${runtimeLineChart.height}`}
                style={{ width: `${runtimeLineChart.width}px` }}
                role="img"
                aria-label="Running time trend for the last 30 days"
              >
                {runtimeLineChart.ticks.map((tick) => (
                  <g key={tick.value}>
                    <line
                      x1={runtimeLineChart.padding.left}
                      y1={tick.y}
                      x2={runtimeLineChart.width - runtimeLineChart.padding.right}
                      y2={tick.y}
                      className="modbus-runtime-grid-line"
                    />
                    <text x={8} y={tick.y + 4} className="modbus-runtime-axis-text">
                      {tick.value}
                    </text>
                  </g>
                ))}

                <path d={runtimeLineChart.areaPath} className="modbus-runtime-area" />
                <path d={runtimeLineChart.linePath} className="modbus-runtime-line" />

                {runtimeLineChart.points.map((point) => (
                  <g key={point.key}>
                    <circle cx={point.x} cy={point.y} r="4" className="modbus-runtime-dot" />
                    <text x={point.x} y={point.y - 10} textAnchor="middle" className="modbus-runtime-point-text">
                      {point.hours.toFixed(1)}h
                    </text>
                    <text
                      x={point.x}
                      y={runtimeLineChart.height - 14}
                      textAnchor="middle"
                      className="modbus-runtime-x-text"
                    >
                      {point.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </Card>

          <Row gutter={[16, 16]} className="modbus-visuals">
            <Col xs={24}>
              <Card className="modbus-chart-card">
                <div className="modbus-chart-header">
                  <div className="modbus-chart-title">Live Register Values</div>
                  <div className="modbus-chart-subtitle">Raw values and actual converted values</div>
                </div>
                <div className="modbus-register-section-title">Actual Values</div>
                <div className="modbus-register-grid">
                  {registerSnapshots.map((item) => (
                    <div className={`modbus-register-card ${item.isOk ? 'is-ok' : 'is-error'}`} key={`actual-${item.key}`}>
                      <div className="modbus-register-meta">
                        <div>
                          <div className="modbus-register-name">{item.name}</div>
                          <div className="modbus-register-address">Address: {item.address}</div>
                        </div>
                        <div className="modbus-register-value">{item.actualDisplay}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>

          <div className="modbus-log-card">
            <div className="modbus-log-header">
              <div className="modbus-log-title">Communication Log</div>
              <Button className="modbus-btn modbus-btn-clear" onClick={clearLog} size="small">
                Clear Log
              </Button>
            </div>
            <div className="modbus-log">
              {logs.length === 0 && <Text type="secondary">No log entries yet.</Text>}
              {logs.map((entry) => (
                <div key={entry.id} className={`modbus-log-entry modbus-log-${entry.type}`}>
                  <span className="modbus-log-timestamp">[{entry.timestamp}]</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Content>

      <Modal
        title="Brand Selection Required"
        open={brandModalOpen}
        onOk={() => setBrandModalOpen(false)}
        onCancel={() => setBrandModalOpen(false)}
        okText="OK"
      >
        <Text>Please select a VFD brand model from the dropdown menu before connecting.</Text>
      </Modal>

      <Modal
        title={
          connectModalState === 'success'
            ? 'Connected Successfully'
            : connectModalState === 'error'
              ? 'Connection Failed'
              : 'Connecting to ESP32'
        }
        open={connectModalOpen}
        footer={
          connectModalState === 'connecting'
            ? [
                <Button key="cancel" onClick={cancelConnect}>
                  Cancel
                </Button>,
              ]
            : [
                <Button key="close" type="primary" onClick={() => setConnectModalOpen(false)}>
                  Close
                </Button>,
              ]
        }
        closable={connectModalState !== 'connecting'}
        maskClosable={connectModalState !== 'connecting'}
      >
        <div className="modbus-connect-details">
          <div>
            <Text type="secondary">Server:</Text> <Text strong>{serverHost}:{serverPort}</Text>
          </div>
          <div>
            <Text type="secondary">Device ID:</Text> <Text strong>{deviceId}</Text>
          </div>
          <div>
            <Text type="secondary">VFD Brand:</Text> <Text strong>{brandModel || 'N/A'}</Text>
          </div>
        </div>
        <Alert
          type={
            connectModalState === 'success'
              ? 'success'
              : connectModalState === 'error'
                ? 'error'
                : 'info'
          }
          message={connectMessage}
          showIcon
        />
      </Modal>
    </Layout>
  )
}
