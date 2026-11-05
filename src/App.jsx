import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import './App.css'

const STORAGE_KEY = 'teacher-jeopardy-board-v1'
const values = (rows) => Array.from({ length: rows }, (_, row) => (row + 1) * 100)
const formatMath = (expression) => expression.replace(/(?<!\\)(\d+|[A-Za-z]+)\/(\d+|[A-Za-z]+)/g, '\\frac{$1}{$2}')

function MathText({ children }) {
  const content = String(children ?? '')
  const standaloneMath = /^(?=.*(?:\^|_|\\))[A-Za-z0-9\\{}_^+\-*/=().,\s]+$/.test(content)
  if (standaloneMath) {
    return <span className="math" dangerouslySetInnerHTML={{ __html: katex.renderToString(formatMath(content), { throwOnError: false }) }} />
  }
  const pieces = content.split(/(\$[^$]+\$|\\\([^]+?\\\))/g)
  return pieces.map((piece, index) => {
    const isDollarMath = piece.startsWith('$') && piece.endsWith('$')
    const isBracketMath = piece.startsWith('\\(') && piece.endsWith('\\)')
    if (!isDollarMath && !isBracketMath) return piece
    const expression = isDollarMath ? piece.slice(1, -1) : piece.slice(2, -2)
    return <span className="math" key={index} dangerouslySetInnerHTML={{ __html: katex.renderToString(formatMath(expression), { throwOnError: false }) }} />
  })
}

function makeBoard(columns = 5, rows = 5) {
  return {
    title: 'My Jeopardy Board',
    categories: Array.from({ length: columns }, (_, column) => ({
      id: crypto.randomUUID(),
      name: `Category ${column + 1}`,
      clues: values(rows).map((value) => ({ id: crypto.randomUUID(), value, question: '', answer: '', used: false })),
    })),
    teams: [{ id: crypto.randomUUID(), name: 'Blue Team', score: 0 }, { id: crypto.randomUUID(), name: 'Gold Team', score: 0 }],
  }
}

function loadBoard() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : makeBoard()
  } catch {
    return makeBoard()
  }
}

function App() {
  const [board, setBoard] = useState(loadBoard)
  const [mode, setMode] = useState('build')
  const [activeClue, setActiveClue] = useState(null)
  const [answerVisible, setAnswerVisible] = useState(false)
  const [notice, setNotice] = useState('Saved in this browser')
  const fileRef = useRef(null)
  const rows = board.categories[0]?.clues.length ?? 0

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  }, [board])

  const updateBoard = (update) => setBoard((current) => update(current))
  const updateTitle = (title) => updateBoard((current) => ({ ...current, title }))

  function resize(columns, nextRows) {
    const old = board.categories
    const categories = Array.from({ length: columns }, (_, column) => {
      const existing = old[column]
      const oldClues = existing?.clues ?? []
      return {
        id: existing?.id ?? crypto.randomUUID(),
        name: existing?.name ?? `Category ${column + 1}`,
        clues: values(nextRows).map((value, row) => ({
          id: oldClues[row]?.id ?? crypto.randomUUID(),
          value,
          question: oldClues[row]?.question ?? '',
          answer: oldClues[row]?.answer ?? '',
          used: oldClues[row]?.used ?? false,
        })),
      }
    })
    setBoard((current) => ({ ...current, categories }))
  }

  function updateCategory(column, name) {
    updateBoard((current) => ({ ...current, categories: current.categories.map((item, index) => index === column ? { ...item, name } : item) }))
  }

  function updateClue(column, row, field, value) {
    updateBoard((current) => ({
      ...current,
      categories: current.categories.map((category, categoryIndex) => categoryIndex !== column ? category : {
        ...category,
        clues: category.clues.map((clue, clueIndex) => clueIndex !== row ? clue : { ...clue, [field]: value }),
      }),
    }))
  }

  function updateTeam(id, field, value) {
    updateBoard((current) => ({ ...current, teams: current.teams.map((team) => team.id === id ? { ...team, [field]: value } : team) }))
  }

  function addTeam() {
    updateBoard((current) => ({ ...current, teams: [...current.teams, { id: crypto.randomUUID(), name: `Team ${current.teams.length + 1}`, score: 0 }] }))
  }

  function openClue(column, row) {
    const clue = board.categories[column].clues[row]
    if (clue.used) return
    updateClue(column, row, 'used', true)
    setActiveClue({ column, row })
    setAnswerVisible(false)
  }

  function exportBoard() {
    const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), board }, null, 2)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${board.title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'jeopardy-board'}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Board downloaded as a JSON file')
  }

  function importBoard(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        const imported = parsed.board ?? parsed
        if (!Array.isArray(imported.categories) || !Array.isArray(imported.teams)) throw new Error('Invalid board')
        setBoard(imported)
        setMode('build')
        setNotice(`Loaded “${imported.title || 'Untitled board'}”`)
      } catch {
        setNotice('That file is not a Teacher Jeopardy board')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const completed = board.categories.flatMap((category) => category.clues).filter((clue) => clue.question.trim() && clue.answer.trim()).length
  const total = board.categories.length * rows
  const current = activeClue && board.categories[activeClue.column]?.clues[activeClue.row]

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setMode('build')} aria-label="Open board builder"><span>★</span> Teacher Jeopardy</button>
        <div className="top-actions">
          <span className="save-status"><i />{notice}</span>
          <button className="button ghost" onClick={() => fileRef.current?.click()}>Import</button>
          <button className="button ghost" onClick={exportBoard}>Export</button>
          <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={importBoard} />
          <button className="button primary" onClick={() => setMode(mode === 'build' ? 'play' : 'build')}>{mode === 'build' ? 'Play board →' : '← Edit board'}</button>
        </div>
      </header>

      {mode === 'build' ? (
        <section className="builder">
          <div className="builder-intro">
            <div>
              <p className="eyebrow">BOARD BUILDER</p>
              <input className="title-input" value={board.title} onChange={(event) => updateTitle(event.target.value)} aria-label="Board title" />
              <p>Set up every clue, then switch to play mode when class begins.</p>
            </div>
            <div className="completion"><strong>{completed}<span>/{total}</span></strong><small>clues ready</small></div>
          </div>

          <section className="configuration card">
            <div><h2>Board size</h2><p>Customize the number of categories and clues.</p></div>
            <div className="stepper-group">
              <label>Categories <div className="stepper"><button onClick={() => resize(Math.max(1, board.categories.length - 1), rows)} disabled={board.categories.length <= 1}>−</button><span>{board.categories.length}</span><button onClick={() => resize(Math.min(8, board.categories.length + 1), rows)} disabled={board.categories.length >= 8}>+</button></div></label>
              <label>Clues each <div className="stepper"><button onClick={() => resize(board.categories.length, Math.max(1, rows - 1))} disabled={rows <= 1}>−</button><span>{rows}</span><button onClick={() => resize(board.categories.length, Math.min(8, rows + 1))} disabled={rows >= 8}>+</button></div></label>
            </div>
          </section>

          <section className="editor card">
            <div className="section-heading"><div><h2>Clue editor</h2><p>Enter each category, question, and answer. Press Enter for a new line; math syntax such as <code>x^2</code> works, and <code>$4/7$</code> creates a fraction in text.</p></div><span className="required-key"><b>Q</b> Question <b>A</b> Answer</span></div>
            <div className="editor-scroll"><div className="editor-grid" style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(250px, 1fr))` }}>
              {board.categories.map((category, column) => <article className="category-editor" key={category.id}>
                <input className="category-name" value={category.name} onChange={(event) => updateCategory(column, event.target.value)} aria-label={`Category ${column + 1} name`} />
                {category.clues.map((clue, row) => <div className="clue-fields" key={clue.id}>
                  <span>{clue.value}</span>
                  <textarea value={clue.question} onChange={(event) => updateClue(column, row, 'question', event.target.value)} placeholder="Question" aria-label={`${category.name} ${clue.value} question`} />
                  <textarea value={clue.answer} onChange={(event) => updateClue(column, row, 'answer', event.target.value)} placeholder="Answer" aria-label={`${category.name} ${clue.value} answer`} />
                </div>)}
              </article>)}
            </div></div>
          </section>

          <section className="teams card">
            <div className="section-heading"><div><h2>Teams</h2><p>These names and scores carry into play mode.</p></div><button className="text-button" onClick={addTeam}>+ Add team</button></div>
            <div className="team-editor">{board.teams.map((team) => <div className="team-row" key={team.id}><input value={team.name} onChange={(event) => updateTeam(team.id, 'name', event.target.value)} aria-label="Team name" /><button aria-label={`Remove ${team.name}`} onClick={() => updateBoard((current) => ({ ...current, teams: current.teams.filter((item) => item.id !== team.id) }))}>×</button></div>)}</div>
          </section>
        </section>
      ) : (
        <section className="game">
          <div className="game-heading"><div><p className="eyebrow">CLASSROOM PLAY MODE</p><h1>{board.title || 'Untitled board'}</h1></div><button className="button ghost light" onClick={() => updateBoard((current) => ({ ...current, categories: current.categories.map((category) => ({ ...category, clues: category.clues.map((clue) => ({ ...clue, used: false })) })) }))}>Reset board</button></div>
          <div className="scoreboard">{board.teams.map((team) => <div className="score-card" key={team.id}><input value={team.name} onChange={(event) => updateTeam(team.id, 'name', event.target.value)} /><strong>{team.score}</strong><div><button onClick={() => updateTeam(team.id, 'score', team.score - 100)}>−100</button><button onClick={() => updateTeam(team.id, 'score', team.score + 100)}>+100</button></div></div>)}</div>
          <div className="board-wrap"><div className="game-board" style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(120px, 1fr))` }}>
            {board.categories.map((category) => <div className="board-category" key={category.id}>{category.name || 'Untitled'}</div>)}
            {Array.from({ length: rows }, (_, row) => board.categories.map((category, column) => { const clue = category.clues[row]; return <button className={`clue ${clue.used ? 'used' : ''}`} key={clue.id} onClick={() => openClue(column, row)} disabled={clue.used}>{clue.used ? '' : clue.value}</button> }))}
          </div></div>
        </section>
      )}

      {current && <div className="modal-backdrop" role="presentation"><section className="clue-modal" role="dialog" aria-modal="true" aria-labelledby="clue-title"><button className="close" onClick={() => setActiveClue(null)} aria-label="Close clue">×</button><p className="modal-category">{board.categories[activeClue.column].name} · {current.value} points</p><h2 id="clue-title"><MathText>{current.question || 'This question has not been added yet.'}</MathText></h2>{answerVisible ? <div className="answer"><span>ANSWER</span><p><MathText>{current.answer || 'No answer has been added yet.'}</MathText></p></div> : <button className="button reveal" onClick={() => setAnswerVisible(true)}>Reveal answer</button>}</section></div>}
    </main>
  )
}

export default App
