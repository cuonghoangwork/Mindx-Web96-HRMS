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
          border: '1px solid var(--bdr-subtle)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          color: 'var(--txt-primary)',
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--fs-md)'
        }}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '40px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--txt-secondary)',
            display: 'inline-flex',
            padding: '4px'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      <button
        type="submit"
        aria-label="Search"
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--bg-primary)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--txt-on-brand)',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </button>
    </form>
  )
}

export default SearchBar
