import { useState, useEffect } from 'react'
import { Layout, Card, Form, Input, Button, Space, message, Modal, Select, Skeleton, Badge, Tooltip, Dropdown, Empty, Alert, App } from 'antd'
import type { MenuProps } from 'antd'
import axios from 'axios'
import { PlusOutlined, DeleteOutlined, EditOutlined, LogoutOutlined, ExclamationCircleOutlined, SearchOutlined, MoreOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import rs485Image from '../assets/rs485.png'
import '../styles/Home.css'

const { Header, Content, Footer } = Layout

type Device = {
  key: string
  deviceName: string
  ipAddress: string
  type: string
  status: string
  isOnline?: boolean
  lastHeartbeat?: string
  dateInstalled: string
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [filterType, setFilterType] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Online' | 'Warning' | 'Offline'>('All')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { modal } = App.useApp()

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

  const apiBase = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:8000'

  const getDeviceImage = (deviceType: string) => {
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
  }, [])

  const fetchDevices = async () => {
    setFetchLoading(true)
    try {
      console.log('📥 Fetching devices from:', `${apiBase}/devices/`)
      const res = await axios.get(`${apiBase}/devices/`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      })
      console.log('✅ Fetch successful, received:', res.data.length, 'devices')
      console.log('📊 Devices data:', res.data)
      
      // Fetch status for each device
      const devicesWithStatus = await Promise.all(
        res.data.map(async (device: any) => {
          try {
            const statusRes = await axios.get(`${apiBase}/devices/${device.id}/status`)
            return {
              key: String(device.id),
              deviceName: device.device_name,
              ipAddress: device.ip_address,
              type: device.type || 'Generic',
              status: statusRes.data.status || 'Offline',  // Online, Warning, or Offline
              isOnline: statusRes.data.is_online,
              lastHeartbeat: statusRes.data.last_heartbeat,
              dateInstalled: device.date_installed || device.created_at,
            }
          } catch (err) {
            // If status fetch fails, default to offline
            console.warn(`⚠️ Failed to fetch status for device ${device.id}`)
            return {
              key: String(device.id),
              deviceName: device.device_name,
              ipAddress: device.ip_address,
              type: device.type || 'Generic',
              status: 'Offline',
              isOnline: false,
              lastHeartbeat: null,
              dateInstalled: device.date_installed || device.created_at,
            }
          }
        })
      )
      
      setDevices(devicesWithStatus)
      console.log('🔄 State updated with', devicesWithStatus.length, 'devices')
      
      if (devicesWithStatus.length > 0) {
        message.success(`Loaded ${devicesWithStatus.length} device(s)`)
      }
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
      setFetchLoading(false)
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
        
        console.log('✅ CREATE successful, response:', created)
        
        // Add to local state (at the beginning)
        const newDevice = {
          key: String(created.id),
          deviceName: created.device_name,
          ipAddress: created.ip_address,
          type: created.type,
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

  const filteredDevices = devices.filter(device => {
    // Filter by type
    const matchesType = filterType === 'All' || 
      (filterType === 'RS485' && device.type === 'RS485')

    const normalizedStatus = device.status?.toLowerCase() || 'offline'
    const matchesStatus = statusFilter === 'All' ||
      (statusFilter === 'Online' && normalizedStatus === 'online') ||
      (statusFilter === 'Warning' && normalizedStatus === 'warning') ||
      (statusFilter === 'Offline' && normalizedStatus === 'offline')
    
    // Filter by search query
    const matchesSearch = searchQuery === '' || 
      device.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ipAddress.includes(searchQuery)
    
    return matchesType && matchesStatus && matchesSearch
  })
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
    navigate(`/devices/${device.key}`, { state: { device } })
  }

  const totalDevices = devices.length
  const activeDevices = devices.filter((device) => device.status === 'Online').length
  const installsThisMonth = devices.filter((device) => {
    if (!device.dateInstalled) return false
    return dayjs(device.dateInstalled).isSame(dayjs(), 'month')
  }).length

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="home-header">
        <div className="header-left">
          <h1>Device Management System</h1>
        </div>
        <Space size="middle">
          <Input
            placeholder="Search devices..."
            prefix={<SearchOutlined />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Space>
      </Header>

      <Content className="home-content">
        <div className="content-container">
          <div className="dashboard-hero">
            <div className="hero-copy">
              <div className="eyebrow">Monitoring</div>
              <h2>Device monitoring.</h2>
              
            </div>
            <div className="hero-metrics">
              <div className="metric-card">
                <div className="metric-title">Total devices</div>
                <div className="metric-value">{totalDevices}</div>
                <div className="metric-sub">Active: {activeDevices}</div>
              </div>
              <div className="metric-card">
                <div className="metric-title">Installs this month</div>
                <div className="metric-value">{installsThisMonth}</div>
                <div className="metric-sub">New deployments</div>
              </div>
              <div className="metric-card">
                <div className="metric-title">Uptime</div>
                <div className="metric-value">{totalDevices ? Math.round((activeDevices / totalDevices) * 100) : 0}%</div>
                <div className="metric-sub">Last 30 days</div>
              </div>
            </div>
          </div>

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
                      searchQuery || filterType !== 'All' 
                        ? 'No devices match your filters' 
                        : 'No devices yet. Click "Add Device" to get started.'
                    }
                    style={{ padding: '48px 24px' }}
                  >
                    {(searchQuery || filterType !== 'All') && (
                      <Button type="primary" onClick={() => { setSearchQuery(''); setFilterType('All'); }}>
                        Clear Filters
                      </Button>
                    )}
                  </Empty>
                )}
              </>
            )}
          </Card>
        </div>
      </Content>

      <Footer className="home-footer">React + Vite + Ant Design ©2026</Footer>

      <Modal
        title={editingDevice ? "Edit Device" : "Add New Device"}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false)
          setEditingDevice(null)
          setSubmitError(null)
          form.resetFields()
        }}
        footer={null}
        width={500}
        
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
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


