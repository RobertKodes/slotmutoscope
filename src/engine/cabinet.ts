import { familyColor, familyLabel, type Family } from '../lib/programs.ts'
import { PALETTE } from '../lib/palette.ts'

export type CardSpec = {
  family: Family
  sig: string
  failed: boolean
}

type Wear = 'none' | 'torn' | 'ear' | 'jam'

type Card = CardSpec & {
  wear: Wear
  serial: string
}

const FLIP_S = 0.22
const JAM_STICK = 0.7
const LINGER_FAIL = 480
const BLANK_MS = 110
const CRANK_STEP = (Math.PI * 2) / 14

function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeOutBack(t: number): number {
  const c = 1.35
  return 1 + c * (t - 1) ** 3 + (c + 1) * (t - 1) ** 2
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function wearOf(sig: string, failed: boolean): Wear {
  if (!failed) return 'none'
  const n = hash32(sig) % 3
  if (n === 0) return 'torn'
  if (n === 1) return 'ear'
  return 'jam'
}

function placeholder(slot: number): Card {
  const serial = String(slot % 10000).padStart(4, '0')
  return {
    family: '???',
    sig: `wait:${slot}`,
    failed: false,
    wear: 'none',
    serial,
  }
}

function toCard(spec: CardSpec): Card {
  return {
    ...spec,
    wear: wearOf(spec.sig, spec.failed),
    serial: spec.sig.slice(0, 4).toUpperCase(),
  }
}

type Layout = {
  w: number
  h: number
  cx: number
  top: number
  cabW: number
  cabH: number
  holeX: number
  holeY: number
  holeR: number
  crankX: number
  crankY: number
  crankR: number
  lampX: number
  lampY: number
}

export class MutoscopeCabinet {
  frozen = false
  shuttered = false
  reduced = false
  tps: number | null = null
  fee = 0.1
  live = false
  degraded = false
  slot: number | null = null

  private current: Card | null = null
  private outgoing: Card | null = null
  private stack: Card[] = []
  private flip = 1
  private pending = false
  private lingerUntil = 0
  private blankUntil = 0
  private flashing = false
  private crank = 0
  private crankTarget = 0
  private lastSlot = -1
  private shutter = 0
  private flicker = 0

  setSlot(slot: number, now: number) {
    if (slot === this.lastSlot) return
    const first = this.lastSlot < 0
    this.lastSlot = slot
    this.slot = slot
    this.crankTarget += CRANK_STEP
    if (first) {
      this.crank = this.crankTarget
      this.pending = true
      return
    }
    if (this.frozen) return
    this.pending = true
    void now
  }

  step(dt: number, now: number, pull: () => CardSpec | null) {
    const shutGoal = this.shuttered ? 1 : 0
    if (this.reduced) this.shutter = shutGoal
    else this.shutter = lerp(this.shutter, shutGoal, 1 - Math.exp(-dt * 9))

    if (this.reduced || this.frozen) {
      this.crank = this.crankTarget
      this.flip = 1
    } else {
      const k = 1 - Math.exp(-dt * (8 + this.fee * 4))
      this.crank = lerp(this.crank, this.crankTarget, k)
      if (this.flip < 1) {
        const jam = this.current?.wear === 'jam'
        const stuck = jam && this.flip > JAM_STICK && this.flip < JAM_STICK + 0.14
        const rate = stuck ? dt / 0.7 : dt / FLIP_S
        this.flip = Math.min(1, this.flip + rate)
        if (this.flip >= 1) {
          this.flip = 1
          if (this.outgoing) {
            this.stack.unshift(this.outgoing)
            if (this.stack.length > 7) this.stack.length = 7
            this.outgoing = null
          }
          if (this.current?.failed) {
            const extra = this.current.wear === 'jam' ? 260 : 0
            this.lingerUntil = now + LINGER_FAIL + extra
            this.blankUntil = this.lingerUntil + BLANK_MS
          }
        }
      }
    }

    const free =
      this.flip >= 1 &&
      now >= this.lingerUntil &&
      now >= this.blankUntil &&
      !this.frozen

    if (this.pending && (free || this.reduced || (this.frozen && !this.current))) {
      const spec = pull()
      const next = spec ? toCard(spec) : placeholder(this.slot ?? 0)
      if (this.current && !this.reduced && !this.frozen) {
        this.outgoing = this.current
        this.flip = 0
      } else {
        this.flip = 1
      }
      this.current = next
      this.pending = false
      this.flashing = false
    }

    this.flashing = now < this.blankUntil && now >= this.lingerUntil && this.flip >= 1

    if (!this.reduced && !this.frozen) {
      this.flicker = Math.sin(now * 0.011) * 0.5 + Math.sin(now * 0.029) * 0.28
    } else {
      this.flicker = 0
    }
  }

  draw(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, _dpr: number, now: number) {
    const L = this.layout(cssW, cssH)
    ctx.clearRect(0, 0, L.w, L.h)
    this.paintParlor(ctx, L)
    this.paintLampBloom(ctx, L)
    this.paintCabinet(ctx, L)
    this.paintReel(ctx, L)
    this.paintPeephole(ctx, L, now)
    this.paintBezel(ctx, L)
    this.paintShutter(ctx, L)
    this.paintCrank(ctx, L, now)
    this.paintLamp(ctx, L, now)
    this.paintNameplate(ctx, L)
  }

  private layout(w: number, h: number): Layout {
    const cabH = Math.min(h * 0.86, w * 1.05, 760)
    const cabW = cabH * 0.7
    const cx = w * 0.47
    const top = (h - cabH) * 0.58
    const holeR = cabW * 0.27
    const holeX = cx
    const holeY = top + cabH * 0.36
    return {
      w,
      h,
      cx,
      top,
      cabW,
      cabH,
      holeX,
      holeY,
      holeR,
      crankX: cx + cabW * 0.52,
      crankY: holeY + holeR * 0.42,
      crankR: cabW * 0.095,
      lampX: cx,
      lampY: top + cabH * 0.015,
    }
  }

  private paintParlor(ctx: CanvasRenderingContext2D, L: Layout) {
    const g = ctx.createRadialGradient(L.w * 0.4, L.h * 0.18, 10, L.w * 0.5, L.h * 0.5, Math.max(L.w, L.h) * 0.78)
    g.addColorStop(0, '#2a1a0e')
    g.addColorStop(0.4, PALETTE.soot)
    g.addColorStop(1, '#080604')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, L.w, L.h)

    const drape = ctx.createLinearGradient(0, 0, 0, L.h * 0.35)
    drape.addColorStop(0, rgba('#2A1014', 0.55))
    drape.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = drape
    ctx.fillRect(0, 0, L.w, L.h * 0.4)

    ctx.save()
    ctx.globalAlpha = 0.07
    ctx.strokeStyle = PALETTE.walnut
    ctx.lineWidth = 1
    for (let y = L.h * 0.72; y < L.h; y += 7) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(L.w, y + Math.sin(y * 0.2) * 1.5)
      ctx.stroke()
    }
    ctx.restore()
  }

  private paintLampBloom(ctx: CanvasRenderingContext2D, L: Layout) {
    const heat = this.shuttered ? this.fee * 0.28 : 0.32 + this.fee * 0.7
    const flick = this.reduced ? 0 : this.flicker * this.fee * 0.12
    const glow = ctx.createRadialGradient(L.lampX, L.lampY, 8, L.lampX, L.lampY + L.cabH * 0.2, L.cabH * 0.95)
    glow.addColorStop(0, rgba(PALETTE.lamp, 0.22 * heat + flick))
    glow.addColorStop(0.35, rgba(PALETTE.lamp, 0.1 * heat))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(L.lampX, L.lampY + L.cabH * 0.12, L.cabH * 0.85, 0, Math.PI * 2)
    ctx.fill()
  }

  private paintCabinet(ctx: CanvasRenderingContext2D, L: Layout) {
    const x = L.cx - L.cabW / 2
    const y = L.top
    const w = L.cabW
    const h = L.cabH
    const r = 10

    ctx.save()
    this.roundRect(ctx, x + 8, y + 10, w, h, r)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()

    this.roundRect(ctx, x, y, w, h, r)
    const wood = ctx.createLinearGradient(x, y, x + w, y)
    wood.addColorStop(0, '#2A160C')
    wood.addColorStop(0.18, PALETTE.walnut)
    wood.addColorStop(0.45, '#5A3620')
    wood.addColorStop(0.7, '#3A2212')
    wood.addColorStop(1, '#24140A')
    ctx.fillStyle = wood
    ctx.fill()

    ctx.save()
    ctx.clip()
    ctx.globalAlpha = 0.14
    ctx.strokeStyle = '#1A0C06'
    ctx.lineWidth = 2
    const rng = mulberry32(0xcab1)
    for (let i = 0; i < 28; i++) {
      const gy = y + 8 + rng() * (h - 16)
      ctx.beginPath()
      ctx.moveTo(x, gy)
      ctx.bezierCurveTo(x + w * 0.3, gy + (rng() - 0.5) * 8, x + w * 0.7, gy + (rng() - 0.5) * 8, x + w, gy)
      ctx.stroke()
    }
    ctx.restore()

    ctx.strokeStyle = rgba(PALETTE.brass, 0.35)
    ctx.lineWidth = 3
    this.roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 7)
    ctx.stroke()

    ctx.strokeStyle = rgba(PALETTE.soot, 0.55)
    ctx.lineWidth = 1.2
    this.roundRect(ctx, x + 11, y + 11, w - 22, h - 22, 5)
    ctx.stroke()

    const rivets = [
      [x + 16, y + 16],
      [x + w - 16, y + 16],
      [x + 16, y + h - 16],
      [x + w - 16, y + h - 16],
    ]
    for (const [rx, ry] of rivets) {
      this.rivet(ctx, rx, ry, 4.2)
    }

    const hood = ctx.createRadialGradient(L.holeX, L.holeY, L.holeR * 0.8, L.holeX, L.holeY, L.holeR * 1.55)
    hood.addColorStop(0, 'rgba(0,0,0,0)')
    hood.addColorStop(0.45, rgba('#14080A', 0.35))
    hood.addColorStop(1, rgba('#0A0604', 0.72))
    ctx.fillStyle = hood
    ctx.beginPath()
    ctx.arc(L.holeX, L.holeY, L.holeR * 1.52, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  private paintReel(ctx: CanvasRenderingContext2D, L: Layout) {
    const cards = this.stack.slice(0, 5)
    const baseX = L.holeX - L.holeR * 1.55
    const baseY = L.holeY - L.holeR * 0.15
    const cw = L.holeR * 0.42
    const ch = L.holeR * 0.58
    cards.forEach((card, i) => {
      const ox = baseX - i * 3.2
      const oy = baseY - i * 4.4
      ctx.save()
      ctx.translate(ox, oy)
      ctx.rotate(-0.18 - i * 0.03)
      ctx.fillStyle = rgba(PALETTE.sepia, 0.72 - i * 0.08)
      ctx.strokeStyle = rgba(familyColor(card.family), 0.55)
      ctx.lineWidth = 2
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch)
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch)
      ctx.fillStyle = rgba(familyColor(card.family), 0.55)
      ctx.fillRect(-cw / 2 + 3, -ch / 2 + 3, cw - 6, 5)
      ctx.restore()
    })

    ctx.save()
    ctx.strokeStyle = rgba(PALETTE.brass, 0.4)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(baseX - 4, baseY - 18, L.holeR * 0.22, Math.PI * 0.15, Math.PI * 1.05)
    ctx.stroke()
    ctx.restore()
  }

  private paintPeephole(ctx: CanvasRenderingContext2D, L: Layout, now: number) {
    const { holeX: cx, holeY: cy, holeR: R } = L
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    const tube = ctx.createRadialGradient(cx, cy, 4, cx, cy, R)
    tube.addColorStop(0, '#2A1C10')
    tube.addColorStop(0.6, '#120C08')
    tube.addColorStop(1, '#080604')
    ctx.fillStyle = tube
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)

    if (this.flashing && !this.shuttered) {
      ctx.fillStyle = '#0A0806'
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
      ctx.fillStyle = rgba(PALETTE.sepia, 0.06)
      ctx.fillRect(cx - R * 0.2, cy - R * 0.3, R * 0.4, R * 0.55)
    } else {
      this.paintCards(ctx, L, now)
    }

    if (this.fee > 0.18 && !this.shuttered) {
      const flare = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.32, 2, cx, cy, R)
      flare.addColorStop(0, rgba(PALETTE.lamp, 0.08 + this.fee * 0.18 + this.flicker * 0.04))
      flare.addColorStop(0.4, rgba(PALETTE.lamp, 0.03))
      flare.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = flare
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    }

    const vig = ctx.createRadialGradient(cx, cy, R * 0.42, cx, cy, R)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(0.72, 'rgba(8,4,2,0.18)')
    vig.addColorStop(1, 'rgba(4,2,1,0.78)')
    ctx.fillStyle = vig
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    ctx.restore()
  }

  private paintCards(ctx: CanvasRenderingContext2D, L: Layout, now: number) {
    const t = this.reduced || this.frozen ? 1 : easeOutBack(Math.min(1, this.flip))
    if (this.outgoing && this.flip < 1 && !this.reduced) {
      const outT = easeOutCubic(this.flip)
      this.drawCard(ctx, L, this.outgoing, now, {
        y: outT * L.holeR * 1.15,
        scaleY: Math.max(0.08, 1 - outT * 0.92),
        rot: outT * 0.18,
        alpha: 1 - outT * 0.55,
      })
    }
    if (this.current) {
      const inT = this.outgoing && this.flip < 1 && !this.reduced ? t : 1
      const jamJitter =
        this.current.wear === 'jam' && this.flip > JAM_STICK && this.flip < 1 && !this.reduced
          ? Math.sin(now * 0.08) * 2.4
          : 0
      const smear = !this.reduced && !this.frozen && this.fee > 0.4 && this.flip < 1
      if (smear) {
        this.drawCard(ctx, L, this.current, now, {
          y: lerp(-L.holeR * 0.85, jamJitter, inT) + 10,
          scaleY: lerp(0.12, 1, inT),
          rot: lerp(-0.12, 0, inT) + 0.04,
          alpha: lerp(0.1, 0.28, inT),
        })
      }
      this.drawCard(ctx, L, this.current, now, {
        y: lerp(-L.holeR * 0.85, jamJitter, inT),
        scaleY: lerp(0.12, 1, inT),
        rot: lerp(-0.12, 0, inT),
        alpha: lerp(0.35, 1, inT),
      })
    }
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    L: Layout,
    card: Card,
    now: number,
    pose: { y: number; scaleY: number; rot: number; alpha: number },
  ) {
    const cw = L.holeR * 1.28
    const ch = L.holeR * 1.52
    const tint = familyColor(card.family)
    ctx.save()
    ctx.translate(L.holeX, L.holeY + pose.y)
    ctx.rotate(pose.rot)
    ctx.scale(1, Math.max(0.06, pose.scaleY))
    ctx.globalAlpha = pose.alpha

    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(-cw / 2 + 5, -ch / 2 + 6, cw, ch)

    const paper = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2)
    paper.addColorStop(0, '#E8D4B4')
    paper.addColorStop(0.45, PALETTE.sepia)
    paper.addColorStop(1, '#C4A882')
    ctx.fillStyle = paper

    ctx.beginPath()
    if (card.wear === 'torn') {
      const rng = mulberry32(hash32(card.sig))
      ctx.moveTo(-cw / 2, -ch / 2)
      ctx.lineTo(cw / 2, -ch / 2)
      ctx.lineTo(cw / 2, ch / 2)
      ctx.lineTo(cw / 2 - cw * 0.18, ch / 2 - ch * 0.08)
      ctx.lineTo(cw / 2 - cw * 0.28, ch / 2 + ch * 0.02)
      ctx.lineTo(-cw / 2 + rng() * 6, ch / 2)
      ctx.closePath()
    } else {
      ctx.rect(-cw / 2, -ch / 2, cw, ch)
    }
    ctx.fill()

    ctx.save()
    ctx.clip()
    ctx.globalAlpha = 0.12
    ctx.strokeStyle = PALETTE.walnut
    ctx.lineWidth = 1
    for (let i = 0; i < 18; i++) {
      const gy = -ch / 2 + 6 + i * (ch / 18)
      ctx.beginPath()
      ctx.moveTo(-cw / 2, gy)
      ctx.lineTo(cw / 2, gy + Math.sin(i + hash32(card.sig)) * 1.4)
      ctx.stroke()
    }
    ctx.restore()

    ctx.strokeStyle = rgba(tint, 0.92)
    ctx.lineWidth = 4
    ctx.strokeRect(-cw / 2 + 7, -ch / 2 + 7, cw - 14, ch - 14)
    ctx.strokeStyle = rgba(PALETTE.walnut, 0.45)
    ctx.lineWidth = 1.2
    ctx.strokeRect(-cw / 2 + 12, -ch / 2 + 12, cw - 24, ch - 24)

    this.cornerOrnament(ctx, -cw / 2 + 16, -ch / 2 + 16, 1, 1, tint)
    this.cornerOrnament(ctx, cw / 2 - 16, -ch / 2 + 16, -1, 1, tint)
    this.cornerOrnament(ctx, -cw / 2 + 16, ch / 2 - 16, 1, -1, tint)
    this.cornerOrnament(ctx, cw / 2 - 16, ch / 2 - 16, -1, -1, tint)

    ctx.fillStyle = rgba(PALETTE.walnut, 0.55)
    ctx.font = `italic ${Math.max(10, L.holeR * 0.11)}px "Yeseva One", serif`
    ctx.textAlign = 'center'
    ctx.fillText('FRAME', 0, -ch * 0.32)

    ctx.fillStyle = tint
    ctx.font = `${Math.max(18, L.holeR * 0.28)}px "Yeseva One", serif`
    ctx.fillText(familyLabel(card.family).toUpperCase(), 0, -ch * 0.02)

    ctx.fillStyle = rgba(PALETTE.soot, 0.72)
    ctx.font = `${Math.max(11, L.holeR * 0.14)}px "Courier Prime", monospace`
    ctx.fillText(card.serial, 0, ch * 0.18)

    if (this.slot != null) {
      ctx.fillStyle = rgba(PALETTE.walnut, 0.5)
      ctx.font = `${Math.max(9, L.holeR * 0.1)}px "Courier Prime", monospace`
      ctx.fillText(`SLOT ${this.slot}`, 0, ch * 0.32)
    }

    if (card.failed) {
      ctx.save()
      ctx.translate(cw * 0.12, -ch * 0.08)
      ctx.rotate(-0.35)
      ctx.fillStyle = rgba(PALETTE.vermilion, 0.82)
      ctx.font = `${Math.max(10, L.holeR * 0.13)}px "Courier Prime", monospace`
      ctx.fillText('JAMMED', 0, 0)
      ctx.restore()

      ctx.strokeStyle = rgba(PALETTE.vermilion, 0.55)
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(-cw * 0.28, -ch * 0.1)
      ctx.lineTo(cw * 0.08, ch * 0.06)
      ctx.lineTo(-cw * 0.04, ch * 0.22)
      ctx.stroke()
    }

    if (card.wear === 'ear') {
      ctx.beginPath()
      ctx.moveTo(cw / 2, -ch / 2)
      ctx.lineTo(cw / 2 - cw * 0.16, -ch / 2)
      ctx.lineTo(cw / 2, -ch / 2 + ch * 0.14)
      ctx.closePath()
      ctx.fillStyle = rgba('#BBA27A', 0.95)
      ctx.fill()
      ctx.strokeStyle = rgba(PALETTE.walnut, 0.5)
      ctx.stroke()
    }

    ctx.restore()
    void now
  }

  private cornerOrnament(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    sx: number,
    sy: number,
    tint: string,
  ) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(sx, sy)
    ctx.strokeStyle = rgba(tint, 0.7)
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(0, 12)
    ctx.lineTo(0, 0)
    ctx.lineTo(12, 0)
    ctx.moveTo(0, 7)
    ctx.quadraticCurveTo(6, 6, 7, 0)
    ctx.stroke()
    ctx.restore()
  }

  private paintBezel(ctx: CanvasRenderingContext2D, L: Layout) {
    const { holeX: cx, holeY: cy, holeR: R } = L
    const outer = R * 1.16
    ctx.beginPath()
    ctx.arc(cx, cy, outer, 0, Math.PI * 2)
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true)
    const ring = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer)
    ring.addColorStop(0, '#F0D890')
    ring.addColorStop(0.28, PALETTE.brass)
    ring.addColorStop(0.55, '#6A4A1C')
    ring.addColorStop(0.8, '#E0C070')
    ring.addColorStop(1, '#3A2810')
    ctx.fillStyle = ring
    ctx.fill()

    ctx.strokeStyle = rgba(PALETTE.soot, 0.55)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, R + 1.2, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = rgba(PALETTE.lamp, this.shuttered ? 0.12 : 0.28 + this.fee * 0.35)
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.arc(cx, cy, R + 5, 0, Math.PI * 2)
    ctx.stroke()

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2
      const rr = (R + outer) / 2
      this.rivet(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3.2)
    }
  }

  private paintShutter(ctx: CanvasRenderingContext2D, L: Layout) {
    if (this.shutter < 0.01) return
    const { holeX: cx, holeY: cy, holeR: R } = L
    const drop = this.shutter
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    const y0 = cy - R + drop * R * 2.05
    const wood = ctx.createLinearGradient(cx - R, y0 - R * 2, cx + R, y0)
    wood.addColorStop(0, '#2A160C')
    wood.addColorStop(0.5, PALETTE.walnut)
    wood.addColorStop(1, '#1A0E08')
    ctx.fillStyle = wood
    ctx.fillRect(cx - R, cy - R, R * 2, y0 - (cy - R))

    ctx.strokeStyle = rgba(PALETTE.brass, 0.45)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - R, y0 - 4)
    ctx.lineTo(cx + R, y0 - 4)
    ctx.stroke()

    if (drop > 0.92) {
      ctx.fillStyle = rgba(PALETTE.brass, 0.55)
      ctx.font = `${Math.max(10, R * 0.14)}px "Courier Prime", monospace`
      ctx.textAlign = 'center'
      ctx.fillText('SHUTTERED', cx, cy + 4)
    }
    ctx.restore()
  }

  private paintCrank(ctx: CanvasRenderingContext2D, L: Layout, now: number) {
    const { crankX: x, crankY: y, crankR: R } = L
    const heat = this.fee
    const angle = this.crank
    const smear = !this.reduced && !this.frozen && heat > 0.35 ? 2 : 0

    ctx.beginPath()
    ctx.moveTo(L.cx + L.cabW / 2 - 4, y)
    ctx.lineTo(x - R * 0.2, y)
    ctx.strokeStyle = rgba(PALETTE.brass, 0.7)
    ctx.lineWidth = 7
    ctx.stroke()

    for (let g = smear; g >= 0; g--) {
      const a = angle - g * 0.18 * heat
      const alpha = g === 0 ? 1 : 0.18
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x, y)
      ctx.rotate(a)

      const disc = ctx.createRadialGradient(-R * 0.2, -R * 0.2, 2, 0, 0, R)
      disc.addColorStop(0, rgba(PALETTE.lamp, 0.35 + heat * 0.35))
      disc.addColorStop(0.45, PALETTE.brass)
      disc.addColorStop(1, '#4A3010')
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fillStyle = disc
      ctx.fill()
      ctx.strokeStyle = rgba(PALETTE.soot, 0.5)
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = rgba(PALETTE.lamp, 0.15 + heat * 0.45)
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.35, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#3A2410'
      ctx.fillRect(R * 0.15, -4, R * 1.15, 8)
      ctx.fillStyle = PALETTE.brass
      ctx.fillRect(R * 0.18, -2.4, R * 1.1, 5)

      const hx = R * 1.28
      const kn = ctx.createRadialGradient(hx - 2, -8, 1, hx, -4, 10)
      kn.addColorStop(0, '#F0D890')
      kn.addColorStop(0.5, PALETTE.brass)
      kn.addColorStop(1, '#4A2C10')
      ctx.beginPath()
      ctx.arc(hx, -6, 8, 0, Math.PI * 2)
      ctx.fillStyle = kn
      ctx.fill()
      ctx.restore()
    }

    if (heat > 0.4 && !this.reduced) {
      ctx.save()
      ctx.globalAlpha = (heat - 0.4) * 0.5
      ctx.fillStyle = PALETTE.vermilion
      ctx.beginPath()
      ctx.arc(x, y, R * 0.28, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    void now
  }

  private paintLamp(ctx: CanvasRenderingContext2D, L: Layout, now: number) {
    const { lampX: x, lampY: y } = L
    const s = L.cabW * 0.06
    ctx.save()
    ctx.translate(x, y)

    ctx.fillStyle = '#2A160C'
    ctx.fillRect(-s * 1.4, s * 0.9, s * 2.8, s * 0.35)
    ctx.fillStyle = PALETTE.brass
    ctx.fillRect(-s * 0.7, s * 0.4, s * 1.4, s * 0.55)

    const heat = this.shuttered ? 0.25 : 0.55 + this.fee * 0.45 + this.flicker * 0.08
    const flame = ctx.createRadialGradient(0, -s * 0.15, 1, 0, 0, s * 1.8)
    flame.addColorStop(0, rgba('#FFF3C0', 0.85 * heat))
    flame.addColorStop(0.35, rgba(PALETTE.lamp, 0.55 * heat))
    flame.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = flame
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.1, s * 1.1, s * 1.6, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = rgba(PALETTE.sepia, 0.35)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-s * 0.55, s * 0.4)
    ctx.quadraticCurveTo(-s * 0.7, -s * 0.6, 0, -s * 1.35)
    ctx.quadraticCurveTo(s * 0.7, -s * 0.6, s * 0.55, s * 0.4)
    ctx.stroke()

    ctx.fillStyle = rgba(PALETTE.lamp, 0.9)
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.18, s * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    void now
  }

  private paintNameplate(ctx: CanvasRenderingContext2D, L: Layout) {
    const w = L.cabW * 0.46
    const h = L.cabH * 0.055
    const x = L.cx - w / 2
    const y = L.top + L.cabH * 0.78
    ctx.fillStyle = '#2A1A0C'
    ctx.fillRect(x, y, w, h)
    const plate = ctx.createLinearGradient(x, y, x, y + h)
    plate.addColorStop(0, '#D4B878')
    plate.addColorStop(0.5, PALETTE.brass)
    plate.addColorStop(1, '#7A5A28')
    ctx.fillStyle = plate
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
    ctx.fillStyle = rgba(PALETTE.soot, 0.75)
    ctx.font = `${Math.max(10, h * 0.48)}px "Courier Prime", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('MUTOSCOPE  ·  MAINNET', L.cx, y + h / 2 + 0.5)
    ctx.textBaseline = 'alphabetic'
  }

  private rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.4, x, y, r)
    g.addColorStop(0, '#F4DC9A')
    g.addColorStop(0.55, PALETTE.brass)
    g.addColorStop(1, '#3A2410')
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}
