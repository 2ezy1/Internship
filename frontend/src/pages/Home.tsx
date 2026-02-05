import { useState, useEffect } from 'react'
import { Layout, Card, Form, Input, Button, Table, Space, message, Modal } from 'antd'
import axios from 'axios'
import { PlusOutlined, DeleteOutlined, EditOutlined, LogoutOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import '../styles/Home.css'

const { Header, Content, Footer } = Layout

type Device = {
  key: string
  deviceName: string
  ipAddress: string
  type: string
  status: string
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const navigate = useNavigate()

  const apiBase = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:8000'

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
    
    // Use native confirm dialog (works reliably without Ant Design context issues)
    const confirmed = window.confirm('Are you sure you want to delete this device? This action cannot be undone.')
    
    if (!confirmed) {
      console.log('❌ User cancelled delete')
      return
    }
    
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
  }

  const columns = [
    {
      title: 'Device Name',
      dataIndex: 'deviceName',
      key: 'deviceName',
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <span
          style={{
            color: status === 'Active' ? '#52c41a' : '#f5222d',
            fontWeight: 600,
          }}
        >
          {status}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Device) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEditClick(record)}
          >
            Edit
          </Button>
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record.key)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ]

  const handleLogout = () => {
    navigate('/login')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="home-header">
        <div className="header-left">
          <h1>Device Management System</h1>
        </div>
        <Button
          type="text"
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{ color: '#fff' }}
        >
          Logout
        </Button>
      </Header>

      <Content className="home-content">
        <div className="content-container">
          <Card
            title="Devices"
            extra={
              <Space>
                <Button onClick={fetchDevices}>Refresh</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={onAddClick}>
                  Add Device
                </Button>
              </Space>
            }
            className="devices-card"
          >
            <Table<Device> 
              dataSource={devices} 
              columns={columns} 
              pagination={{ pageSize: 10 }} 
              loading={fetchLoading}
            />
            {!fetchLoading && devices.length === 0 && (
              <div className="empty-state">
                <p>No devices yet. Click "Add Device" to get started.</p>
              </div>
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

          <Form.Item name="type" label="Device Type" rules={[{ required: true }]}>
            <Input placeholder="e.g., Server, Laptop, Router" />
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
