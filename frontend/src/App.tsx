import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import Login from './pages/Login'
import Home from './pages/Home'
import DeviceDetails from './pages/DeviceDetails'
import ThemeToggle from './components/ThemeToggle'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import './App.css'

function AppShell() {
  const { themeMode } = useTheme()
  const isDark = themeMode === 'dark'

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#0ea5e9',
          borderRadius: 10,
        },
      }}
    >
      <AntApp>
        <ThemeToggle />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Home />} />
            <Route path="/devices/:id" element={<DeviceDetails />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  )
}
