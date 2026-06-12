'use client'

import { useRef, useState } from 'react'

interface Asset {
  name: string
  base64: string
}

interface HighlightTextareaProps {
  value: string
  onChange: (v: string) => void
  assets: Asset[]
  placeholder?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  borderColor?: string
}

/**
 * Textarea with:
 * - @name token highlighting (matched assets get accent underline + bg)
 * - Autocomplete dropdown when typing @... — shows matching asset names
 */
export function HighlightTextarea({
  value,
  onChange,
  assets,
  placeholder,
  rows = 4,
  onKeyDown,
  onFocus,
  onBlur,
  borderColor,
}: HighlightTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Asset[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  // Start index in value of the current @token the cursor is inside
  const [atStart, setAtStart] = useState<number | null>(null)

  // Sync scroll between textarea and backdrop
  function handleScroll() {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // ── Detect @partial at cursor and update suggestions ──────────────────────
  function computeSuggestions() {
    const el = textareaRef.current
    if (!el || assets.length === 0) { setSuggestions([]); setAtStart(null); return }

    const cursor = el.selectionStart
    const before = value.slice(0, cursor)
    const match = before.match(/@(\w*)$/)

    if (!match) { setSuggestions([]); setAtStart(null); return }

    const partial = match[1].toLowerCase()
    const tokenStart = before.length - match[0].length
    const filtered = assets.filter(a => a.name.toLowerCase().startsWith(partial))

    setSuggestions(filtered)
    setAtStart(filtered.length > 0 ? tokenStart : null)
    setSelectedSuggestion(0)
  }

  // ── Insert chosen @name ───────────────────────────────────────────────────
  function applySuggestion(asset: Asset) {
    if (atStart === null) return

    const el = textareaRef.current
    const cursor = el?.selectionStart ?? 0
    const before = value.slice(0, atStart)
    const after = value.slice(cursor)
    const inserted = `@${asset.name} `
    onChange(before + inserted + after)

    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + inserted.length
        textareaRef.current.selectionStart = pos
        textareaRef.current.selectionEnd = pos
        textareaRef.current.focus()
      }
    }, 0)

    setSuggestions([])
    setAtStart(null)
  }

  // ── Key handling ──────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestion(i => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestion(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applySuggestion(suggestions[selectedSuggestion])
        return
      }
      if (e.key === 'Escape') {
        setSuggestions([])
        setAtStart(null)
        return
      }
    }
    onKeyDown?.(e)
  }

  // ── Highlight rendering ───────────────────────────────────────────────────
  const assetNames = new Set(assets.map(a => a.name.toLowerCase()))

  function renderHighlighted(text: string) {
    const parts = text.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const matched = assetNames.has(part.slice(1).toLowerCase())
        return (
          <mark
            key={i}
            style={{
              background: matched ? 'rgba(99,102,241,0.22)' : 'transparent',
              borderBottom: matched ? '2px solid var(--accent)' : 'none',
              borderRadius: matched ? '3px 3px 0 0' : 0,
              color: 'transparent',
              padding: 0,
            }}
          >
            {part}
          </mark>
        )
      }
      return <span key={i} style={{ color: 'transparent' }}>{part}</span>
    })
  }

  const sharedStyle: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    lineHeight: '1.625',
    padding: '12px 16px',
    letterSpacing: 'normal',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    tabSize: 4,
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Input wrapper */}
      <div style={{
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${borderColor || 'var(--border)'}`,
        background: 'var(--surface)',
        transition: 'border-color 0.15s',
      }}>
        {/* Highlight backdrop */}
        <div
          ref={backdropRef}
          aria-hidden
          style={{
            ...sharedStyle,
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: 1,
            width: 'calc(100% - 2px)',
          }}
        >
          {renderHighlighted(value)}
          {'\n'}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => { onChange(e.target.value); setTimeout(computeSuggestions, 0) }}
          onKeyDown={handleKeyDown}
          onKeyUp={computeSuggestions}
          onClick={computeSuggestions}
          onScroll={handleScroll}
          onFocus={onFocus}
          onBlur={() => {
            // Delay so click on suggestion fires first
            setTimeout(() => { setSuggestions([]); setAtStart(null) }, 150)
            onBlur?.()
          }}
          placeholder={placeholder}
          rows={rows}
          style={{
            ...sharedStyle,
            position: 'relative',
            zIndex: 2,
            display: 'block',
            width: '100%',
            background: 'transparent',
            color: 'var(--text)',
            caretColor: 'var(--text)',
            outline: 'none',
            resize: 'none',
            border: 'none',
            whiteSpace: 'pre-wrap',
          }}
        />
      </div>

      {/* Autocomplete dropdown — floats above the textarea */}
      {suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: 180,
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--surface)',
            border: '1px solid var(--accent)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {suggestions.map((asset, i) => (
            <button
              key={asset.name}
              type="button"
              onMouseDown={e => { e.preventDefault(); applySuggestion(asset) }}
              onMouseEnter={() => setSelectedSuggestion(i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              style={{
                background: i === selectedSuggestion ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: 'var(--text)',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <img src={asset.base64} alt={asset.name}
                className="w-6 h-6 rounded object-cover flex-shrink-0" />
              <span className="font-mono" style={{ color: 'var(--accent)' }}>@{asset.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
