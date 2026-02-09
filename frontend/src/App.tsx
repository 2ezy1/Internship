import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import Login from './pages/Login'
import Home from './pages/Home'
import DeviceDetails from './pages/DeviceDetails'
import './App.css'

export default function App() {
  return (
    <AntApp>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/devices/:id" element={<DeviceDetails />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AntApp>
  )
}
