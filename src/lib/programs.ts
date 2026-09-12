import { PublicKey } from '@solana/web3.js'
import {
  FAMILY_TINT,
  PALETTE,
  RAY_EMBER,
  STAKE_DIM,
  UNKNOWN_ASH,
} from './palette.ts'

export type Family = 'SYS' | 'JUP' | 'RAY' | 'TKN' | 'STK' | '???'

export type ProgramWatch = {
  id: string
  key: PublicKey
  family: Family
}

export const FAMILIES: Family[] = ['SYS', 'JUP', 'RAY', 'TKN', 'STK', '???']

const WATCH_RAW: { id: string; family: Family }[] = [
  { id: '11111111111111111111111111111111', family: 'SYS' },
  { id: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', family: 'JUP' },
  { id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', family: 'RAY' },
  { id: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', family: 'RAY' },
  { id: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', family: 'TKN' },
  { id: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', family: 'TKN' },
  { id: 'Stake11111111111111111111111111111111111111', family: 'STK' },
]

export const WATCH: ProgramWatch[] = WATCH_RAW.map((w) => ({
  ...w,
  key: new PublicKey(w.id),
}))

export function familyColor(family: Family): string {
  switch (family) {
    case 'RAY':
      return RAY_EMBER
    case 'STK':
      return STAKE_DIM
    case '???':
      return UNKNOWN_ASH
    default:
      return FAMILY_TINT[family] ?? PALETTE.brass
  }
}

export function familyLabel(family: Family): string {
  switch (family) {
    case 'SYS':
      return 'system'
    case 'JUP':
      return 'JUP'
    case 'RAY':
      return 'RAY'
    case 'TKN':
      return 'token'
    case 'STK':
      return 'stake'
    default:
      return 'unknown'
  }
}
