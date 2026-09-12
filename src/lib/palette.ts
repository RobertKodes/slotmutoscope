/** Named nickelodeon palette — six dyes, no extras. */
export const PALETTE = {
  soot: '#1A1008',
  walnut: '#4A2C18',
  brass: '#C4A46A',
  lamp: '#F0C46A',
  sepia: '#D4B896',
  vermilion: '#A83828',
} as const

export type PaletteName = keyof typeof PALETTE

/** RAY sits between vermilion and walnut — not a seventh brand color. */
export const RAY_EMBER = '#8C4030'
/** Stake is brass dimmed into soot. */
export const STAKE_DIM = '#8A6E42'
/** Unknown is sepia mixed into soot. */
export const UNKNOWN_ASH = '#6A5848'

export const FAMILY_TINT: Record<string, string> = {
  SYS: PALETTE.lamp,
  JUP: PALETTE.brass,
  RAY: RAY_EMBER,
  TKN: PALETTE.sepia,
  STK: STAKE_DIM,
  '???': UNKNOWN_ASH,
}
