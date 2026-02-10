import { Layout, Button, Card } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
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

const getTemperature = (key: string) => {
  const seed = Number.parseInt(key, 10)
  const offset = Number.isNaN(seed) ? 5 : seed % 12
  return 18 + offset
}

const clampValue = (value: number, min: number, max: number) => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const CHART_WIDTH = 100
const CHART_HEIGHT = 100
const SERIES_MIN = 0
const SERIES_MAX = 1.2
const SERIES_SAFE_MAX = SERIES_MAX - 0.1
const SERIES_LENGTH = 25

const buildSampleSeries = (count: number, seed: number) => {
  const readings: number[] = []
  let value = 0.12 + (seed % 10) * 0.015

  for (let i = 0; i < count; i += 1) {
    const drift = Math.sin((i + seed) * 0.18) * 0.04
    const trend = Math.cos((i + seed) * 0.05) * 0.03
    value = clampValue(value + drift + trend, SERIES_MIN, SERIES_SAFE_MAX)
    readings.push(Number(value.toFixed(2)))
  }

  return readings
}

const getChartPoints = (values: number[], min = 0, max = 1) => {
  if (!values.length) return []
  const span = max - min || 1

  return values.map((value, index) => {
    const clamped = clampValue(value, min, max)
    const x = (index / (values.length - 1)) * CHART_WIDTH
    const y = CHART_HEIGHT - ((clamped - min) / span) * CHART_HEIGHT
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

export default function DeviceDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const state = location.state as LocationState
  const device = state?.device


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

  const temperature = getTemperature(device.key)
  const runningState = device.status === 'Active' ? 'Running' : 'Stopped'
  const seed = Number.parseInt(device.key, 10)
  const series = buildSampleSeries(SERIES_LENGTH, Number.isNaN(seed) ? 1 : seed)
  const chartPointList = getChartPoints(series, SERIES_MIN, SERIES_MAX)
  const chartLinePath = getSmoothPath(chartPointList)
  const chartAreaPath = getSmoothAreaPath(chartPointList)
  const minValue = Math.min(...series)
  const maxValue = Math.max(...series)
  const minIndex = series.indexOf(minValue)
  const maxIndex = series.indexOf(maxValue)
  const minPoint = chartPointList[minIndex]
  const maxPoint = chartPointList[maxIndex]
  const xAxisLabels = ['0s', '10s', '20s', '30s', '40s', '50s', '60s']
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
      </Header>
      <Content className="device-details-content">
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

          <Card className="device-details-card">
            <div className="device-status-row">
              <div>
                <span className="label">Temperature</span>
                <strong>{temperature}°C</strong>
                <p>Operating range: 18°C - 32°C</p>
              </div>
              <div>
                <span className="label">Running state</span>
                <strong>{runningState}</strong>
                <p>{device.status === 'Active' ? 'Stable and transmitting data.' : 'No signal detected.'}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="device-details-card">
          <div className="chart-header">
            <div className="chart-title">
              <h3>Data Logging</h3>
              <p>Sensor readings (per second)</p>
            </div>
            <span className="chart-badge">Simulated</span>
          </div>
          <div className="sensor-chart-wrap">
            <div className="sensor-y-axis">
              <span className="sensor-y-label">Sensor value</span>
              <span>1.2</span>
              <span>0.6</span>
              <span>0.0</span>
            </div>
            <div className="sensor-chart-area">
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                preserveAspectRatio="none"
                className="sensor-chart"
                role="img"
                aria-label="Sensor data"
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
              <div className="sensor-placeholder">No live data yet</div>
              {minPoint && (
                <div
                  className="sensor-badge"
                  style={{ left: `${minPoint.x}%`, top: `${minPoint.y}%` }}
                >
                  Min: {minValue.toFixed(2)}
                </div>
              )}
              {maxPoint && (
                <div
                  className="sensor-badge"
                  style={{ left: `${maxPoint.x}%`, top: `${maxPoint.y}%` }}
                >
                  Max: {maxValue.toFixed(2)}
                </div>
              )}
              <div className="sensor-x-axis">
                {xAxisLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </div>
        </Card>

      </Content>
    </Layout>
  )
}
