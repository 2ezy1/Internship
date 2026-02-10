import { useState, useEffect } from 'react'
import { Layout, Card, Form, Input, Button, Space, message, Modal, Select, Skeleton, Badge, Tooltip, Dropdown, Empty } from 'antd'
import type { MenuProps } from 'antd'
import axios from 'axios'
import { PlusOutlined, DeleteOutlined, EditOutlined, LogoutOutlined, ExclamationCircleOutlined, SearchOutlined, MoreOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import esp32Image from '../assets/esp32.png'
import arduinoImage from '../assets/arduino.png'
import raspiImage from '../assets/raspi.png'
import '../styles/Home.css'

const { Header, Content, Footer } = Layout

type Device = {
  key: string
  deviceName: string
  ipAddress: string
  type: string
  status: string
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
  const navigate = useNavigate()

  const apiBase = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:8000'

  const getDeviceImage = (deviceType: string) => {
    if (deviceType === 'ESP32') return esp32Image
    if (deviceType === 'Arduino') return arduinoImage
    if (deviceType === 'Raspberry Pi') return raspiImage
    return esp32Image
  }

  const getDeviceTypeColor = (deviceType: string) => {
    if (deviceType === 'ESP32') return '#3b82f6' // Blue
    if (deviceType === 'Arduino') return '#06b6d4' // Cyan
    if (deviceType === 'Raspberry Pi') return '#ec4899' // Pink
    return '#6366f1' // Indigo
  }

  // Fetch devices on component mount
  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    setFetchLoading(true)
    try {
      console.log('📥 Fetching devices from:', `${apiBase}/devices/`)
      const res = await axios.get(`${apiBase}/devices/`)
      console.log('✅ Fetch successful, received:', res.data.length, 'devices')
      console.log('📊 Devices data:', res.data)
      
      const fetchedDevices = res.data.map((device: any) => ({
        key: String(device.id),
        deviceName: device.device_name,
        ipAddress: device.ip_address,
        type: device.type || 'Generic',
        status: 'Active',
        dateInstalled: device.date_installed || device.created_at,
      }))
      
      setDevices(fetchedDevices)
      console.log('🔄 State updated with', fetchedDevices.length, 'devices')
      
      if (fetchedDevices.length > 0) {
        message.success(`Loaded ${fetchedDevices.length} device(s)`)
      }
    } catch (err: any) {
      console.error('❌ Failed to fetch devices:', err)
      message.error('Failed to load devices: ' + (err.message || 'Unknown error'))
    } finally {
      setFetchLoading(false)
    }
  }

  const onAddClick = () => {
    console.log('➕ Add Device button clicked')
    setEditingDevice(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const onEditClick = (device: Device) => {
    console.log('✏️  Edit Device button clicked for ID:', device.key)
    setEditingDevice(device)
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
        
        const res = await axios.put(`${apiBase}/devices/${editingDevice.key}`, payload)
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
        
        const res = await axios.post(`${apiBase}/devices/`, payload)
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
      console.error('❌ Error saving device:', err)
      const msg = err?.response?.data?.detail || err?.message || 'Failed to save device'
      console.error('Error message:', msg)
      message.error(String(msg))
    } finally {
      setLoading(false)
    }
  }

  const onDelete = async (key: string) => {
    console.log('🗑️  DELETE INITIATED - Device ID:', key)
    
    Modal.confirm({
      title: 'Delete Device',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure you want to delete this device? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        console.log('✋ User confirmed DELETE, removing device:', key)
        
        try {
          console.log('📤 Sending DELETE request to backend:', `${apiBase}/devices/${key}`)
          const response = await axios.delete(`${apiBase}/devices/${key}`)
          console.log('✅ DELETE successful, status:', response.status)
          console.log('📊 Server response:', response.data)
          
          // Update state to remove device
          setDevices((prevDevices) => {
            const filtered = prevDevices.filter((d) => d.key !== key)
            console.log('🔄 State updated. Before:', prevDevices.length, 'After:', filtered.length)
            return filtered
          })
          
          message.success('Device deleted successfully')
          console.log('✅ Device ID', key, 'deleted from UI')
        } catch (error: any) {
          console.error('❌ DELETE FAILED:', error)
          const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to delete device'
          console.error('Error details:', errorMsg)
          message.error(errorMsg)
        }
      },
      onCancel() {
        console.log('❌ User cancelled delete')
      },
    })
  }

  const filteredDevices = devices.filter(device => {
    // Filter by type
    const matchesType = filterType === 'All' || 
      (filterType === 'ESP32' && device.type === 'ESP32') ||
      (filterType === 'Arduino' && device.type === 'Arduino') ||
      (filterType === 'Raspberry Pi' && device.type === 'Raspberry Pi')

    const normalizedStatus = device.status?.toLowerCase() || ''
    const matchesStatus = statusFilter === 'All' ||
      (statusFilter === 'Online' && normalizedStatus === 'active') ||
      (statusFilter === 'Warning' && normalizedStatus === 'warning') ||
      (statusFilter === 'Offline' && (normalizedStatus === 'inactive' || normalizedStatus === 'offline'))
    
    // Filter by search query
    const matchesSearch = searchQuery === '' || 
      device.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ipAddress.includes(searchQuery)
    
    return matchesType && matchesStatus && matchesSearch
  })
  const getTypeMenuItems = (selectedType: string): MenuProps['items'] => {
    const allItems: MenuProps['items'] = [
      { key: 'All', label: 'All Devices' },
      { key: 'ESP32', label: 'ESP32' },
      { key: 'Arduino', label: 'Arduino' },
      { key: 'Raspberry Pi', label: 'Raspberry Pi' },
    ]

    return allItems.filter((item) => item?.key !== selectedType)
  }

  const handleTypeSelect: MenuProps['onClick'] = ({ key }) => {
    setFilterType(String(key))
  }


  const handleLogout = () => {
    navigate('/login')
  }

  const handleDeviceClick = (device: Device) => {
    navigate(`/devices/${device.key}`, { state: { device } })
  }

  const totalDevices = devices.length
  const activeDevices = devices.filter((device) => device.status === 'Active').length
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
            style={{ width: 250, color: '#fff' }}
            allowClear
          />
          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{ color: '#fff' }}
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
                        onClick: () => onEditClick(device),
                      },
                      {
                        key: 'delete',
                        label: 'Delete Device',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => onDelete(device.key),
                      },
                    ]

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
                              Status: <Badge status={device.status === 'Active' ? 'success' : 'error'} text={device.status} />
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
                              <Tooltip title={device.status === 'Active' ? 'Online' : 'Offline'}>
                                {device.status === 'Active' ? (
                                  <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
                                ) : (
                                  <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 18 }} />
                                )}
                              </Tooltip>
                              <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
                                <Button
                                  type="text"
                                  icon={<MoreOutlined />}
                                  size="small"
                                  className="more-menu-button"
                                  onClick={(event) => event.stopPropagation()}
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
          form.resetFields()
          
        }}
        footer={null}
        width={500}
        
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
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
              <Select.Option value="ESP32">ESP32</Select.Option>
              <Select.Option value="Raspberry Pi">Raspberry Pi (Raspi)</Select.Option>
              <Select.Option value="Arduino">Arduino</Select.Option>
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
