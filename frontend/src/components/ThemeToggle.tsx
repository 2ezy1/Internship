import { Switch, Tooltip } from 'antd'
import { BulbOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useTheme } from '../theme/ThemeContext'

export default function ThemeToggle() {
  const { themeMode, toggleTheme } = useTheme()
  const isDark = themeMode === 'dark'

  return (
    <div className="theme-toggle-container">
      <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        <div className="theme-toggle-pill">
          <BulbOutlined className="theme-toggle-icon-left" />
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
          />
        </div>
      </Tooltip>
    </div>
  )
}
