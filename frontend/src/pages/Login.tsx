import { useState } from 'react'
import { Form, Input, Button, message, Alert } from 'antd'
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
        errorMessage = 'Access denied. Please check your account permissions.'
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
      <div className="login-panel">
        <div className="login-left">
          <h1 className="login-title">Sign In</h1>

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

          <Form form={form} onFinish={onFinish} className="login-form">
            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Please enter username' }]}
              className="form-item"
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Username"
                size="large"
                className="login-input"
                autoComplete="username"
                allowClear
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Please enter password' }]}
              className="form-item"
            >
              <Input.Password
                placeholder="Password"
                size="large"
                className="login-input"
                autoComplete="current-password"
                iconRender={(visible) =>
                  visible ? (
                    <EyeOutlined />
                  ) : (
                    <EyeInvisibleOutlined />
                  )
                }
                prefix={<LockOutlined />}
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
                Login
              </Button>
            </Form.Item>
          </Form>

        </div>

        <div className="login-right">
          <h2>WELCOME</h2>
        </div>
      </div>
    </div>
  )
}
