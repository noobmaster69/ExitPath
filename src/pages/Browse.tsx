import { useSearchParams } from 'react-router-dom'
import { alternatives, categories, getCategory, isChecked, tools } from '../catalog/index.ts'
import type { Alternative } from '../catalog/schema.ts'
import { SituationBar } from '../components/Situation.tsx'
import { EmptyState, ExternalLink, IndexRow, OpennessBadge, Page, ScoreBadge } from '../components/ui.tsx'
import { nameList } from '../lib/names.ts'
import { scoredPathsFrom } from '../lib/paths.ts'
import { tokenize } from '../lib/search.ts'
import { requestUrl } from '../lib/site.ts'
import { setPrefs, usePrefs, useSituation } from '../lib/storage.ts'
import { useTitle } from '../lib/use-title.ts'

type View = 'tools' | 'alternatives'

/** Every word of the filter must appear at the start of some word in the text. */
function matches(filter: string[], ...texts: (string | undefined)[]) {
  if (filter.length === 0) return true
  const words = tokenize(texts.filter(Boolean).join(' '))
  return filter.every((token) => words.some((word) => word.startsWith(token)))
}

/** Usable without running a server: nothing to host, or hosting is optional. */
const worksWithoutServer = (alternative: Alternative) =>
  alternative.selfHosting === null || alternative.selfHosting.optional === true

const toggle = 'chip'

export function Browse() {
  useTitle('Browse')
  const [params, setParams] = useSearchParams()
  const situation = useSituation()
  const { licences } = usePrefs()
  const view: View = params.get('view') === 'alternatives' ? 'alternatives' : 'tools'
  const category = params.get('category') ?? ''
  const noServer = params.get('noserver') === '1'
  const hosted = params.get('hosted') === '1'
  const checkedOnly = params.get('checked') === '1'
  const query = params.get('q') ?? ''
  const filter = tokenize(query)

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  const shownTools = tools.filter(
    (tool) =>
      (!category || tool.category === category) &&
      matches(filter, tool.name, tool.vendor, ...(tool.alsoCovers ?? [])),
  )
  const shownAlternatives = alternatives.filter(
    (alternative) =>
      (!category || alternative.categories.includes(category)) &&
      (!situation.openOnly || alternative.openness === 'open-source') &&
      (!noServer || worksWithoutServer(alternative)) &&
      (!hosted || alternative.managedHosting.length > 0) &&
      (!checkedOnly || isChecked(alternative)) &&
      matches(filter, alternative.name, alternative.tagline),
  )
  const count = view === 'tools' ? shownTools.length : shownAlternatives.length

  return (
    <Page>
      <h1 className="text-[2rem] leading-[1.1] font-extrabold tracking-tight sm:text-[2.5rem]">Browse</h1>

      {/* Two views of one list, not tabs with separate panels: plain toggle buttons. */}
      <div
        role="group"
        aria-label="What to browse"
        className="mt-5 flex flex-wrap gap-x-7 gap-y-1 text-[1.3rem] leading-tight font-bold"
      >
        {(
          [
            ['tools', `Proprietary tools (${tools.length})`],
            ['alternatives', `Open-source alternatives (${alternatives.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => update({ view: id === 'tools' ? '' : id, noserver: '', hosted: '', checked: '' })}
            className="cursor-pointer text-muted underline-offset-4 hover:text-ink aria-pressed:text-ink aria-pressed:underline"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <label className="min-w-40 flex-1 sm:max-w-xs">
          <span className="sr-only">Filter by name</span>
          <input
            type="search"
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Filter by name…"
            className="field h-10 w-full px-3.5"
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(event) => update({ category: event.target.value })}
            className="field h-10 max-w-full cursor-pointer px-3 font-medium"
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="More filters">
        <button
          type="button"
          className={toggle}
          aria-pressed={licences === 'open'}
          title="Leave out open-core and source-available projects, here and on every other page"
          onClick={() => setPrefs({ licences: licences === 'open' ? 'any' : 'open' })}
        >
          Open source only
        </button>
        {view === 'alternatives' && (
          <>
            <button
              type="button"
              className={toggle}
              aria-pressed={noServer}
              onClick={() => update({ noserver: noServer ? '' : '1' })}
            >
              Works without a server
            </button>
            <button
              type="button"
              className={toggle}
              aria-pressed={hosted}
              onClick={() => update({ hosted: hosted ? '' : '1' })}
            >
              Has managed hosting
            </button>
            <button
              type="button"
              className={toggle}
              aria-pressed={checkedOnly}
              title="Entries written or checked by someone who uses the tool, rather than AI drafts"
              onClick={() => update({ checked: checkedOnly ? '' : '1' })}
            >
              Checked by a person
            </button>
          </>
        )}
      </div>

      {view === 'tools' && (
        <div className="mt-6">
          <SituationBar />
        </div>
      )}

      <p className="mt-7 text-muted" role="status">
        Showing {count}{' '}
        {view === 'tools' ? (count === 1 ? 'tool' : 'tools') : count === 1 ? 'alternative' : 'alternatives'}
      </p>

      {count === 0 ? (
        <EmptyState title="Nothing matches those filters">
          Clear a filter to see more, or{' '}
          <ExternalLink href={requestUrl()}>ask for something to be added</ExternalLink>.
        </EmptyState>
      ) : (
        <ul className="mt-1 gap-x-14 md:columns-2">
          {view === 'tools'
            ? shownTools.map((tool) => {
                const paths = scoredPathsFrom(tool, situation)
                const easiest = paths[0]
                return (
                  <li key={tool.id} className="break-inside-avoid">
                    <IndexRow
                      to={`/tools/${tool.id}`}
                      title={tool.name}
                      end={easiest && <ScoreBadge band={easiest.result.band} size="sm" />}
                      detail={nameList(paths.map(({ alternative }) => alternative.name))}
                      detailOnPhone={false}
                    />
                  </li>
                )
              })
            : shownAlternatives.map((alternative) => (
                <li key={alternative.id} className="break-inside-avoid">
                  <IndexRow
                    to={`/alternatives/${alternative.id}`}
                    title={alternative.name}
                    end={<OpennessBadge openness={alternative.openness} />}
                    detail={
                      <>
                        <span className="max-sm:hidden">
                          {alternative.categories.map((id) => getCategory(id)?.name).join(', ')}.{' '}
                        </span>
                        {alternative.tagline}
                        {isChecked(alternative) && <span className="text-ink"> · Checked by a person</span>}
                      </>
                    }
                  />
                </li>
              ))}
        </ul>
      )}
    </Page>
  )
}
