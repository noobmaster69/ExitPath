import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { search, type ResultKind } from '../lib/search.ts'
import { requestUrl } from '../lib/site.ts'
import { IconArrowRight, IconExternal, IconSearch } from './icons.tsx'

const KIND_LABEL: Record<ResultKind, string> = {
  tool: 'Tool',
  suite: 'Suite',
  alternative: 'Alternative',
  guide: 'Guide',
}

/**
 * Catalog search with a keyboard-navigable result list (ARIA combobox pattern).
 *
 * `hero` is the large field on the home page, with results in a dropdown.
 * `dialog` is the same search inside the header's search dialog, where the
 * results sit in the normal flow and Escape is left for the dialog to handle.
 */
export function SearchBox({
  variant = 'hero',
  onNavigate,
}: {
  variant?: 'hero' | 'dialog'
  onNavigate?: () => void
}) {
  const inDialog = variant === 'dialog'
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const listId = useId()

  const results = useMemo(() => search(query, 8), [query])
  const wanted = query.trim()
  const showList = (open || inDialog) && wanted.length > 0
  const activeResult = results[Math.min(active, results.length - 1)]
  const nothing = results.length === 0

  // Nothing found: the one thing left to offer is a way to ask for it.
  function ask() {
    window.open(requestUrl(wanted), '_blank', 'noopener,noreferrer')
  }

  function go(href: string) {
    setOpen(false)
    setQuery('')
    onNavigate?.()
    navigate(href)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length))
    } else if (event.key === 'Enter' && showList && (activeResult || nothing)) {
      event.preventDefault()
      if (activeResult) go(activeResult.href)
      else ask()
    } else if (event.key === 'Escape' && !inDialog) {
      if (showList) setOpen(false)
      else setQuery('')
    }
  }

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search for a tool or an alternative
      </label>
      <IconSearch
        className={`pointer-events-none absolute left-4 -translate-y-1/2 text-xl text-muted ${inDialog ? 'top-6' : 'top-7'}`}
      />
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          !showList
            ? undefined
            : activeResult
              ? `${listId}-${activeResult.kind}-${activeResult.id}`
              : `${listId}-ask`
        }
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Search for a tool, such as Slack, OneDrive or Notion"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`field w-full pr-4 pl-12 text-lg [&::-webkit-search-cancel-button]:hidden ${inDialog ? 'h-12' : 'h-[3.6rem] sm:text-xl'}`}
      />

      {/* Kept in the DOM while closed so that aria-controls always points at something. */}
      <div
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!showList}
        className={
          inDialog
            ? 'mt-2 max-h-[min(24rem,55vh)] overflow-auto'
            : 'absolute inset-x-0 top-full z-20 mt-2 max-h-[min(26rem,60vh)] overflow-auto rounded-md border border-ink bg-surface p-1.5'
        }
      >
        {results.map((result, index) => {
          const selected = result === activeResult
          return (
            <div
              key={`${result.kind}-${result.id}`}
              id={`${listId}-${result.kind}-${result.id}`}
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              // Fire before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault()
                go(result.href)
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${selected ? 'bg-sunken' : ''}`}
            >
              <span className="label w-[5.2rem] shrink-0">{KIND_LABEL[result.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg leading-tight font-bold">{result.title}</span>
                <span className="block truncate text-muted">{result.subtitle}</span>
              </span>
              <IconArrowRight className={`shrink-0 text-accent ${selected ? '' : 'invisible'}`} />
            </div>
          )
        })}
        {nothing && (
          <div
            id={`${listId}-ask`}
            role="option"
            aria-selected="true"
            tabIndex={-1}
            onMouseDown={(event) => {
              event.preventDefault()
              ask()
            }}
            className="flex cursor-pointer items-center gap-3 rounded-md bg-sunken px-3 py-2"
          >
            <span className="label w-[5.2rem] shrink-0">Not yet</span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg leading-tight font-bold [overflow-wrap:anywhere]">
                “{wanted}” is not covered yet
              </span>
              <span className="block text-muted">Ask for it on GitHub, in a new tab</span>
            </span>
            <IconExternal className="shrink-0 text-accent" />
          </div>
        )}
      </div>
    </div>
  )
}
