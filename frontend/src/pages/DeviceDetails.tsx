import { Layout, Button, Card, Tag } from 'antd'
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

const getChartPath = (values: number[], min = 0, max = 1) => {
  if (!values.length) return ''
  const span = max - min || 1

  return values
    .map((value, index) => {
      const clamped = clampValue(value, min, max)
      const x = (index / (values.length - 1)) * 100
      const y = 60 - ((clamped - min) / span) * 40
      return `${x},${y}`
    })
    .join(' ')
}

const getTimeLabels = (count: number) => {
  const labels: string[] = []
  let seconds = 0
  let minutes = 0

  for (let i = 0; i < count; i += 1) {
    if (i % 4 === 3) {
      minutes += 1
      labels.push(`${minutes}m`)
    } else {
      labels.push(`${seconds}s`)
      seconds += 2
    }
  }

  return labels
}

export default function DeviceDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const state = location.state as LocationState
  const device = state?.device

  const sensorReadings: number[] = []
  const fallbackReadings = [0.2, 0.35, 0.28, 0.42, 0.38, 0.6, 0.52, 0.7, 0.65, 0.85, 0.78]
  const telemetry = sensorReadings.length ? sensorReadings : fallbackReadings
  const chartPoints = getChartPath(telemetry, 0, 1)
  const timeLabels = getTimeLabels(telemetry.length)

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
                <Tag color={device.status === 'Active' ? 'green' : 'volcano'}>{runningState}</Tag>
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
            <div>
              <h3>Sensor data logging</h3>
              <p>Distance trend (0-1 ft, seconds)</p>
            </div>
            <Tag color="blue">Live</Tag>
          </div>
          <div className="sensor-chart-wrap">
            <div className="sensor-y-axis">
              <span>1.0 ft</span>
              <span>0.5 ft</span>
              <span>0 ft</span>
            </div>
            <div className="sensor-chart-area">
              <svg viewBox="0 0 100 70" className="sensor-chart" role="img" aria-label="Sensor data">
                <polyline points={chartPoints} fill="none" strokeWidth="2.5" />
                <circle
                  cx="100"
                  cy={telemetry.length ? 60 - ((clampValue(telemetry[telemetry.length - 1], 0, 1) - 0) / 1) * 40 : 60}
                  r="2.8"
                />
              </svg>
              <div className="sensor-x-axis">
                {timeLabels.map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-legend">
            <span>Min {Math.min(...telemetry).toFixed(2)} ft</span>
            <span>Max 1.00 ft</span>
            <span>Samples: {telemetry.length} sec</span>
          </div>
        </Card>
      </Content>
    </Layout>
  )
}
