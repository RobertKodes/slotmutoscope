import { Connection, type ConfirmedSignatureInfo, type PublicKey } from '@solana/web3.js'

const DEFAULTS = [
  'https://solana-rpc.publicnode.com',
  'https://solana.publicnode.com',
  'https://solana-mainnet.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://solana.drpc.org',
]

/** Strip `solana-client` so public RPCs do not CORS-preflight-fail in the browser. */
function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.delete('solana-client')
  headers.set('content-type', 'application/json')
  return fetch(input, { ...init, headers })
}

export function rpcEndpoints(): string[] {
  const extra = import.meta.env.VITE_RPC_URL
  const list = extra && extra.startsWith('http') ? [extra, ...DEFAULTS] : DEFAULTS
  return [...new Set(list)]
}

export class RpcPool {
  endpoints: string[]
  index = 0
  private conns: Connection[]

  constructor(endpoints: string[]) {
    this.endpoints = endpoints.length ? endpoints : DEFAULTS
    this.conns = this.endpoints.map(
      (url) =>
        new Connection(url, {
          commitment: 'confirmed',
          disableRetryOnRateLimit: true,
          confirmTransactionInitialTimeout: 8000,
          fetch: browserFetch,
        }),
    )
  }

  get url(): string {
    return this.endpoints[this.index % this.endpoints.length]!
  }

  get host(): string {
    try {
      const h = new URL(this.url).host
      if (h.includes('publicnode')) return 'publicnode'
      if (h.includes('mainnet-beta')) return 'official'
      if (h.includes('drpc')) return 'drpc'
      if (h.includes('ankr')) return 'ankr'
      if (h.includes('llamarpc')) return 'llama'
      return h.replace(/^www\./, '').split('.')[0] ?? 'rpc'
    } catch {
      return 'rpc'
    }
  }

  rotate(): string {
    this.index = (this.index + 1) % this.endpoints.length
    return this.url
  }

  private conn(): Connection {
    return this.conns[this.index % this.conns.length]!
  }

  async withRetry<T>(fn: (c: Connection) => Promise<T>): Promise<{ value: T; rttMs: number }> {
    let last: unknown
    for (let i = 0; i < this.endpoints.length; i++) {
      const t0 = performance.now()
      try {
        const value = await fn(this.conn())
        return { value, rttMs: performance.now() - t0 }
      } catch (err) {
        last = err
        this.rotate()
      }
    }
    throw last instanceof Error ? last : new Error('all rpc endpoints failed')
  }

  getSlot() {
    return this.withRetry((c) => c.getSlot('confirmed'))
  }

  getPerf() {
    return this.withRetry((c) => c.getRecentPerformanceSamples(4))
  }

  getFees() {
    return this.withRetry((c) => c.getRecentPrioritizationFees())
  }

  getSigs(address: PublicKey, limit = 16) {
    return this.withRetry((c) => c.getSignaturesForAddress(address, { limit }))
  }
}

export function sampleTps(
  samples: { samplePeriodSecs: number; numTransactions: number; numNonVoteTransactions?: number }[],
): number | null {
  const s = samples[0]
  if (!s || s.samplePeriodSecs <= 0) return null
  const tx = s.numNonVoteTransactions ?? s.numTransactions
  return tx / s.samplePeriodSecs
}

export type PrioFee = { slot: number; prioritizationFee: number }

export function medianFee(fees: PrioFee[]): number | null {
  if (!fees.length) return null
  const vals = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b)
  const mid = Math.floor(vals.length / 2)
  const a = vals[mid]
  const b = vals[mid - 1]
  if (a == null) return null
  if (vals.length % 2 === 0 && b != null) return (a + b) / 2
  return a
}

/** Quiet medians sit at 0; use the hot tail so the crank can still read congestion. */
export function pressureFee(fees: PrioFee[]): number | null {
  if (!fees.length) return null
  const med = medianFee(fees)
  if (med && med > 0) return med
  const vals = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b)
  return vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))] ?? med
}

/** Log-ish 0..1 from micro-lamports per CU. Quiet chain sits low; congestion saturates. */
export function feeNorm(microLamports: number | null): number {
  if (microLamports == null || microLamports <= 0) return 0.1
  return Math.min(1, Math.log10(microLamports + 1) / 6)
}

export type SigInfo = ConfirmedSignatureInfo
