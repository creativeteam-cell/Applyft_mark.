'use client'

import { useRef, useEffect } from 'react'

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
 * Textarea that highlights @name tokens when they match an uploaded asset.
 * Uses the classic "overlay div" technique: a transparent textarea on top
 * of a div that renders the same text with colored spans for matched tokens.
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

  // Sync scroll between textarea and backdrop
  function handleScroll() {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const assetNames = new Set(assets.map(a => a.name.toLowerCase()))

  function renderHighlighted(text: string) {
    // Split on @word tokens
    const parts = text.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const name = part.slice(1).toLowerCase()
        const matched = assetNames.has(name)
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
    fontSize: '0.875rem',   // text-sm
    lineHeight: '1.625',    // leading-relaxed
    padding: '12px 16px',   // px-4 py-3
    letterSpacing: 'normal',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    tabSize: 4,
  }

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden',
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
          // Subtract 2px for the border
          width: 'calc(100% - 2px)',
        }}
      >
        {renderHighlighted(value)}
        {/* Trailing newline so last line renders with correct height */}
        {'\n'}
      </div>

      {/* Actual textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
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
          // Must match shared style exactly
          whiteSpace: 'pre-wrap',
        }}
      />
    </div>
  )
}
