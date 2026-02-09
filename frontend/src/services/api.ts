import axios from 'axios'

const API_BASE_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const deviceAPI = {
  // Create a new device
  createDevice: (deviceData: { device_name: string; ip_address: string; type?: string }) => {
    return api.post('/devices/', deviceData)
  },

  // Get all devices
  getDevices: () => {
    return api.get('/devices/')
  },

  // Get a specific device
  getDevice: (deviceId: number) => {
    return api.get(`/devices/${deviceId}`)
  },

  // Update a device
  updateDevice: (deviceId: number, deviceData: any) => {
    return api.put(`/devices/${deviceId}`, deviceData)
  },

  // Delete a device
  deleteDevice: (deviceId: number) => {
    return api.delete(`/devices/${deviceId}`)
  },

  // Health check
  healthCheck: () => {
    return api.get('/health')
  },
}

export const authAPI = {
  login: (payload: { username: string; password: string }) => {
    return api.post('/auth/login', payload)
  },
}

export default api
