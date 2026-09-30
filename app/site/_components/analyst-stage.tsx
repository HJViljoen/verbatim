'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { analyst, type AnalystItem } from '../_data/sample'

const HOLD = 18000
const TYPE_MS = 16

// The live stage: the question appears at once, the answer types, then the
// registers and the evidence reveal (CSS transitions keyed on `is-on`). It
// cycles through the items on its own while in view, holds each for HOLD, and
// stops cycling the moment a visitor picks a chip. Every timer is owned by one
// effect and cleared on change or unmount.
//
// THE FIRST ANSWER IS ON THE PAGE AS IT ENDS (sw-2 item 7). The stage used to
// start empty and fill only when an IntersectionObserver fired, so without
// JavaScript, in a full-page capture, or under reduced motion before the
// section was scrolled to, "Then ask it anything" stood over an empty answer.
// The server now renders the first item answered and its evidence shown; the
// typing plays where motion is allowed, from empty only for a stage below the
// fold at load (`reveal-armed` holds the evidence back while it types).
const FIRST_MARKS = analyst[0].kind === 'document' ? 99 : 0

export function AnalystStage() {
  const [current, setCurrent] = useState(0)
  const [typed, setTyped] = useState(analyst[0].answer)
  const [phase, setPhase] = useState<'idle' | 'typing' | 'shown'>('shown')
  const [running, setRunning] = useState(false)
  const [manual, setManual] = useState(false)
  const [started, setStarted] = useState(false)
  const [litMarks, setLitMarks] = useState(FIRST_MARKS)
  const [reduce, setReduce] = useState(false)
  const [motion, setMotion] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const inView = useRef(false)

  const item: AnalystItem = analyst[current]

  useEffect(() => {
    const r = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReduce(r)
    setMotion(!r)
    const el = sectionRef.current
    if (!r && el && el.getBoundingClientRect().top >= window.innerHeight) {
      setTyped('')
      setPhase('idle')
      setLitMarks(0)
    }
  }, [])

  // Start when the section comes into view; pause the auto-advance when it leaves.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        inView.current = e.isIntersecting
        if (e.isIntersecting) setStarted(true)
        setRunning(e.isIntersecting && !manual)
      }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [manual])

  // Play the current item: type the answer, then reveal, then (if running) advance.
  useEffect(() => {
    if (!started) return
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))
    setLitMarks(0)
    if (reduce) {
      setTyped(item.answer)
      setPhase('shown')
      if (item.kind === 'document') setLitMarks(99)
    } else {
      setTyped('')
      setPhase('typing')
      let i = 0
      const step = () => {
        i += 1
        setTyped(item.answer.slice(0, i))
        if (i < item.answer.length) later(step, TYPE_MS)
        else later(() => {
          setPhase('shown')
          if (item.kind === 'document') {
            const n = item.paragraphs.flat().filter((s) => s.mark).length
            for (let m = 1; m <= n; m++) later(() => setLitMarks(m), 700 + (m - 1) * 650)
          }
        }, 250)
      }
      later(step, TYPE_MS)
    }
    if (running && !reduce) later(() => { if (inView.current) setCurrent((c) => (c + 1) % analyst.length) }, HOLD + 400)
    return () => timers.forEach(clearTimeout)
  }, [current, started, running, reduce, item])

  const pick = useCallback((i: number) => {
    setManual(true)
    setRunning(false)
    setCurrent(i)
  }, [])

  const isDoc = item.kind === 'document'

  return (
    <div ref={sectionRef} className="wrap">
      <h2 id="ask-h">Then ask it anything.</h2>
      <p className="under">An analyst that has read what your market said, and remembers it. Ask it a question, or hand it a plan and it checks the claims in it against the conversation. Below, it answers for the example market.</p>

      <div className="prompt" role="group" aria-label="Ask the analyst">
        <div className="typed-q">
          {isDoc ? (
            <span className="filechip"><b /> {item.file}<span>{item.meta}</span></span>
          ) : (
            <span>{item.q}</span>
          )}
        </div>
        <button className="btn btn-green" type="button" onClick={() => pick((current + 1) % analyst.length)}>
          Ask
        </button>
      </div>

      <div className="chips">
        {analyst.map((q, i) => (
          <button
            key={q.chip}
            type="button"
            className={`chip${q.kind === 'document' ? ' file' : ''}${i === current ? ' on' : ''}${i === current && running && phase !== 'idle' ? ' running' : ''}`}
            aria-pressed={i === current}
            onClick={() => pick(i)}
            style={{ ['--hold' as string]: `${HOLD}ms` }}
          >
            {q.chip}
            <i />
          </button>
        ))}
      </div>

      <div className={`stage${isDoc ? ' docmode' : ''}${motion && phase !== 'shown' ? ' reveal-armed' : ''}${phase === 'shown' ? ' is-on' : ''}`} key={current}>
        <div className="answer">
          <p className="a">
            <span>{typed}</span>
            {phase === 'typing' && <span className="caret" />}
          </p>
          {item.kind === 'question' ? (
            <>
              <div className="reg" style={{ ['--i' as string]: 0 }}>
                <span className="k">What the evidence says</span>
                <ul>
                  {item.evidence.map((e) => (
                    <li key={e.n}>{e.text}<span className="n">{e.n}</span></li>
                  ))}
                </ul>
              </div>
              <div className="reg" style={{ ['--i' as string]: 1 }}>
                <span className="k">My read</span>
                <ul><li>{item.read}</li></ul>
              </div>
              <div className="reg silent" style={{ ['--i' as string]: 2 }}>
                <span className="k">Not in the evidence</span>
                <ul><li>{item.silent}</li></ul>
              </div>
            </>
          ) : (
            <div className="check">
              {item.claims.map((c, i) => (
                <div key={c.b + i} className={`cl ${c.k}`} style={{ ['--i' as string]: i }}>
                  <span className="n">{c.k === 'silent' ? '–' : i + 1}</span>
                  <div><b>{c.b}</b><span>{c.t}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="voices">
          {item.kind === 'question' ? (
            item.evidence.map((e, i) => (
              <div key={e.n} className="vc" style={{ ['--i' as string]: i }}>
                <span className="n">{e.n}</span>
                <div>
                  <div className="voice">{e.quote}</div>
                  <div className="src">{e.src}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="paper">
              <div className="file"><span>{item.file}</span><span>{item.meta}</span></div>
              <h4>{item.title}</h4>
              {(() => {
                let markIndex = 0
                return item.paragraphs.map((para, pi) => (
                  <p key={pi}>
                    {para.map((seg, si) => {
                      if (!seg.mark) return <span key={si}>{seg.text}</span>
                      markIndex += 1
                      const lit = markIndex <= litMarks
                      return <mark key={si} className={`${seg.mark}${lit ? ' lit' : ''}`}>{seg.text}</mark>
                    })}
                  </p>
                ))
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
