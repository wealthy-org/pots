'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { useScanHighlight } from '@/hooks/use-scan-highlight'
import { GridCell, type GridCellData } from './grid-cell'

const COLUMNS = 5

export function SquareGrid({
  cells,
  disabled,
  scanning = false,
  onToggle,
}: {
  cells: GridCellData[]
  disabled?: boolean
  /** True while randomness is pending; the scan highlight re-renders only this grid. */
  scanning?: boolean
  onToggle?: (id: number) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scanIndex = useScanHighlight(scanning)
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    switch (event.key) {
      case 'ArrowRight':
        next = Math.min(cells.length - 1, index + 1)
        break
      case 'ArrowLeft':
        next = Math.max(0, index - 1)
        break
      case 'ArrowDown':
        next = Math.min(cells.length - 1, index + COLUMNS)
        break
      case 'ArrowUp':
        next = Math.max(0, index - COLUMNS)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = cells.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    setActiveIndex(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="group"
      aria-label="5 by 5 mining grid"
      className="grid grid-cols-5 gap-2 max-md:gap-[5px]"
    >
      {cells.map((cell, index) => (
        <GridCell
          key={cell.id}
          {...cell}
          scan={scanIndex === index}
          disabled={disabled}
          tabIndex={index === activeIndex ? 0 : -1}
          onToggle={onToggle}
          onFocus={() => setActiveIndex(index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          buttonRef={(element) => {
            refs.current[index] = element
          }}
        />
      ))}
    </div>
  )
}
