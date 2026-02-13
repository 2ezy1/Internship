import { Layout, Button, Card, Badge, Spin, Alert, Statistic, Row, Col } from 'antd'
import { ArrowLeftOutlined, DisconnectOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import { DeviceWebSocket } from '../services/websocket'
import type { SensorData } from '../services/websocket'
import { sensorAPI } from '../services/api'
import '../styles/DeviceDetails.css'

const { Header, Content } = Layout

type Device = {
  key: string
  deviceName: string
  ipAddress: string
  type: string
  status: string
  dateInstalled: string
}

type LocationState = {
  device?: Device
}

export default function DeviceDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const state = location.state as LocationState
  const device = state?.device

  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false)
  const [latestReading, setLatestReading] = useState<SensorData | null>(null)
  const [sensorHistory, setSensorHistory] = useState<SensorData[]>([])
  const [loading, setLoading] = useState(true)
  const wsRef = useRef<DeviceWebSocket | null>(null)

  // Load initial sensor data and setup WebSocket
  useEffect(() => {
    if (!device || !id) return

    const deviceId = parseInt(id)
    
    // Fetch historical sensor readings
    const fetchSensorData = async () => {
      try {
        setLoading(true)
        const response = await sensorAPI.getSensorReadings(deviceId, 50)
        const readings = response.data || []
        setSensorHistory(readings)
        
        if (readings.length > 0) {
          setLatestReading(readings[0])
        }
      } catch (error) {
        console.error('Failed to fetch sensor data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSensorData()

    // Setup WebSocket connection
    const ws = new DeviceWebSocket(deviceId)
    wsRef.current = ws

    ws.onConnect(() => {
      console.log('✅ Connected to device WebSocket')
      setWsConnected(true)
    })

    ws.onMessage((message) => {
      if (message.type === 'sensor_update' && message.data) {
        console.log('📊 New sensor data received:', message.data)
        
        // Update latest reading
        setLatestReading(message.data)
        
        // Add to history (keep last 50 readings)
        setSensorHistory((prev) => {
          const updated = [message.data!, ...prev]
          return updated.slice(0, 50)
        })
      }
    })

    ws.onClose(() => {
      console.log('🔌 Disconnected from device WebSocket')
      setWsConnected(false)
    })

    ws.onError((error) => {
      console.error('❌ WebSocket error:', error)
      setWsConnected(false)
    })

    // Connect
    ws.connect()

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up WebSocket connection')
      ws.disconnect()
    }
  }, [device, id])


  if (!device) {
    return (
      <Layout className="device-details-layout">
        <Header className="device-details-header">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/home')} type="text">
            Back
          </Button>
        </Header>
        <Content className="device-details-content">
          <Card className="device-details-card">
            <h2>Device not found</h2>
            <p>The device details could not be loaded. Return to the device list.</p>
            <Button type="primary" onClick={() => navigate('/home')}>Go to Devices</Button>
          </Card>
        </Content>
      </Layout>
    )
  }

  const temperature = latestReading?.temperature ? parseFloat(latestReading.temperature) : null
  const humidity = latestReading?.humidity ? parseFloat(latestReading.humidity) : null
  const pressure = latestReading?.pressure ? parseFloat(latestReading.pressure) : null
  const light = latestReading?.light ? parseFloat(latestReading.light) : null
  const distance = latestReading?.distance ? parseFloat(latestReading.distance) : null
  const runningState = device.status === 'Active' ? 'Running' : 'Stopped'
  
  // Prepare chart data from sensor history (prioritize available sensor data)
  // Try distance first (ultrasonic), then temperature, then other sensors
  const chartData = sensorHistory
    .map(reading => {
      if (reading.distance) return parseFloat(reading.distance)
      if (reading.temperature) return parseFloat(reading.temperature)
      if (reading.humidity) return parseFloat(reading.humidity)
      if (reading.light) return parseFloat(reading.light)
      if (reading.pressure) return parseFloat(reading.pressure)
      return null
    })
    .filter(val => val !== null)
    .reverse() as number[]

  // Determine what type of sensor data we're displaying
  const getChartType = () => {
    if (sensorHistory.length === 0) return { label: 'Sensor Data', unit: '' }
    const firstReading = sensorHistory[0]
    if (firstReading.distance) return { label: 'Distance', unit: 'cm' }
    if (firstReading.temperature) return { label: 'Temperature', unit: '°C' }
    if (firstReading.humidity) return { label: 'Humidity', unit: '%' }
    if (firstReading.light) return { label: 'Light Level', unit: 'lux' }
    if (firstReading.pressure) return { label: 'Pressure', unit: 'hPa' }
    return { label: 'Sensor Data', unit: '' }
  }
  
  const chartType = getChartType()

  const CHART_WIDTH = 100
  const CHART_HEIGHT = 100
  const SERIES_MIN = chartData.length > 0 ? Math.min(...chartData) - 2 : 0
  const SERIES_MAX = chartData.length > 0 ? Math.max(...chartData) + 2 : 50

  const getChartPoints = (values: number[], min: number, max: number) => {
    if (!values.length) return []
    const span = max - min || 1

    return values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * CHART_WIDTH
      const y = CHART_HEIGHT - ((value - min) / span) * CHART_HEIGHT
      return { x, y }
    })
  }

  const getSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return ''
    let d = `M ${points[0].x},${points[0].y}`

    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] ?? points[i]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[i + 2] ?? p2
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }

    return d
  }

  const getSmoothAreaPath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return ''
    const linePath = getSmoothPath(points)
    const first = points[0]
    const last = points[points.length - 1]
    return `${linePath} L ${last.x},${CHART_HEIGHT} L ${first.x},${CHART_HEIGHT} Z`
  }

  const chartPointList = getChartPoints(chartData, SERIES_MIN, SERIES_MAX)
  const chartLinePath = getSmoothPath(chartPointList)
  const chartAreaPath = getSmoothAreaPath(chartPointList)

  return (
    <Layout className="device-details-layout">
      <Header className="device-details-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/home')} type="text">
          Back
        </Button>
        <div className="device-details-title">
          <h1>{device.deviceName}</h1>
          <span>{device.type}</span>
        </div>
        <div>
          <Badge 
            status={wsConnected ? 'processing' : 'default'} 
            text={wsConnected ? 'Live' : 'Offline'}
          />
        </div>
      </Header>
      <Content className="device-details-content">
        {/* Connection Status Alert */}
        {!wsConnected && !loading && (
          <Alert
            message="WebSocket Disconnected"
            description="Real-time updates are currently unavailable. Historical data is still accessible."
            type="warning"
            icon={<DisconnectOutlined />}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" tip="Loading sensor data..." />
          </div>
        )}

        {!loading && (
          <>
            <div className="device-details-grid">
              <Card className="device-details-card">
                <div className="device-details-meta">
                  <div>
                    <span className="label">Device ID</span>
                    <strong>{id || device.key}</strong>
                  </div>
                  <div>
                    <span className="label">IP Address</span>
                    <strong>{device.ipAddress}</strong>
                  </div>
                  <div>
                    <span className="label">Installed</span>
                    <strong>{device.dateInstalled ? dayjs(device.dateInstalled).format('MMM D, YYYY') : 'Unknown'}</strong>
                  </div>
                  <div>
                    <span className="label">Status</span>
                    <span className={`running-status ${device.status === 'Active' ? 'active' : 'inactive'}`}>
                      {runningState}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Real-time Sensor Readings */}
              <Card 
                className="device-details-card"
                title={
                  <span>
                    <ThunderboltOutlined style={{ marginRight: 8, color: wsConnected ? '#52c41a' : '#d9d9d9' }} />
                    Live Sensor Data
                  </span>
                }
              >
                {!latestReading ? (
                  <Alert
                    message="No sensor data available"
                    description="Waiting for ESP32 to send data..."
                    type="info"
                    showIcon
                  />
                ) : (
                  <Row gutter={[16, 16]}>
                    {temperature !== null && (
                      <Col span={12}>
                        <Statistic
                          title="Temperature"
                          value={temperature.toFixed(1)}
                          suffix="°C"
                          valueStyle={{ color: temperature > 30 ? '#cf1322' : '#3f8600' }}
                        />
                      </Col>
                    )}
                    {humidity !== null && (
                      <Col span={12}>
                        <Statistic
                          title="Humidity"
                          value={humidity.toFixed(1)}
                          suffix="%"
                          valueStyle={{ color: '#1890ff' }}
                        />
                      </Col>
                    )}
                    {pressure !== null && (
                      <Col span={12}>
                        <Statistic
                          title="Pressure"
                          value={pressure.toFixed(1)}
                          suffix="hPa"
                        />
                      </Col>
                    )}
                    {light !== null && (
                      <Col span={12}>
                        <Statistic
                          title="Light Level"
                          value={light.toFixed(0)}
                          suffix="lux"
                        />
                      </Col>
                    )}
                    {distance !== null && (
                      <Col span={12}>
                        <Statistic
                          title="Distance"
                          value={distance.toFixed(1)}
                          suffix="cm"
                          valueStyle={{ color: distance < 10 ? '#faad14' : '#52c41a' }}
                        />
                      </Col>
                    )}
                  </Row>
                )}
                {latestReading && (
                  <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
                    Last updated: {dayjs(latestReading.timestamp).format('HH:mm:ss')}
                  </div>
                )}
              </Card>
            </div>

            {/* Sensor History Chart */}
            {chartData.length > 0 && (
              <Card className="device-details-card">
                <div className="chart-header">
                  <div className="chart-title">
                    <h3>{chartType.label} History</h3>
                    <p>Last {chartData.length} readings</p>
                  </div>
                  <Badge 
                    status={wsConnected ? 'processing' : 'default'} 
                    text={wsConnected ? 'Live' : 'Historical'}
                  />
                </div>
                <div className="sensor-chart-wrap">
                  <div className="sensor-y-axis">
                    <span className="sensor-y-label">{chartType.unit}</span>
                    <span>{SERIES_MAX.toFixed(1)}</span>
                    <span>{((SERIES_MAX + SERIES_MIN) / 2).toFixed(1)}</span>
                    <span>{SERIES_MIN.toFixed(1)}</span>
                  </div>
                  <div className="sensor-chart-area">
                    <svg
                      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                      preserveAspectRatio="none"
                      className="sensor-chart"
                      role="img"
                      aria-label={`${chartType.label} data`}
                    >
                      <defs>
                        <linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(15, 23, 42, 0.96)" />
                          <stop offset="100%" stopColor="rgba(2, 6, 23, 0.95)" />
                        </linearGradient>
                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#00d4ff" />
                          <stop offset="100%" stopColor="#00d4ff" />
                        </linearGradient>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(0, 212, 255, 0.2)" />
                          <stop offset="100%" stopColor="rgba(0, 212, 255, 0)" />
                        </linearGradient>
                        <filter id="lineGlow" x="-40%" y="-40%" width="180%" height="180%">
                          <feGaussianBlur stdDeviation="1.6" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <rect width={CHART_WIDTH} height={CHART_HEIGHT} fill="url(#chartBg)" rx="8" />
                      <path d={chartAreaPath} fill="url(#areaGradient)" />
                      <path
                        d={chartLinePath}
                        fill="none"
                        strokeWidth="2"
                        stroke="rgba(0, 212, 255, 0.35)"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#lineGlow)"
                        className="sensor-line-glow"
                      />
                      <path
                        d={chartLinePath}
                        fill="none"
                        strokeWidth="1"
                        stroke="url(#lineGradient)"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="sensor-line"
                      />
                      {chartPointList.map((point, index) => (
                        <circle
                          key={`point-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="1"
                          className="sensor-point"
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              </Card>
            )}

            {chartData.length === 0 && !loading && (
              <Card className="device-details-card">
                <Alert
                  message="No Historical Data"
                  description="This device hasn't sent any sensor readings yet. Data will appear here once the ESP32 starts transmitting."
                  type="info"
                  showIcon
                />
              </Card>
            )}
          </>
        )}
      </Content>
    </Layout>
  )
}
