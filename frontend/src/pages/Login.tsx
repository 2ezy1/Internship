import { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import '../styles/Login.css'

export default function Login() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = async (values: any) => {
    setLoading(true)
    try {
      await authAPI.login({
        username: values.username?.trim(),
        password: values.password,
      })
      message.success('Welcome back')
      navigate('/home')
    } catch (error: any) {
      const isLocal = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname)
      if (isLocal) {
        message.warning('Backend unavailable. Using local-only access.')
        navigate('/home')
        return
      }
      const detail = error?.response?.data?.detail || 'Invalid username or password'
      message.error(String(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <h1>Device</h1>
          <h1>Management</h1>
          <h1>System</h1>
        </div>
        <p className="login-subtitle">Sign in to your account</p>

        <Form form={form} onFinish={onFinish} layout="vertical" className="login-form">
          <Form.Item
            name="username"
            label={<span className="form-label">Username</span>}
            rules={[{ required: true, message: 'Please enter username' }]}
            className="form-item"
          >
            <Input
              prefix={<UserOutlined style={{ color: '#999' }} />}
              placeholder=""
              size="large"
              className="login-input"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span className="form-label">Password</span>}
            rules={[{ required: true, message: 'Please enter password' }]}
            className="form-item"
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder=""
              size="large"
              className="login-input"
              iconRender={(visible) => (visible ? '👁' : '👁‍🗨')}
            />
          </Form.Item>

          <Form.Item className="button-item">
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              className="login-button"
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>

      </Card>
    </div>
  )
}
