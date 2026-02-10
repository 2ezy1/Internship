import axios from 'axios'

// Use environment variable if set, otherwise detect from current host
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE
  }
  // If running on network, use the same host as the frontend
  const host = window.location.hostname
  return `http://${host}:8000`
}

const API_BASE_URL = getApiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add authentication token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

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
