'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

type Section = {
  id: string
  nav: string
  num: string
  title: string
  sub: string[]
  meta: string
}

const sections: Section[] = [
  { id: 'home', nav: 'Home', num: '00', title: 'Home', sub: [], meta: 'CIEAV' },
  { id: 'architecture', nav: 'Architecture', num: '01', title: 'Architecture:', sub: ['Local authority,', 'cloud interpretation...'], meta: 'CONTROL' },
  { id: 'commit', nav: 'Commit', num: '02', title: 'Commit:', sub: ['Commit is not success.', 'Observe the outcome...'], meta: 'RECEIPT V3' },
  { id: 'privacy', nav: 'Privacy', num: '03', title: 'Privacy:', sub: ['Durable state stays local.', 'Raw secrets stay local...'], meta: 'LOCAL' },
  { id: 'runtime', nav: 'Runtime', num: '04', title: 'Runtime:', sub: ['Small OS bundles,', 'fail-closed installation...'], meta: 'CLI' },
  { id: 'cloud', nav: 'Cloud', num: '05', title: 'Cloud:', sub: ['Interpretation only.', 'Never local execution...'], meta: 'TLS' },
  { id: 'security', nav: 'Security', num: '06', title: 'Security:', sub: ['Deterministic safety floor,', 'conservative failure...'], meta: '12 INVARIANTS' },
  { id: 'verify', nav: 'Verify', num: '07', title: 'Verify:', sub: ['Test the control plane,', 'browser boundary and outcomes...'], meta: 'CI' },
]

const architectureRows = [
  ['01', 'Human / AI agent / automation', 'INTENT'],
  ['02', 'Local CIEAV Gateway', 'AUTHORITY'],
  ['03', 'Deterministic safety floor', 'SAFETY'],
  ['04', 'Local privacy reduction', 'PRIVACY'],
  ['05', 'Minimal semantic packet over TLS', 'TRANSPORT'],
  ['06', 'CIEAV Cloud Intelligence', 'INTERPRETATION'],
  ['07', 'Conservative local merge', 'MERGE'],
  ['08', 'Cognitive-friction policy', 'POLICY'],
  ['09', 'PREVIEW → COMMIT / CANCEL', 'DECISION'],
  ['10', 'Trusted replay → signed Action Receipt', 'EXECUTION'],
  ['11', 'Outcome observer → SUCCESS / FAILURE / UNKNOWN', 'OBSERVE'],
  ['12', 'Verified inverse → UNDO', 'REVERSAL'],
]

const privacyRows = [
  ['LOCAL', 'Receipts, outcomes, Undo, cognitive debt'],
  ['LOCAL', 'Browser profile, session state, local policies'],
  ['LOCAL', 'Gateway credentials, signing secrets, device enrollment'],
  ['LOCAL', 'Execution capabilities and audit log'],
  ['NEVER CLOUD', 'Passwords, OTPs, card numbers, raw form values'],
  ['NEVER CLOUD', 'Uploaded file contents, full page text, URL query strings'],
]

const securityRows = [
  'Website content is hostile.',
  'Raw secret and form values never enter cloud/model context.',
  'AI cannot lower the deterministic safety floor.',
  'HIGH, CRITICAL, and sensitive actions never habituate into passive mode.',
  'Approved replay is coordinate-bound, single-use, and short-lived.',
  'COMMITTED is not a remote-success claim.',
  'UNKNOWN stays UNKNOWN; navigation is not proof.',
  'Undo requires observed success plus one credible live inverse.',
  'Receipts describe what CIEAV observed, not arbitrary remote-server behavior.',
  'The privileged Gateway control loop is loopback-only and bearer-token protected.',
  'Cloud interpretation never performs local execution.',
  'Closing the UI does not stop the Gateway.',
]

const commands = [
  'cieav gateway status',
  'cieav cloud status',
  'cieav cloud probe',
  'cieav doctor',
  'cieav dashboard',
  'cieav test-lab',
  'cieav audit tail --limit 25',
  'cieav gateway pause',
  'cieav gateway resume',
  'cieav gateway restart-surface',
]

const GLYPHS: Record<string, string[]> = {
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
}
const WORD = 'CIEAV'

function buildRects() {
  const rects: { x: number; y: number; w: number }[] = []
  let cx = 0
  for (const ch of WORD) {
    GLYPHS[ch].forEach((row, y) => {
      let x = 0
      while (x < 5) {
        if (row[x] === '1') {
          let w = 1
          while (x + w < 5 && row[x + w] === '1') w++
          rects.push({ x: cx + x, y, w })
          x += w
        } else x++
      }
    })
    cx += 6
  }
  return { rects, cols: cx - 1 }
}

function Row({ left, mid, right }: { left: string; mid: React.ReactNode; right?: string }) {
  return (
    <div className="rv">
      <div className="hv grid grid-cols-[3.2rem_1fr_auto] gap-x-3 py-[9px] text-[15px] leading-[1.25] tracking-[-.02em]">
        <span className="text-black/45">{left}</span>
        <span>{mid}</span>
        <span className="text-black/45">{right}</span>
      </div>
    </div>
  )
}

function Card({ s, cls, indent = false, children }: { s: Section; cls: string; indent?: boolean; children: React.ReactNode }) {
  return (
    <article id={s.id} className={`rv scroll-mt-6 ${cls}`}>
      <header className="grid grid-cols-[3rem_1fr_auto] gap-x-2 text-[15px] leading-[1.25] tracking-[-.02em]">
        <span>{s.num}</span>
        <span>
          {s.title}
          {s.sub.map((l) => (
            <span key={l} className="block text-black/55">{l}</span>
          ))}
        </span>
        <span className="text-black/45">{s.meta}</span>
      </header>
      <div className={`mt-9 ${indent ? 'lg:ml-[50%]' : ''}`}>{children}</div>
    </article>
  )
}

export default function Page() {
  const rootRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [active, setActive] = useState('home')

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const { rects, cols } = buildRects()

    const START = 0
    const COL_DELAY = 16
    const COL_SPAN = 520
    const SMOOTH = 0.1
    const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
    const smooth = (t: number) => t * t * (3 - 2 * t)
    const out = (t: number) => Math.sin((t * Math.PI) / 2)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let vw = 0
    let vh = 0
    let dpr = 1
    const resize = () => {
      vw = document.documentElement.clientWidth
      vh = window.innerHeight
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(vw * dpr)
      cv.height = Math.round(vh * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    let mx = -9999
    let my = -9999
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      mx = e.clientX
      my = e.clientY
    }
    const onLeave = () => {
      mx = -9999
      my = -9999
    }

    const draw = () => {
      const y0 = window.scrollY
      const mobile = vw < 1024
      const sc = y0 / (vh / 962)
      const railW = mobile ? 56 : 88
      const heroH = vh * (mobile ? 0.12 : 0.162)
      const cw = vw / cols
      const rh = heroH / 7
      const maxS = Math.max(1, document.documentElement.scrollHeight - vh)
      const prog = clamp(y0 / maxS)

      ctx.clearRect(0, 0, vw, vh)

      for (const r of rects) {
        const q = out(clamp((sc - START - r.x * COL_DELAY) / COL_SPAN))
        const q2 = smooth(clamp((q - 0.3) / 0.7))
        const x = r.x * cw + (r.x * (railW / cols) - r.x * cw) * q
        const w = r.w * cw + (r.w * (railW / cols) - r.w * cw) * q
        let y = r.y * rh + (r.y * (vh / 7) - r.y * rh) * q2
        const h = rh + (vh / 7 - rh) * q2
        let a = 1
        if (q < 1 && mx > -999) {
          const dx = x + w / 2 - mx
          const dy = y + h / 2 - my
          const k = Math.exp(-(dx * dx + dy * dy) / (150 * 150))
          y -= k * 14 * (1 - q)
          a = 1 - 0.65 * k * (1 - q)
        }
        const read = smooth(clamp((prog - (y + h / 2) / vh) / 0.02 + 0.5))
        a *= 1 + (0.3 + 0.7 * read - 1) * q2
        const xa = Math.round(x)
        const xb = Math.round(x + w)
        const ya = Math.round(y)
        const yb = Math.round(y + h)
        ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`
        ctx.fillRect(xa, ya, Math.max(1, xb - xa), yb - ya)
      }

      const qa = smooth(clamp((sc - 450) / 400))
      if (qa > 0) {
        ctx.globalAlpha = qa
        ctx.fillStyle = 'rgba(0,0,0,.13)'
        ctx.fillRect(railW + 4, 0, 2, vh)
        ctx.fillStyle = '#000'
        ctx.fillRect(railW + 4, 0, 2, vh * prog)
        ctx.globalAlpha = 1
      }

      rootRef.current?.style.setProperty('--p', clamp(y0 / 220).toFixed(4))
    }

    const updateActive = () => {
      const list = sections.map((x) => document.getElementById(x.id)).filter(Boolean) as HTMLElement[]
      const cur = [...list].reverse().find((el) => el.getBoundingClientRect().top <= vh * 0.35)
      if (cur) setActive(cur.id)
    }

    let raf = 0
    let target = window.scrollY
    let current = window.scrollY
    let lastSet = window.scrollY
    let animating = false
    let last = performance.now()

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min(48, now - last)
      last = now
      if (animating) {
        current += (target - current) * (1 - Math.pow(1 - SMOOTH, dt / 16.67))
        if (Math.abs(target - current) < 0.4) {
          current = target
          animating = false
        }
        lastSet = current
        window.scrollTo(0, current)
      }
      draw()
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || reduce) return
      e.preventDefault()
      const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * vh : e.deltaY
      if (!animating) {
        current = window.scrollY
        target = current
      }
      target = clamp(target + d, 0, maxScroll())
      animating = true
    }
    const onScroll = () => {
      if (!animating && Math.abs(window.scrollY - lastSet) > 1.5) {
        target = current = lastSet = window.scrollY
      }
      updateActive()
    }
    const onResize = () => {
      resize()
      updateActive()
    }

    updateActive()
    document.fonts?.ready.then(() => draw())
    raf = requestAnimationFrame(frame)

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointer)
    document.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('.rv')
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { threshold: 0.05 }
    )
    els.forEach((el, i) => {
      ;(el as HTMLElement).style.transitionDelay = `${(i % 3) * 50}ms`
      io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <main ref={rootRef} className="grids-root relative min-h-screen bg-white text-black selection:bg-black selection:text-white" style={{ ['--p' as string]: 0 }}>
      <style>{css}</style>

      <div className="fixed-layers">
        <canvas ref={canvasRef} className="wm-canvas" aria-hidden="true" />
        <p className="cap cap-a">CIEAV® — Commit Layer</p>
        <p className="cap cap-b">
          <span className="underline underline-offset-2">CIEAV</span> — The commit layer for the internet.
          <br />
          Cloud interprets. Local authority commits.
        </p>
        <p className="explore">Scroll to Explore</p>
        <h1 className="sr-only">CIEAV</h1>
      </div>

      <nav aria-label="Primary" className="side-nav hidden lg:block">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'is-active' : ''}>
            <span className="dot" />
            <span className="lbl">{s.nav}</span>
          </a>
        ))}
      </nav>

      <div className="main lg:grid lg:grid-cols-2 lg:gap-x-[11px] lg:gap-y-28">
        <section id="home" className="rv scroll-mt-6 lg:col-start-2">
          <p className="max-w-[620px] text-[clamp(1.5rem,2.4vw,2.3rem)] font-medium leading-[1.05] tracking-[-.05em]">
            CIEAV is the commit layer for the internet: an always-on local control plane between digital intent and consequence.
          </p>
          <p className="mt-4 max-w-[560px] text-[15px] leading-snug text-black/55">
            It sits between a human, AI agent, or automation and browser actions that can create real-world effects. Deterministic safety and final authority stay local.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            <a href="#architecture" className="link-cta">Explore architecture <ArrowUpRight size={15} /></a>
            <a href="#security" className="link-cta">Read security model <ArrowUpRight size={15} /></a>
          </div>
        </section>

        <Card s={sections[1]} cls="lg:col-span-2" indent>
          <p className="max-w-[620px] text-2xl leading-[1.1] tracking-[-.04em]">
            Cloud interprets. Local authority commits. The cloud receives only privacy-reduced semantic evidence and never receives browser replay or commit capability.
          </p>
          <div className="mt-8">
            {architectureRows.map(([n, text, meta]) => <Row key={n} left={n} mid={text} right={meta} />)}
          </div>
        </Card>

        <Card s={sections[2]} cls="lg:col-start-1">
          <p className="text-2xl leading-[1.1] tracking-[-.04em]">
            A browser submission is not proof that the intended consequential action succeeded.
          </p>
          <div className="mt-6">
            <Row left="SUCCESS" mid="OBSERVED_SUCCESS — outcome verified locally" />
            <Row left="FAILURE" mid="OBSERVED_FAILURE — outcome verified locally" />
            <Row left="UNKNOWN" mid="UNKNOWN — evidence is inconclusive" />
            <Row left="UNDO" mid="Requires observed success + one credible live inverse" />
          </div>
          <p className="mt-6 max-w-[520px] text-sm text-black/55">
            Redirects and navigation alone do not prove consequential success. The local receipt API independently gates UNDONE.
          </p>
        </Card>

        <Card s={sections[3]} cls="lg:col-start-2">
          <p className="max-w-[520px] text-2xl leading-[1.1] tracking-[-.04em]">
            Durable user state and raw secrets remain local. Only privacy-reduced action evidence is transiently sent for interpretation.
          </p>
          <div className="mt-6">
            {privacyRows.map(([scope, text]) => <Row key={scope + text} left={scope} mid={text} />)}
          </div>
          <p className="mt-5 text-sm text-black/55">
            Outcome verification may compare local DOM state before and after an action, but raw snapshots are not persisted or sent to cloud inference.
          </p>
        </Card>

        <Card s={sections[4]} cls="lg:col-start-1">
          <p className="max-w-[520px] text-2xl leading-[1.1] tracking-[-.04em]">
            Small per-OS runtime bundles. No separate Python, Node, npm, or model-weight installation for consumers. Chrome/Chromium required.
          </p>
          <div className="mt-6">
            <Row left="WIN" mid="irm https://<CIEAV-DOWNLOAD-DOMAIN>/install.ps1 | iex" />
            <Row left="MAC/LINUX" mid="curl -fsSL https://<CIEAV-DOWNLOAD-DOMAIN>/install.sh | sh" />
            <Row left="FAIL-CLOSED" mid="HTTPS → manifest → exact artifact → SHA-256 → enrollment → safety probe → OS service" />
          </div>
          <div className="mt-8">
            {commands.map((cmd) => <div key={cmd} className="border-b border-black/10 py-2 font-mono text-[12px]">{cmd}</div>)}
          </div>
        </Card>

        <Card s={sections[5]} cls="lg:col-start-2">
          <p className="max-w-[520px] text-2xl leading-[1.1] tracking-[-.04em]">
            CIEAV Cloud Intelligence is an interpretation service, not an execution service.
          </p>
          <div className="mt-6">
            <Row left="ENV" mid="CIEAV_CLOUD_SERVER=1" />
            <Row left="MODEL" mid="ibm-granite/granite-4.1-3b" />
            <Row left="API" mid="POST /v1/inference/analyze — device token required" />
            <Row left="HEALTH" mid="GET /health" />
            <Row left="RECEIPTS" mid="Cloud mode returns local_only_resource" />
          </div>
          <p className="mt-5 text-sm text-black/55">
            Production cloud deployments use strong distinct secrets and an HTTPS reverse proxy or load balancer.
          </p>
        </Card>

        <Card s={sections[6]} cls="lg:col-start-1">
          <p className="max-w-[560px] text-2xl leading-[1.1] tracking-[-.04em]">
            CIEAV fails conservative. Semantic uncertainty never silently becomes a safer policy.
          </p>
          <div className="mt-6">
            {securityRows.map((item, i) => <Row key={item} left={String(i + 1).padStart(2, '0')} mid={item} />)}
          </div>
        </Card>

        <Card s={sections[7]} cls="lg:col-start-2">
          <p className="max-w-[520px] text-2xl leading-[1.1] tracking-[-.04em]">
            Verify the local control plane, cloud boundary, cognitive-friction policy, and browser outcome observer in CI.
          </p>
          <div className="mt-6">
            {[
              'npm run platform:check',
              'npm run build',
              'npm run test:cloud',
              'npm run test:ai-orchestration',
              'npm run test:cognitive-debt',
              'npm run typecheck',
              'npm run test:core',
              'npm run test:browser',
            ].map((cmd) => <div key={cmd} className="border-b border-black/10 py-2 font-mono text-[12px]">{cmd}</div>)}
          </div>
          <p className="mt-6 text-sm text-black/55">
            CI additionally syntax-checks the browser execution boundary and runs synthetic success, failure, and unknown browser E2E coverage.
          </p>
        </Card>
      </div>
    </main>

  )
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap');

.grids-root { font-family: 'Inter Tight', 'Helvetica Neue', Arial, sans-serif; --p: 0; }
.fixed-layers { display: contents; }
.wm-canvas { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 30; }
.cap { position: fixed; z-index: 35; pointer-events: none; margin: 0; top: 18px; color: #fff; mix-blend-mode: difference; font-size: 14px; line-height: 1.3; letter-spacing: -.02em; opacity: calc(1 - var(--p) * 6); }
.cap-a { left: 21px; }
.cap-b { left: 25.6vw; }
.explore { position: fixed; z-index: 35; pointer-events: none; margin: 0; left: 12px; top: 45vh; font-size: 11px; color: rgba(0,0,0,.35); opacity: calc(1 - var(--p) * 8); }

.main { position: relative; z-index: 20; padding: 165px 28px 160px 115px; }
.hv { transition: transform .3s cubic-bezier(.2,.7,.2,1), opacity .3s; }
.hv:hover { transform: translateX(6px); }
.link-cta {
  display: inline-flex; align-items: center; gap: 6px; font-size: 15px; letter-spacing: -.02em; padding-bottom: 2px;
  background: linear-gradient(currentColor, currentColor) 0 100% / 100% 1px no-repeat;
  transition: background-size .35s cubic-bezier(.2,.7,.2,1), gap .3s;
}
.link-cta:hover { background-size: 0% 1px; gap: 10px; }
.rv { opacity: 0; transform: translateY(18px); transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1); }
.rv.in { opacity: 1; transform: none; }

.side-nav {
  position: fixed; left: 99px; top: 50%; transform: translateY(-50%); z-index: 60;
  color: #fff; mix-blend-mode: difference; font-size: 13px; letter-spacing: -.01em;
}
.side-nav a { position: relative; display: flex; align-items: center; height: 22px; opacity: .5; transition: opacity .2s; }
.side-nav a:hover, .side-nav a.is-active { opacity: 1; }
.side-nav .dot { width: 5px; height: 5px; background: currentColor; transition: transform .25s; }
.side-nav a.is-active .dot { transform: scale(1.8); }
.side-nav .lbl { position: absolute; left: 16px; white-space: nowrap; opacity: 0; transform: translateX(-4px); transition: opacity .2s, transform .2s; }
.side-nav a:hover .lbl { opacity: 1; transform: none; }

@media (max-width: 1023px) {
  .main { padding: 24vh 16px 120px 72px; }
  .main > * + * { margin-top: 84px; }
  .cap-b, .explore { display: none; }
}
@media (max-width: 480px) { .main { padding-left: 68px; } }
@media (prefers-reduced-motion: reduce) {
  .rv { opacity: 1; transform: none; transition: none; }
  .hv, .link-cta { transition: none; }
}
`
