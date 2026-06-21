import { useState, useEffect } from 'react'

function SearchBar({ value, onSearch, placeholder = "Search..." }) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch(localValue)
  }

  const handleClear = () => {
    setLocalValue('')
    onSearch('')
  }

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
      <input
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        style={{
          width: '100%',
          padding: '12px 40px 12px 16px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--surface)',
          color: 'var(--text-main)',
          fontFamily: 'inherit',
          fontSize: '14px'
        }}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: '40px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '16px',
            padding: '4px'
          }}
        >
          ×
        </button>
      )}
      <button
        type="submit"
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--primary)',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
          fontSize: '14px',
          padding: '6px 12px',
          borderRadius: '6px'
        }}
      >
        🔍
      </button>
    </form>
  )
}

export default SearchBar
