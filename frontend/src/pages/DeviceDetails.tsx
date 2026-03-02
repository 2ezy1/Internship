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
  Table,
  Tag,
  Typography,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/DeviceDetails.css'

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

const defaultStats: Stats = {
  totalReads: 0,
  successReads: 0,
  errorReads: 0,
  dataRecords: 0,
  lastRead: '--:--:--',
}

export default function DeviceDetails() {
  const navigate = useNavigate()
  const [slaveId, setSlaveId] = useState(1)
  const [baudRate, setBaudRate] = useState(9600)
  const [dataBits, setDataBits] = useState(8)
  const [stopBits, setStopBits] = useState(1)
  const [parity, setParity] = useState('none')
  const [brandModel, setBrandModel] = useState('')

  // WebSocket configuration
  const [serverHost, setServerHost] = useState('localhost')
  const [serverPort, setServerPort] = useState(8000)
  const [deviceId, setDeviceId] = useState(1)
  const [useWebSocket, setUseWebSocket] = useState(false)

  const [registers, setRegisters] = useState<Register[]>([])
  const [brandData, setBrandData] = useState<Record<string, Register[]>>({})
  const [registerState, setRegisterState] = useState<Record<number, RegisterState>>({})

  const [stats, setStats] = useState<Stats>(defaultStats)
  const [, setDataLog] = useState<DataPoint[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])

  const [statusText, setStatusText] = useState(
    'Disconnected - Configure settings and click Connect to start'
  )
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info')

  const [brandModalOpen, setBrandModalOpen] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [connectModalState, setConnectModalState] = useState<
    'connecting' | 'success' | 'error'
  >('connecting')
  const [connectMessage, setConnectMessage] = useState('Establishing connection...')
  const [connectInProgress, setConnectInProgress] = useState(false)
  const [connected, setConnected] = useState(false)

  const portRef = useRef<SerialPortLike | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const webSocketRef = useRef<WebSocket | null>(null)
  const pollingRef = useRef(false)
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statsRef = useRef<Stats>(defaultStats)
  const dataLogRef = useRef<DataPoint[]>([])
  const logIdRef = useRef(0)

  const serialSupported = useMemo(() => {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }, [])

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
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
      if (updated.length > 2000) return updated.slice(0, 2000)
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

              addLog(
                `Read ${reg.name} (${reg.address}): Raw=${rawValue}, Actual=${actualValue} ${reg.unit}`,
                'success'
              )
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

        updateStats()
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

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
              addLog(`Server confirmed data reception (ID: ${data.reading_id})`, 'success')
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
      addLog('Data sent via WebSocket', 'info')
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
      if (slaveId < 1 || slaveId > 247) throw new Error('Slave ID must be between 1 and 247')

      setConnectInProgress(true)
      setConnectModalState('connecting')
      setConnectMessage('Establishing connection...')
      setConnectModalOpen(true)

      // Try WebSocket connection if enabled
      if (useWebSocket) {
        setConnectMessage('Connecting to WebSocket server...')
        await connectWebSocket()
        setConnectMessage('WebSocket connected. Starting polling...')
      } else {
        // Use Web Serial API
        if (!serialSupported) throw new Error('Web Serial API not supported in this browser')

        const serial = (navigator as unknown as { serial: SerialLike }).serial
        const port = await serial.requestPort()
        await port.open({
          baudRate,
          dataBits,
          stopBits,
          parity,
          flowControl: 'none',
        })

        portRef.current = port
        writerRef.current = port.writable.getWriter()
        readerRef.current = port.readable.getReader()

        addLog(`Serial port connected successfully to Slave ID ${slaveId}`, 'success')
        addLog(`Config: ${baudRate} baud, ${dataBits}${parity.charAt(0).toUpperCase()}${stopBits}`, 'info')
      }

      setConnected(true)
      setStatusType('success')
      const connType = useWebSocket ? `WebSocket (${serverHost}:${serverPort})` : `Serial - Slave ${slaveId}`
      setStatusText(`Connected - Reading via ${connType}...`)
      addLog(`Connection type: ${connType}`, 'success')

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
    addLog('Modbus RTU Master initialized', 'info')
    addLog('Select a brand and configure serial settings including Slave ID and click Connect', 'info')

    if (!serialSupported) {
      setStatusType('error')
      setStatusText('Web Serial API not supported')
      addLog('Web Serial API not supported in this browser', 'error')
    }

    return () => {
      if (pollingRef.current) {
        disconnectSerial().catch(() => undefined)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const columns = [
    {
      title: 'Register Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      render: (value: number) => <span className="modbus-address">{value}</span>,
    },
    {
      title: 'Raw Value',
      dataIndex: 'raw',
      key: 'raw',
      render: (value: string, record: { hasError: boolean }) => (
        <span className={record.hasError ? 'modbus-table-error' : 'modbus-table-value'}>
          {value}
        </span>
      ),
    },
    {
      title: 'Actual Value',
      dataIndex: 'value',
      key: 'value',
      render: (value: string, record: { hasError: boolean }) => (
        <span className={record.hasError ? 'modbus-table-error' : 'modbus-table-value'}>
          {value}
        </span>
      ),
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: string, record: { hasError: boolean }) => (
        <Tag color={record.hasError ? 'red' : value === 'OK' ? 'green' : 'default'}>{value}</Tag>
      ),
    },
  ]

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
              <span>Modbus RTU Master</span>
            </div>
            <div className="modbus-subtitle">Reading Holding Registers from Configurable Slave ID</div>
          </div>

          <div className="modbus-divider" />

          <Form layout="inline" className="modbus-form">
            <Form.Item label="Slave ID">
              <InputNumber min={1} max={247} value={slaveId} onChange={(value) => setSlaveId(value ?? 1)} />
            </Form.Item>
            <Form.Item label="Baud Rate">
              <Select value={baudRate} onChange={setBaudRate} style={{ minWidth: 120 }}>
                {[9600, 19200, 38400, 57600, 115200].map((rate) => (
                  <Select.Option key={rate} value={rate}>
                    {rate}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Data Bits">
              <Select value={dataBits} onChange={setDataBits} style={{ width: 90 }}>
                {[8, 7].map((bits) => (
                  <Select.Option key={bits} value={bits}>
                    {bits}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Stop Bits">
              <Select value={stopBits} onChange={setStopBits} style={{ width: 90 }}>
                {[1, 2].map((bits) => (
                  <Select.Option key={bits} value={bits}>
                    {bits}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Parity">
              <Select value={parity} onChange={setParity} style={{ width: 110 }}>
                {['none', 'even', 'odd'].map((item) => (
                  <Select.Option key={item} value={item}>
                    {item}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Brand-Model">
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
            <Form.Item label="Connection">
              <Select
                value={useWebSocket ? 'ws' : 'serial'}
                onChange={(val) => setUseWebSocket(val === 'ws')}
                style={{ minWidth: 120 }}
              >
                <Select.Option value="serial">Serial (Web)</Select.Option>
                <Select.Option value="ws">WebSocket</Select.Option>
              </Select>
            </Form.Item>
            {useWebSocket && (
              <>
                <Form.Item label="Server Host">
                  <input
                    className="modbus-text-input"
                    type="text"
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value)}
                    placeholder="localhost or IP"
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
              </>
            )}
          </Form>

          <div className="modbus-actions">
            <Button
              className="modbus-btn modbus-btn-connect"
              onClick={connectSerial}
              disabled={(useWebSocket && !serverHost) || (useWebSocket && !serverPort) || connected || connectInProgress}
            >
              🔌 {useWebSocket ? 'Connect to Server' : 'Connect to Serial'}
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

          <Alert
            className="modbus-status"
            type={statusType}
            message={statusText}
            showIcon={false}
          />

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

          <div className="modbus-table-card">
            <Table
              className="modbus-table"
              columns={columns}
              dataSource={tableData}
              pagination={false}
              locale={{
                emptyText: 'Select a brand to load registers',
              }}
              scroll={{ x: true }}
            />
          </div>

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
              : 'Connecting to Serial Port'
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
            <Text type="secondary">Slave ID:</Text> <Text strong>{slaveId}</Text>
          </div>
          <div>
            <Text type="secondary">Baud Rate:</Text> <Text strong>{baudRate}</Text>
          </div>
          <div>
            <Text type="secondary">Data Bits:</Text> <Text strong>{dataBits}</Text>
          </div>
          <div>
            <Text type="secondary">Stop Bits:</Text> <Text strong>{stopBits}</Text>
          </div>
          <div>
            <Text type="secondary">Parity:</Text> <Text strong>{parity}</Text>
          </div>
          <div>
            <Text type="secondary">Brand:</Text> <Text strong>{brandModel || 'N/A'}</Text>
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
