'use client'
import { useTheme } from '../contexts/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      aria-label="Alternar tema"
      style={{
        background: 'none',
        border: 'none',
        fontSize: 18,
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 8,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
