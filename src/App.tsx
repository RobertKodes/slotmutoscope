import { useCallback, useEffect, useRef, useState } from 'react'
import { MutoscopeCabinet } from './engine/cabinet.ts'
import { useChainPulse } from './hooks/useChainPulse.ts'
import { FAMILIES, familyColor, familyLabel, type Family } from './lib/programs.ts'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<MutoscopeCabinet | null>(null)
  if (!boxRef.current) boxRef.current = new MutoscopeCabinet()

  const reduced = usePrefersReducedMotion()
  const [shut, setShut] = useState(false)
  const shutRef = useRef(false)
  const reducedRef = useRef(reduced)
  shutRef.current = shut
  reducedRef.current = reduced

  const { hud, pull } = useChainPulse(shut)
  const pullRef = useRef(pull)
  pullRef.current = pull
  const hudRef = useRef(hud)
  hudRef.current = hud

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    const box = boxRef.current!
    let raf = 0
    let last = performance.now()

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      const cssW = Math.max(1, rect.width)
      const cssH = Math.max(1, rect.height)
      const w = Math.max(1, Math.floor(cssW * dpr))
      const h = Math.max(1, Math.floor(cssH * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas.parentElement ?? canvas)

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const pulse = hudRef.current
      box.frozen = shutRef.current
      box.shuttered = shutRef.current
      box.reduced = reducedRef.current
      box.tps = pulse.tps
      box.fee = pulse.fee
      box.live = pulse.live
      box.degraded = pulse.degraded
      if (pulse.slot != null) box.setSlot(pulse.slot, now)
      box.step(dt, now, () => pullRef.current())
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      box.draw(ctx, rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2), now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const toggleShut = useCallback(() => {
    setShut((s) => !s)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      toggleShut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleShut])

  const slot = hud.slot != null ? hud.slot.toLocaleString('en-US') : '—'
  const tps = hud.tps != null ? Math.round(hud.tps).toLocaleString('en-US') : '—'
  const rtt = hud.rttMs != null ? `${Math.round(hud.rttMs)}` : '—'
  const live = hud.live && !shut

  return (
    <div className={`parlor${shut ? ' shut' : ''}`}>
      <div className="stage">
        <canvas ref={canvasRef} className="eye" aria-hidden />
      </div>

      <header className="mast">
        <p className="kicker">coal-oil · velvet hood · confirmed slot · mainnet</p>
        <h1>Slotmutoscope</h1>
        <p className="lede">the chain, as a nickelodeon peephole</p>
      </header>

      <aside className="ticket" aria-label="instrument strip">
        <p className="ticket-mark">RK · REEL 01 · {hud.degraded ? 'degraded' : hud.host}</p>

        <button
          type="button"
          className={`shutter-key${shut ? ' on' : ''}`}
          onClick={toggleShut}
          aria-pressed={shut}
        >
          <span className="lever" aria-hidden>
            <i />
          </span>
          <span className="shutter-copy">
            <em>{shut ? 'closed' : 'open'}</em>
            {shut ? 'OPEN' : 'SHUTTER'}
          </span>
        </button>

        <dl className="strip">
          <Readout k="slot" v={slot} live={live} />
          <Readout k="approx tps" v={tps} live={live} />
          <Readout k="rpc rtt" v={rtt} unit="ms" live={live} />
        </dl>

        <div className="heat" aria-hidden>
          <span>idle</span>
          <i>
            <b style={{ width: `${Math.round(hud.fee * 100)}%` }} />
          </i>
          <span>busy</span>
        </div>

        <ul className="legend">
          {FAMILIES.map((f) => (
            <li key={f}>
              <i style={{ background: familyColor(f as Family) }} />
              {familyLabel(f as Family)}
            </li>
          ))}
          <li>
            <i className="fail" />
            torn / jam
          </li>
        </ul>

        <p className="hint">
          Space drops the shutter and holds the strip. Open to resume the live reel.
        </p>
      </aside>
    </div>
  )
}

function Readout({
  k,
  v,
  unit,
  live,
}: {
  k: string
  v: string
  unit?: string
  live: boolean
}) {
  return (
    <div className={`read${live ? ' live' : ''}`}>
      <dt>{k}</dt>
      <dd>
        {v}
        {unit ? <em>{unit}</em> : null}
      </dd>
    </div>
  )
}
