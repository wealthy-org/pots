export const INDEXES = Array.from({ length: 25 }, (_, index) => index + 1)

function position(square: number): { row: number; column: number } {
  return { row: Math.floor((square - 1) / 5), column: (square - 1) % 5 }
}

export const PRESETS = {
  odd: INDEXES.filter((square) => square % 2 === 1),
  even: INDEXES.filter((square) => square % 2 === 0),
  diamond: INDEXES.filter((square) => {
    const { row, column } = position(square)
    return Math.abs(row - 2) + Math.abs(column - 2) <= 2
  }),
  ring: INDEXES.filter((square) => {
    const { row, column } = position(square)
    return row === 0 || row === 4 || column === 0 || column === 4
  }),
} as const

export type PresetName = keyof typeof PRESETS

export const PRESET_LABELS: Record<PresetName, string> = {
  odd: 'Odd',
  even: 'Even',
  diamond: 'Diamond',
  ring: 'Ring',
}
