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
      const response = await authAPI.login({
        username: values.username?.trim(),
        password: values.password,
      })
      
      // Store authentication token
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
      
      message.error(errorMessage, 5) // Show for 5 seconds
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
