import { useState, useEffect, useMemo, useDeferredValue, useRef, useCallback } from 'react'
import { Layout, Card, Form, Input, Button, Space, message, Modal, Select, Skeleton, Badge, Tooltip, Dropdown, Empty, Alert, App } from 'antd'
import type { MenuProps } from 'antd'
import axios from 'axios'
import { PlusOutlined, DeleteOutlined, EditOutlined, LogoutOutlined, ExclamationCircleOutlined, SearchOutlined, MoreOutlined, CheckCircleOutlined, CloseCircleOutlined, MenuFoldOutlined, MenuUnfoldOutlined, LineChartOutlined, ToolOutlined, BarChartOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import logoImage from '../assets/lo.png'
import rs485Image from '../assets/rs485.png'
import '../styles/Home.css'

const { Header, Content } = Layout

type Device = {
  key: string
  deviceName: string
  ipAddress: string
  type: string
  vfdBrandModel?: string
  status: string
  isOnline?: boolean
  lastHeartbeat?: string
  dateInstalled: string
}

export default function Home() {
  const getStoredBrandModel = (deviceId: string | number) =>
    localStorage.getItem(`device_brand_${deviceId}`) || ''

  const persistBrandModel = (deviceId: string | number, brandModel?: string | null) => {
    const value = (brandModel || '').trim()
    if (!value) return
    localStorage.setItem(`device_brand_${deviceId}`, value)
  }

  const [devices, setDevices] = useState<Device[]>([])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [filterType, setFilterType] = useState<string>('All')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Online' | 'Warning' | 'Offline'>('All')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [vfdBrandOptions, setVfdBrandOptions] = useState<string[]>([])
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [activeSidebarView, setActiveSidebarView] = useState<'overview' | 'equipment' | 'analytics'>('overview')
  const [hiddenRuntimeDeviceKeys, setHiddenRuntimeDeviceKeys] = useState<string[]>([])
  const hoverFrameRef = useRef<number | null>(null)
  const pendingHoverIndexRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const deferredSearchQuery = useDeferredValue(searchQuery)

  /** Build a user-friendly error message from an axios error (handles FastAPI detail string or array). */
  const getErrorMessage = (err: any): string => {
    if (!err) return 'Something went wrong.'
    const detail = err?.response?.data?.detail
    if (detail == null) {
      if (err.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running on ' + apiBase + '?'
      return err?.message || 'Failed to save device.'
    }
    if (Array.isArray(detail)) {
      return detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(' ')
    }
    return String(detail)
  }

  const apiBase =
    (import.meta.env.VITE_API_BASE as string) ||
    `${window.location.protocol}//${window.location.hostname}:8000`

  const getDeviceImage = (_deviceType: string) => {
    return rs485Image
  }

  const getDeviceTypeColor = (deviceType: string) => {
    if (deviceType === 'RS485') return '#06b6d4' // Cyan
    return '#6366f1' // Indigo
  }

  // Fetch devices on component mount
  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('token')
    if (!token) {
      message.warning('Please login first')
      navigate('/login')
      return
    }
    fetchDevices()
    loadVfdBrandOptions()
  }, [])

  const loadVfdBrandOptions = async () => {
    try {
      const response = await fetch('/vfd_brand_model_registers.json')
      const data = (await response.json()) as Record<string, unknown>
      const brands = Object.keys(data || {}).sort((a, b) => a.localeCompare(b))
      setVfdBrandOptions(brands)
    } catch {
      // Fallback options if JSON cannot be loaded
      setVfdBrandOptions(['ABB', 'Delta', 'Fuji', 'Hitachi', 'Mitsubishi', 'Schneider', 'Siemens', 'Yaskawa'])
    }
  }

  const fetchDevices = async (silent = false) => {
    if (!silent) {
      setFetchLoading(true)
    }
    try {
      const res = await axios.get(`${apiBase}/devices/`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      const now = Date.now()
      const warningMs = 60 * 1000
      const offlineMs = 120 * 1000

      const devicesWithStatus = res.data.map((device: any) => {
        const lastHeartbeat = device.last_heartbeat ? new Date(device.last_heartbeat).getTime() : null
        const deltaMs = lastHeartbeat ? now - lastHeartbeat : Number.POSITIVE_INFINITY

        let status = 'Offline'
        if (deltaMs < warningMs) {
          status = 'Online'
        } else if (deltaMs < offlineMs) {
          status = 'Warning'
        }

        return {
          key: String(device.id),
          deviceName: device.device_name,
          ipAddress: device.ip_address,
          type: device.type || 'Generic',
          vfdBrandModel:
            device.vfd_brand_model || device.brand_model || getStoredBrandModel(device.id),
          status,
          isOnline: status === 'Online',
          lastHeartbeat: device.last_heartbeat,
          dateInstalled: device.date_installed || device.created_at,
        }
      })

      setDevices(devicesWithStatus)
    } catch (err: any) {
      console.error('❌ Failed to fetch devices:', err)
      if (err.response?.status === 401) {
        message.error('Session expired. Please login again.')
        localStorage.clear()
        navigate('/login')
        return
      }
      message.error('Failed to load devices: ' + (err.message || 'Unknown error'))
    } finally {
      if (!silent) {
        setFetchLoading(false)
      }
    }
  }

  const onAddClick = () => {
    console.log('➕ Add Device button clicked')
    setEditingDevice(null)
    setSubmitError(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const onEditClick = (device: Device) => {
    console.log('✏️  Edit Device button clicked for ID:', device.key)
    setEditingDevice(device)
    setSubmitError(null)
    form.setFieldsValue({
      deviceName: device.deviceName,
      ipAddress: device.ipAddress,
      type: device.type,
      vfdBrandModel: device.vfdBrandModel || undefined,
    })
    console.log('📋 Form populated with device data:', device)
    setIsModalOpen(true)
  }

  const onFinish = async (values: any) => {
    setLoading(true)
    setSubmitError(null)
    console.log('📝 Form submitted with values:', values)
    
    try {
      const payload = {
        device_name: values.deviceName?.trim(),
        ip_address: values.ipAddress?.trim(),
        type: values.type?.trim() || 'Generic',
        vfd_brand_model: values.vfdBrandModel?.trim() || null,
        date_installed: editingDevice && editingDevice.dateInstalled ? editingDevice.dateInstalled : new Date().toISOString(),
      }
      
      console.log('📦 Payload prepared:', payload)
      
      if (editingDevice) {
        // ========== UPDATE DEVICE ==========
        console.log('✏️  UPDATING device ID:', editingDevice.key)
        console.log('📤 PUT request to:', `${apiBase}/devices/${editingDevice.key}`)
        
        const res = await axios.put(`${apiBase}/devices/${editingDevice.key}`, payload, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        })
        const updated = res.data
        const savedBrand = values.vfdBrandModel?.trim() || ''
        persistBrandModel(editingDevice.key, savedBrand || updated.vfd_brand_model || updated.brand_model)
        
        console.log('✅ UPDATE successful, response:', updated)
        
        // Update in local state
        setDevices((prev) => {
          const updated_devices = prev.map((d) => 
            d.key === editingDevice.key
                ? {
                    key: String(updated.id),
                    deviceName: updated.device_name,
                    ipAddress: updated.ip_address,
                    type: updated.type,
                    vfdBrandModel:
                      updated.vfd_brand_model || updated.brand_model || savedBrand || getStoredBrandModel(updated.id),
                    status: 'Active',
                    dateInstalled: updated.date_installed || updated.created_at,
                  }
              : d
          )
          console.log('🔄 State updated after PUT request')
          return updated_devices
        })
        
        message.success('Device updated successfully')
        console.log('✅ Device updated in UI')
        
      } else {
        // ========== CREATE DEVICE ==========
        console.log('➕ CREATING new device')
        console.log('📤 POST request to:', `${apiBase}/devices/`)
        
        const res = await axios.post(`${apiBase}/devices/`, payload, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        })
        const created = res.data
        const savedBrand = values.vfdBrandModel?.trim() || ''
        persistBrandModel(created.id, savedBrand || created.vfd_brand_model || created.brand_model)
        
        console.log('✅ CREATE successful, response:', created)
        
        // Add to local state (at the beginning)
        const newDevice = {
          key: String(created.id),
          deviceName: created.device_name,
          ipAddress: created.ip_address,
          type: created.type,
          vfdBrandModel:
            created.vfd_brand_model || created.brand_model || savedBrand || getStoredBrandModel(created.id),
          status: 'Active',
          dateInstalled: created.date_installed || created.created_at,
        }
        
        setDevices((prev) => {
          const updated_devices = [newDevice, ...prev]
          console.log('🔄 State updated after POST request. Total devices:', updated_devices.length)
          return updated_devices
        })
        
        message.success('Device added successfully')
        console.log('✅ Device added to UI')
      }
      
      // Reset form and close modal
      form.resetFields()
      setIsModalOpen(false)
      setEditingDevice(null)
      
    } catch (err: any) {
      const msg = getErrorMessage(err)
      console.error('❌ Error saving device:', err)
      console.error('Error message:', msg)
      setSubmitError(msg)
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const onDelete = (key: string) => {
    console.log('🗑️  DELETE INITIATED - Device ID:', key)
    
    modal.confirm({
      title: 'Delete Device',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure you want to delete this device? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk() {
        return handleConfirmDelete(key)
      },
      onCancel() {
        console.log('❌ User cancelled delete')
      },
    })
  }

  const handleConfirmDelete = async (deviceId: string) => {
    console.log('✋ User confirmed DELETE, removing device:', deviceId)
    
    try {
      console.log('📤 Sending DELETE request to backend:', `${apiBase}/devices/${deviceId}`)
      const response = await axios.delete(`${apiBase}/devices/${deviceId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      })
      console.log('✅ DELETE successful, status:', response.status)
      console.log('📊 Server response:', response.data)
      
      // Update state to remove device IMMEDIATELY
      setDevices((prevDevices) => {
        const filtered = prevDevices.filter((d) => d.key !== deviceId)
        console.log('🔄 State updated. Before:', prevDevices.length, 'After:', filtered.length)
        console.log('🗑️  Remaining devices:', filtered.map(d => ({ id: d.key, name: d.deviceName })))
        return filtered
      })
      
      message.success('Device deleted successfully')
      console.log('✅ Device ID', deviceId, 'deleted from UI')
      return true // Resolution without error
    } catch (error: any) {
      console.error('DELETE FAILED:', error)
      const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to delete device'
      console.error('Error details:', errorMsg)
      message.error(errorMsg)
      
      if (error?.response?.status === 401) {
        console.log('🔐 Unauthorized - redirecting to login')
        localStorage.clear()
        navigate('/login')
        return false
      }
      // Don't rethrow - let Modal close so user can try again
      return false
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
    }, 140)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDevices(true)
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const scheduleHoveredDayIndex = useCallback((index: number | null) => {
    pendingHoverIndexRef.current = index
    if (hoverFrameRef.current !== null) {
      return
    }
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null
      setHoveredDayIndex(pendingHoverIndexRef.current)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current)
      }
    }
  }, [])

  const filteredDevices = useMemo(() => {
    const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()
    return devices.filter(device => {
      const matchesType = filterType === 'All' || (filterType === 'RS485' && device.type === 'RS485')
      const normalizedStatus = device.status?.toLowerCase() || 'offline'
      const matchesStatus = statusFilter === 'All' ||
        (statusFilter === 'Online' && normalizedStatus === 'online') ||
        (statusFilter === 'Warning' && normalizedStatus === 'warning') ||
        (statusFilter === 'Offline' && normalizedStatus === 'offline')
      const matchesSearch = normalizedSearchQuery === '' ||
        device.deviceName.toLowerCase().includes(normalizedSearchQuery) ||
        device.ipAddress.includes(normalizedSearchQuery)
      return matchesType && matchesStatus && matchesSearch
    })
  }, [devices, filterType, statusFilter, deferredSearchQuery])

  useEffect(() => {
    setHiddenRuntimeDeviceKeys((prev) =>
      prev.filter((deviceKey) => filteredDevices.some((device) => device.key === deviceKey))
    )
  }, [filteredDevices])

  const vfdSummary = useMemo(() => {
    const summary = { total: devices.length, online: 0, offline: 0, warning: 0 }
    devices.forEach((device) => {
      const normalizedStatus = device.status?.toLowerCase() || 'offline'
      if (normalizedStatus === 'online') summary.online += 1
      else if (normalizedStatus === 'warning') summary.warning += 1
      else summary.offline += 1
    })
    return summary
  }, [devices])
  const getTypeMenuItems = (selectedType: string): MenuProps['items'] => {
    const allItems: MenuProps['items'] = [
      { key: 'All', label: 'All Devices' },
      { key: 'RS485', label: 'RS485' },
    ]

    return allItems.filter((item) => item?.key !== selectedType)
  }

  const handleTypeSelect: MenuProps['onClick'] = ({ key }) => {
    setFilterType(String(key))
  }


  const handleLogout = () => {
    localStorage.clear()
    message.info('Logged out successfully')
    navigate('/login')
  }

  const handleDeviceClick = (device: Device) => {
    if (device.vfdBrandModel) {
      localStorage.setItem(`device_brand_${device.key}`, device.vfdBrandModel)
    }
    navigate(`/devices/${device.key}`, { state: { device } })
  }

  const runtimeLabels = useMemo(() => {
    const labels: string[] = []
    for (let i = 29; i >= 0; i -= 1) {
      labels.push(dayjs().subtract(i, 'day').format('MMM D'))
    }
    return labels
  }, [])

  const runtimeChart = useMemo(() => {
    const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#14b8a6', '#f97316', '#eab308']
    const chartDevices = filteredDevices.slice(0, 8)
    const colorByDeviceKey = new Map(chartDevices.map((device, idx) => [device.key, palette[idx % palette.length]]))
    const selected = chartDevices
    const width = Math.max(1400, runtimeLabels.length * 44 + 96)
    const height = 300
    const padding = { top: 18, right: 18, bottom: 56, left: 44 }
    const innerWidth = width - padding.left - padding.right
    const innerHeight = height - padding.top - padding.bottom
    const maxY = 16

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

    const lines = selected.map((device, idx) => {
      const seed = Number.parseInt(device.key, 10) || idx + 1
      const base = device.status === 'Online' ? 11.5 : device.status === 'Warning' ? 8.8 : 6.2
      const points = runtimeLabels.map((_, i) => {
        const raw = base + Math.sin((i + seed) * 0.47) * 2.6 + Math.cos((i + seed * 2) * 0.19) * 1.4
        const hours = Math.max(0.5, Math.min(maxY, Number(raw.toFixed(1))))
        const ratioX = runtimeLabels.length > 1 ? i / (runtimeLabels.length - 1) : 0
        const x = padding.left + ratioX * innerWidth
        const y = padding.top + (1 - hours / maxY) * innerHeight
        return { x, y, hours }
      })
      return {
        key: device.key,
        name: device.deviceName,
        color: colorByDeviceKey.get(device.key) || palette[idx % palette.length],
        visible: !hiddenRuntimeDeviceKeys.includes(device.key),
        points,
        path: toSmoothPath(points),
      }
    })

    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16].map((v) => ({
        y: padding.top + (1 - v / maxY) * innerHeight,
        label: `${v}h`,
      })),
      lines,
    }
  }, [filteredDevices, runtimeLabels, hiddenRuntimeDeviceKeys])

  const runtimeLegendItems = useMemo(() => {
    const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#14b8a6', '#f97316', '#eab308']
    return filteredDevices.slice(0, 8).map((device, idx) => ({
      key: device.key,
      name: device.deviceName,
      color: palette[idx % palette.length],
    }))
  }, [filteredDevices])

  const runtimeTooltip = useMemo(() => {
    if (hoveredDayIndex === null || runtimeChart.lines.length === 0) return null

    const items = runtimeChart.lines
      .filter((line) => line.visible)
      .map((line) => ({
      name: line.name,
      color: line.color,
      hours: line.points[hoveredDayIndex]?.hours ?? 0,
      x: line.points[hoveredDayIndex]?.x ?? runtimeChart.padding.left,
      }))

    if (items.length === 0) return null

    const totalHours = items.reduce((sum, item) => sum + item.hours, 0)
    const avgHours = items.length ? totalHours / items.length : 0
    const x = items[0]?.x ?? runtimeChart.padding.left
    const boxWidth = 238
    const boxHeight = 48 + items.length * 17
    let boxX = x + 16
    if (boxX + boxWidth > runtimeChart.width - runtimeChart.padding.right) {
      boxX = x - boxWidth - 16
    }
    if (boxX < runtimeChart.padding.left + 4) {
      boxX = runtimeChart.padding.left + 4
    }

    return {
      label: runtimeLabels[hoveredDayIndex],
      x,
      boxX,
      boxY: runtimeChart.padding.top + 8,
      boxWidth,
      boxHeight,
      totalHours,
      avgHours,
      items,
    }
  }, [hoveredDayIndex, runtimeChart, runtimeLabels])

  const analyticsSnapshot = useMemo(() => {
    const totalDevices = devices.length
    const onlineDevices = devices.filter((device) => device.status === 'Online').length
    const warningDevices = devices.filter((device) => device.status === 'Warning').length
    const offlineDevices = Math.max(0, totalDevices - onlineDevices - warningDevices)

    const uptimeRatio = totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0
    const warningRatio = totalDevices > 0 ? (warningDevices / totalDevices) * 100 : 0

    const deviceRuntimeTotals = runtimeChart.lines.map((line) => {
      const totalHours = line.points.reduce((sum, point) => sum + point.hours, 0)
      return {
        key: line.key,
        name: line.name,
        totalHours,
      }
    })

    const fleetTotalHours = deviceRuntimeTotals.reduce((sum, device) => sum + device.totalHours, 0)
    const fleetAvgHoursPerDevice =
      deviceRuntimeTotals.length > 0 ? fleetTotalHours / deviceRuntimeTotals.length : 0

    const dayTotals = runtimeLabels.map((label, index) => {
      const totalHours = runtimeChart.lines.reduce((sum, line) => sum + (line.points[index]?.hours ?? 0), 0)
      return { label, totalHours }
    })

    const peakDay = dayTotals.reduce(
      (best, day) => (day.totalHours > best.totalHours ? day : best),
      { label: runtimeLabels[0] ?? 'N/A', totalHours: 0 }
    )

    const topRuntimeDevices = [...deviceRuntimeTotals].sort((a, b) => b.totalHours - a.totalHours).slice(0, 3)

    const staleDevices = devices
      .map((device) => {
        const heartbeat = device.lastHeartbeat ? dayjs(device.lastHeartbeat) : null
        const minutesSinceHeartbeat = heartbeat && heartbeat.isValid() ? dayjs().diff(heartbeat, 'minute') : null
        return {
          key: device.key,
          name: device.deviceName,
          minutesSinceHeartbeat,
        }
      })
      .filter((device) => device.minutesSinceHeartbeat === null || device.minutesSinceHeartbeat >= 5)
      .sort((a, b) => (b.minutesSinceHeartbeat ?? Number.POSITIVE_INFINITY) - (a.minutesSinceHeartbeat ?? Number.POSITIVE_INFINITY))
      .slice(0, 5)

    return {
      totalDevices,
      onlineDevices,
      warningDevices,
      offlineDevices,
      uptimeRatio,
      warningRatio,
      fleetTotalHours,
      fleetAvgHoursPerDevice,
      peakDay,
      topRuntimeDevices,
      staleDevices,
    }
  }, [devices, runtimeChart.lines, runtimeLabels])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="home-header">
        <div className="home-header-left">
          <img src={logoImage} alt="DMS logo" className="header-brand-logo" />
          <span className="header-brand-subtitle">Device Management System</span>
        </div>
        <Space size="middle">
          <Input
            placeholder="Search devices..."
            prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
        </Space>
      </Header>

      <Layout className="home-main-layout">
        <Layout.Sider
          className="scada-sidebar"
          trigger={null}
          collapsible
          width={286}
          collapsedWidth={78}
          collapsed={sidebarCollapsed && !sidebarHovered}
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <Button
            className="sidebar-collapse-button"
            type="text"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          />
          <div className="scada-nav-list">
            <button
              type="button"
              className={`scada-nav-item ${activeSidebarView === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveSidebarView('overview')}
            >
              <LineChartOutlined />
              {(!sidebarCollapsed || sidebarHovered) && <span>Overview</span>}
            </button>
            <button
              type="button"
              className={`scada-nav-item ${activeSidebarView === 'equipment' ? 'active' : ''}`}
              onClick={() => setActiveSidebarView('equipment')}
            >
              <ToolOutlined />
              {(!sidebarCollapsed || sidebarHovered) && <span>Equipment</span>}
            </button>
            <button
              type="button"
              className={`scada-nav-item ${activeSidebarView === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveSidebarView('analytics')}
            >
              <BarChartOutlined />
              {(!sidebarCollapsed || sidebarHovered) && <span>Analytics</span>}
            </button>
          </div>
          <div className="scada-sidebar-bottom">
            <Button
              className="scada-logout-button"
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              {(!sidebarCollapsed || sidebarHovered) && 'Logout'}
            </Button>
          </div>
        </Layout.Sider>

        <Layout>
          <Content className="home-content">
            <div className="content-container">
          {activeSidebarView === 'overview' && (
            <>
          <Card className="system-overview-card">
            <div className="system-overview-heading">
              <h2>System Overview</h2>
              <p>Real-time monitoring and analytics of your industrial systems</p>
            </div>
          </Card>
          <div className="vfd-summary-row">
            <Card className="vfd-summary-card total">
              <div className="vfd-summary-head">
                <span className="vfd-summary-icon">
                  <ToolOutlined />
                </span>
                <span className="vfd-summary-label">TOTAL VFDS</span>
              </div>
              <div className="vfd-summary-value">{vfdSummary.total}</div>
              <div className="vfd-summary-subtext">Registered in the system</div>
            </Card>
            <Card className="vfd-summary-card online">
              <div className="vfd-summary-head">
                <span className="vfd-summary-icon">
                  <CheckCircleOutlined />
                </span>
                <span className="vfd-summary-label">ONLINE</span>
              </div>
              <div className="vfd-summary-value">{vfdSummary.online}</div>
              <div className="vfd-summary-subtext">Currently connected</div>
            </Card>
            <Card className="vfd-summary-card offline">
              <div className="vfd-summary-head">
                <span className="vfd-summary-icon">
                  <CloseCircleOutlined />
                </span>
                <span className="vfd-summary-label">OFFLINE</span>
              </div>
              <div className="vfd-summary-value">{vfdSummary.offline}</div>
              <div className="vfd-summary-subtext">Connection unavailable</div>
            </Card>
            <Card className="vfd-summary-card warning">
              <div className="vfd-summary-head">
                <span className="vfd-summary-icon">
                  <ExclamationCircleOutlined />
                </span>
                <span className="vfd-summary-label">WARNING</span>
              </div>
              <div className="vfd-summary-value">{vfdSummary.warning}</div>
              <div className="vfd-summary-subtext">Needs attention</div>
            </Card>
          </div>
            </>
          )}
          {activeSidebarView === 'equipment' && (
          <Card
            title="Devices"
            extra={
              <Space>
                <Button onClick={fetchDevices} loading={fetchLoading}>Refresh</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={onAddClick}>
                  Add Device
                </Button>
              </Space>
            }
            className="devices-card"
          >
            <div className="device-filter-row">
              <Dropdown
                menu={{ items: getTypeMenuItems(filterType), onClick: handleTypeSelect }}
                trigger={['hover']}
                placement="bottomLeft"
              >
                <Button className="filter-dropdown" type="default">
                  {filterType === 'All' ? 'All Devices' : filterType}
                </Button>
              </Dropdown>
              <div className="status-chips">
                {['Online', 'Warning', 'Offline'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`status-chip ${statusFilter === status ? 'active' : ''} ${status.toLowerCase()}`}
                    onClick={() => {
                      setStatusFilter((prev) => (prev === status ? 'All' : (status as 'Online' | 'Warning' | 'Offline')))
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            
            {fetchLoading ? (
              <div className="device-grid">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="device-card-skeleton">
                    <Skeleton.Image active style={{ width: '100%', height: 160 }} />
                    <div style={{ padding: '12px 14px' }}>
                      <Skeleton active paragraph={{ rows: 2 }} />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                <div className="device-grid">
                  {filteredDevices.map((device) => {
                    const menuItems: MenuProps['items'] = [
                      {
                        key: 'edit',
                        label: 'Edit Device',
                        icon: <EditOutlined />,
                      },
                      {
                        key: 'delete',
                        label: 'Delete Device',
                        icon: <DeleteOutlined />,
                        danger: true,
                      },
                    ]

                    const handleCardMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'edit') {
                        onEditClick(device)
                        return
                      }
                      if (key === 'delete') {
                        onDelete(device.key)
                      }
                    }

                    return (
                      <div 
                        key={device.key} 
                        className="device-card"
                        style={{ borderTop: `4px solid ${getDeviceTypeColor(device.type)}` }}
                        onClick={() => handleDeviceClick(device)}
                      >
                        <div className="device-card-media">
                          <img src={getDeviceImage(device.type)} alt={device.type} className="device-image" />
                          <div className="device-hover">
                            <div className="device-hover-title">{device.deviceName}</div>
                            <div className="device-hover-row">IP: {device.ipAddress}</div>
                            <div className="device-hover-row">
                              Status: <Badge status={device.status === 'Online' ? 'success' : device.status === 'Warning' ? 'warning' : 'error'} text={device.status} />
                            </div>
                            <div className="device-hover-row">
                              Installed: {device.dateInstalled ? dayjs(device.dateInstalled).format('MMM D, YYYY') : 'Unknown'}
                            </div>
                          </div>
                        </div>
                        <div className="device-card-body">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <div className="device-title">{device.deviceName}</div>
                              <div className="device-subtitle">{device.type}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Tooltip title={device.status}>
                                {device.status === 'Online' ? (
                                  <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
                                ) : device.status === 'Warning' ? (
                                  <ExclamationCircleOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                                ) : (
                                  <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 18 }} />
                                )}
                              </Tooltip>
                              <Dropdown
                                menu={{ items: menuItems, onClick: handleCardMenuClick }}
                                trigger={['click']}
                                placement="bottomRight"
                              >
                                <Button
                                  type="text"
                                  icon={<MoreOutlined />}
                                  size="small"
                                  className="more-menu-button"
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                />
                              </Dropdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {filteredDevices.length === 0 && (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      searchInput || filterType !== 'All' 
                        ? 'No devices match your filters' 
                        : 'No devices yet. Click "Add Device" to get started.'
                    }
                    style={{ padding: '48px 24px' }}
                  >
                    {(searchInput || filterType !== 'All') && (
                      <Button type="primary" onClick={() => { setSearchInput(''); setSearchQuery(''); setFilterType('All'); }}>
                        Clear Filters
                      </Button>
                    )}
                  </Empty>
                )}
              </>
            )}
          </Card>
          )}

          {activeSidebarView === 'analytics' && (
            <Card className="analytics-insight-card">
              <div className="analytics-insight-header">
                <h2>Analytics Insights</h2>
                <p>Operational health and 30-day runtime intelligence across your fleet.</p>
              </div>

              <div className="analytics-kpi-grid">
                <div className="analytics-kpi-item">
                  <div className="analytics-kpi-label">Fleet Uptime</div>
                  <div className="analytics-kpi-value">{analyticsSnapshot.uptimeRatio.toFixed(1)}%</div>
                  <div className="analytics-kpi-sub">
                    {analyticsSnapshot.onlineDevices}/{analyticsSnapshot.totalDevices} devices online
                  </div>
                </div>
                <div className="analytics-kpi-item">
                  <div className="analytics-kpi-label">Warning Rate</div>
                  <div className="analytics-kpi-value">{analyticsSnapshot.warningRatio.toFixed(1)}%</div>
                  <div className="analytics-kpi-sub">{analyticsSnapshot.warningDevices} device(s) need attention</div>
                </div>
                <div className="analytics-kpi-item">
                  <div className="analytics-kpi-label">Avg Runtime / Device</div>
                  <div className="analytics-kpi-value">{analyticsSnapshot.fleetAvgHoursPerDevice.toFixed(1)}h</div>
                  <div className="analytics-kpi-sub">Based on displayed 30-day trend data</div>
                </div>
                <div className="analytics-kpi-item">
                  <div className="analytics-kpi-label">Peak Runtime Day</div>
                  <div className="analytics-kpi-value">{analyticsSnapshot.peakDay.label}</div>
                  <div className="analytics-kpi-sub">{analyticsSnapshot.peakDay.totalHours.toFixed(1)}h total fleet runtime</div>
                </div>
              </div>

              <div className="analytics-detail-grid">
                <div className="analytics-detail-panel">
                  <div className="analytics-panel-title">Top Runtime Devices</div>
                  {analyticsSnapshot.topRuntimeDevices.length === 0 ? (
                    <div className="analytics-empty">No runtime data available.</div>
                  ) : (
                    analyticsSnapshot.topRuntimeDevices.map((device, index) => (
                      <div key={device.key} className="analytics-row">
                        <span className="analytics-row-rank">#{index + 1}</span>
                        <span className="analytics-row-name">{device.name}</span>
                        <span className="analytics-row-value">{device.totalHours.toFixed(1)}h</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="analytics-detail-panel">
                  <div className="analytics-panel-title">Stale Heartbeat Watchlist</div>
                  {analyticsSnapshot.staleDevices.length === 0 ? (
                    <div className="analytics-empty">All tracked devices reported heartbeat recently.</div>
                  ) : (
                    analyticsSnapshot.staleDevices.map((device) => (
                      <div key={device.key} className="analytics-row">
                        <span className="analytics-row-name">{device.name}</span>
                        <span className="analytics-row-value">
                          {device.minutesSinceHeartbeat === null
                            ? 'No heartbeat yet'
                            : `${device.minutesSinceHeartbeat} min ago`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="analytics-footnote">
                Offline devices: {analyticsSnapshot.offlineDevices} | Fleet runtime (last 30 days):{' '}
                {analyticsSnapshot.fleetTotalHours.toFixed(1)}h
              </div>
            </Card>
          )}

          {(activeSidebarView === 'overview' || activeSidebarView === 'analytics') && (
          <Card className="runtime-overview-card">
            <div className="runtime-overview-header">
              <div className="runtime-overview-title">Running Time (Last 30 Days)</div>
              <div className="runtime-overview-subtitle">
                One graph for all devices. One line per device.
              </div>
            </div>

            {runtimeLegendItems.length > 0 && (
              <div className="runtime-overview-legend">
                {runtimeLegendItems.map((line) => (
                  <button
                    type="button"
                    className={`runtime-legend-item ${!hiddenRuntimeDeviceKeys.includes(line.key) ? 'active' : 'muted'}`}
                    key={line.key}
                    onClick={() =>
                      setHiddenRuntimeDeviceKeys((prev) =>
                        prev.includes(line.key)
                          ? prev.filter((key) => key !== line.key)
                          : [...prev, line.key]
                      )
                    }
                  >
                    <span className="runtime-legend-dot" style={{ background: line.color }} />
                    <span>{line.name}</span>
                  </button>
                ))}
              </div>
            )}

            {runtimeLegendItems.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No devices available to plot running time."
                style={{ padding: '28px 12px' }}
              />
            ) : runtimeChart.lines.filter((line) => line.visible).length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="All lines are hidden. Click a device name above to show its line."
                style={{ padding: '28px 12px' }}
              />
            ) : (
              <>
                <div className="runtime-overview-chart-wrap">
                  <svg
                    className="runtime-overview-chart"
                    viewBox={`0 0 ${runtimeChart.width} ${runtimeChart.height}`}
                    style={{ width: `${runtimeChart.width}px` }}
                    role="img"
                    aria-label="Running time chart for all devices over last 30 days"
                    onMouseLeave={() => scheduleHoveredDayIndex(null)}
                  >
                    {runtimeChart.ticks.map((tick) => (
                      <g key={tick.label}>
                        <line
                          x1={runtimeChart.padding.left}
                          y1={tick.y}
                          x2={runtimeChart.width - runtimeChart.padding.right}
                          y2={tick.y}
                          className="runtime-grid-line"
                        />
                        <text x={10} y={tick.y + 4} className="runtime-axis-text">
                          {tick.label}
                        </text>
                      </g>
                    ))}

                    {runtimeChart.lines.map((line) => (
                      <g key={`line-${line.key}`}>
                        {line.visible && (
                          <>
                            <path d={line.path} className="runtime-line" style={{ stroke: line.color }} />
                            {line.points.map((p, i) => (
                              <circle
                                key={`${line.key}-${i}`}
                                cx={p.x}
                                cy={p.y}
                                r={hoveredDayIndex === i ? '4' : '2.7'}
                                className="runtime-point"
                                style={{ stroke: line.color }}
                                onMouseEnter={() => scheduleHoveredDayIndex(i)}
                              />
                            ))}
                          </>
                        )}
                      </g>
                    ))}

                    {runtimeLabels.map((label, i) => {
                      const step = runtimeLabels.length > 1 ? runtimeChart.innerWidth / (runtimeLabels.length - 1) : runtimeChart.innerWidth
                      const x = runtimeChart.padding.left + (runtimeLabels.length > 1 ? i * step : 0)
                      const bandX = runtimeLabels.length > 1 ? x - step / 2 : runtimeChart.padding.left
                      const bandWidth = runtimeLabels.length > 1 ? step : runtimeChart.innerWidth
                      return (
                        <rect
                          key={`hover-band-${label}-${i}`}
                          x={Math.max(runtimeChart.padding.left, bandX)}
                          y={runtimeChart.padding.top}
                          width={bandWidth}
                          height={runtimeChart.innerHeight}
                          className="runtime-hover-band"
                          onMouseEnter={() => scheduleHoveredDayIndex(i)}
                        />
                      )
                    })}

                    {runtimeTooltip && (
                      <g>
                        <line
                          x1={runtimeTooltip.x}
                          y1={runtimeChart.padding.top}
                          x2={runtimeTooltip.x}
                          y2={runtimeChart.padding.top + runtimeChart.innerHeight}
                          className="runtime-hover-line"
                        />
                        <rect
                          x={runtimeTooltip.boxX}
                          y={runtimeTooltip.boxY}
                          width={runtimeTooltip.boxWidth}
                          height={runtimeTooltip.boxHeight}
                          rx="10"
                          className="runtime-tooltip-bg"
                        />
                        <text
                          x={runtimeTooltip.boxX + 10}
                          y={runtimeTooltip.boxY + 18}
                          className="runtime-tooltip-title"
                        >
                          {runtimeTooltip.label}
                        </text>
                        <text
                          x={runtimeTooltip.boxX + 10}
                          y={runtimeTooltip.boxY + 34}
                          className="runtime-tooltip-sub"
                        >
                          Total {runtimeTooltip.totalHours.toFixed(1)}h | Avg {runtimeTooltip.avgHours.toFixed(1)}h
                        </text>
                        {runtimeTooltip.items.map((item, idx) => (
                          <text
                            key={`tip-${item.name}`}
                            x={runtimeTooltip.boxX + 10}
                            y={runtimeTooltip.boxY + 52 + idx * 16}
                            className="runtime-tooltip-item"
                            style={{ fill: item.color }}
                          >
                            {item.name}: {item.hours.toFixed(1)}h
                          </text>
                        ))}
                      </g>
                    )}

                    {runtimeLabels.map((label, i) => {
                      const ratioX = runtimeLabels.length > 1 ? i / (runtimeLabels.length - 1) : 0
                      const x = runtimeChart.padding.left + ratioX * (runtimeChart.width - runtimeChart.padding.left - runtimeChart.padding.right)
                      return (
                        <text key={`${label}-${i}`} x={x} y={runtimeChart.height - 14} textAnchor="middle" className="runtime-x-text">
                          {label}
                        </text>
                      )
                    })}
                  </svg>
                </div>
              </>
            )}
          </Card>
          )}
            </div>
          </Content>
        </Layout>
      </Layout>

      <Modal
        title={editingDevice ? "Edit Device" : "Add New Device"}
        open={isModalOpen}
        className="device-modal"
        onCancel={() => {
          setIsModalOpen(false)
          setEditingDevice(null)
          setSubmitError(null)
          form.resetFields()
        }}
        footer={null}
        width={500}
        
      >
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} className="device-modal-form">
          {submitError && (
            <Alert
              type="error"
              message="Submission failed"
              description={submitError}
              showIcon
              closable
              onClose={() => setSubmitError(null)}
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="deviceName"
            label="Device Name"
            rules={[{ required: true, message: 'Please enter device name' }]}
          >
            <Input placeholder="e.g., Server-01" />
          </Form.Item>

          <Form.Item
            name="ipAddress"
            label="IP Address"
            rules={[
              { required: true, message: 'Please enter IP address' },
              {
                pattern: /^(\d{1,3}\.){3}\d{1,3}$/,
                message: 'Please enter a valid IP address',
              },
            ]}
          >
            <Input placeholder="e.g., 192.168.1.100" />
          </Form.Item>

          <Form.Item name="type" label="Device Type" rules={[{ required: true, message: 'Please select device type' }]}>
            <Select placeholder="Select device type">
              <Select.Option value="RS485">RS485</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="vfdBrandModel"
            label="VFD Brand/Model"
            rules={[{ required: true, message: 'Please select VFD brand/model' }]}
          >
            <Select placeholder="Select VFD brand/model" showSearch optionFilterProp="label">
              {vfdBrandOptions.map((brand) => (
                <Select.Option key={brand} value={brand} label={brand}>
                  {brand}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                Submit
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}


