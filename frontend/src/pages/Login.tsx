import { useState } from 'react'
import { Form, Input, Button, Card, message, Alert } from 'antd'
import {
  UserOutlined,
  LockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import '../styles/Login.css'

export default function Login() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const onFinish = async (values: any) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authAPI.login({
        username: values.username?.trim(),
        password: values.password,
      })

      if (response.data.access_token) {
        localStorage.setItem('token', response.data.access_token)
        localStorage.setItem('username', response.data.username)
        localStorage.setItem('role', response.data.role)
      }

      message.success('Welcome back')
      navigate('/home')
    } catch (error: any) {
      console.error('Login error:', error)
      let errorMessage = 'Login failed. Please check your credentials.'

      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error?.response?.status === 403) {
        errorMessage = 'Access denied. Only authorized accounts can log in.'
      } else if (error?.response?.status === 401) {
        errorMessage = 'Wrong credentials. Please check your username and password.'
      }

      setError(errorMessage)
      message.error(errorMessage, 5)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-surface" aria-hidden="true" />
      <Card className="login-card">
        <div className="brand-tag">Industrial Monitoring Suite</div>

        <div className="login-header">
          <p className="login-kicker">Secure Access Portal</p>
          <h1>Device Management System</h1>
          <p className="login-subtitle">Sign in to continue to your operational dashboard</p>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            className="login-alert"
          />
        )}

        <Form form={form} onFinish={onFinish} layout="vertical" className="login-form">
          <Form.Item
            name="username"
            label={<span className="form-label">Username</span>}
            rules={[{ required: true, message: 'Please enter username' }]}
            className="form-item"
          >
            <Input
              prefix={<UserOutlined style={{ color: '#7f93b8' }} />}
              placeholder="Enter your username"
              size="large"
              className="login-input"
              autoComplete="username"
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span className="form-label">Password</span>}
            rules={[{ required: true, message: 'Please enter password' }]}
            className="form-item"
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#7f93b8' }} />}
              placeholder="Enter your password"
              size="large"
              className="login-input"
              autoComplete="current-password"
              iconRender={(visible) =>
                visible ? (
                  <EyeOutlined style={{ color: '#89a0c8' }} />
                ) : (
                  <EyeInvisibleOutlined style={{ color: '#89a0c8' }} />
                )
              }
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

        <div className="login-meta">
          <span>Authorized users only</span>
          <span className="meta-dot" aria-hidden="true" />
          <span>Encrypted session</span>
        </div>
      </Card>
    </div>
  )
}
