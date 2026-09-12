import { useEffect, useRef, useState } from 'react'
import type { CardSpec } from '../engine/cabinet.ts'
import { type Family, WATCH } from '../lib/programs.ts'
import {
  feeNorm,
  pressureFee,
  RpcPool,
  rpcEndpoints,
  sampleTps,
  type SigInfo,
} from '../lib/rpc.ts'

export type PulseHud = {
  slot: number | null
  tps: number | null
  rttMs: number | null
  host: string
  fee: number
  degraded: boolean
  live: boolean
}

function interleave(items: CardSpec[]): CardSpec[] {
  const buckets = new Map<Family, CardSpec[]>()
  for (const item of items) {
    const list = buckets.get(item.family) ?? []
    list.push(item)
    buckets.set(item.family, list)
  }
  const out: CardSpec[] = []
  let more = true
  while (more) {
    more = false
    for (const list of buckets.values()) {
      const next = list.shift()
      if (next) {
        out.push(next)
        more = true
      }
    }
  }
  return out
}

const EMPTY: PulseHud = {
  slot: null,
  tps: null,
  rttMs: null,
  host: '—',
  fee: 0.1,
  degraded: false,
  live: false,
}

export function useChainPulse(paused: boolean) {
  const [hud, setHud] = useState<PulseHud>(EMPTY)
  const queueRef = useRef<CardSpec[]>([])
  const seenRef = useRef(new Set<string>())
  const poolRef = useRef<RpcPool | null>(null)
  if (!poolRef.current) poolRef.current = new RpcPool(rpcEndpoints())

  useEffect(() => {
    if (paused) return
    const pool = poolRef.current!
    const ac = new AbortController()
    let watchAt = 0
    let lastSlot = -1e12
    let lastPerf = -1e12
    let lastFee = -1e12
    let lastSig = -1e12
    let fails = 0

    const ingest = (sigs: SigInfo[], family: Family) => {
      const seen = seenRef.current
      const fresh: CardSpec[] = []
      for (const s of sigs) {
        if (seen.has(s.signature)) continue
        seen.add(s.signature)
        fresh.push({
          family,
          sig: s.signature,
          failed: s.err != null,
        })
      }
      if (fresh.length) {
        queueRef.current.push(...fresh.reverse())
        if (queueRef.current.length > 96) {
          queueRef.current.splice(0, queueRef.current.length - 96)
        }
        queueRef.current = interleave(queueRef.current)
        if (seen.size > 480) {
          const keep = [...seen].slice(-220)
          seenRef.current = new Set(keep)
        }
      }
    }

    const tick = async () => {
      if (ac.signal.aborted) return
      const now = performance.now()
      try {
        if (now - lastSlot > 420) {
          lastSlot = now
          const { value: slot, rttMs } = await pool.getSlot()
          if (ac.signal.aborted) return
          fails = 0
          setHud((h) => ({
            ...h,
            slot,
            rttMs,
            host: pool.host,
            degraded: false,
            live: true,
          }))
        }
        if (now - lastPerf > 8000) {
          lastPerf = now
          const { value: samples, rttMs } = await pool.getPerf()
          if (ac.signal.aborted) return
          const tps = sampleTps(samples)
          setHud((h) => ({
            ...h,
            tps,
            rttMs: h.rttMs ?? rttMs,
            host: pool.host,
            live: true,
            degraded: false,
          }))
        }
        if (now - lastFee > 6500) {
          lastFee = now
          const { value: fees } = await pool.getFees()
          if (ac.signal.aborted) return
          const pressure = pressureFee(fees)
          setHud((h) => ({
            ...h,
            fee: feeNorm(pressure),
            host: pool.host,
            live: true,
            degraded: false,
          }))
        }
        if (now - lastSig > (watchAt === 0 ? 0 : 1600)) {
          lastSig = now
          const batch = watchAt === 0 ? 4 : 1
          for (let i = 0; i < batch; i++) {
            const watch = WATCH[watchAt % WATCH.length]!
            watchAt += 1
            const { value: sigs } = await pool.getSigs(watch.key, 12)
            if (ac.signal.aborted) return
            ingest(sigs, watch.family)
          }
        }
      } catch {
        fails += 1
        if (fails >= 2) {
          setHud((h) => ({ ...h, degraded: true, live: false }))
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 260)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [paused])

  const pull = (): CardSpec | null => {
    const q = queueRef.current
    if (q.length) return q.shift() ?? null
    return null
  }

  return { hud, pull }
}
