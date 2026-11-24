import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { alternatives, getTool, guides, suites, tools } from './catalog/index.ts'
import { stepIds } from './lib/guides.ts'
import {
  PROGRESS_KEY,
  getPlan,
  getPlanDone,
  getPrefs,
  setMoveDone,
  setPlanChoice,
  setPlanChoices,
  setPrefs,
  setStepDone,
} from './lib/storage.ts'
import { routes } from './routes.tsx'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const heading = () => screen.getByRole('heading', { level: 1 })

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every alternative listed on a tool page, by its row heading. */
const pathHeadings = () =>
  within(screen.getByRole('table', { name: 'Alternatives compared' })).getAllByRole('rowheader')

/** The table row for one alternative on a tool page. */
const pathRow = (name: string) =>
  screen.getByRole('rowheader', { name: new RegExp(`^${escapeRegExp(name)}`) }).closest('tr')!

/** Unfolds a row and returns the detail row under it. */
async function openDetails(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = pathRow(name)
  await user.click(within(row).getByRole('button', { name: `Details for ${name}` }))
  return row.nextElementSibling as HTMLElement
}

describe('pages', () => {
  it('home lists every tool, suite and guide', () => {
    renderAt('/')
    expect(heading()).toHaveTextContent(`Open-source alternatives to ${tools.length} tools`)
    for (const tool of tools)
      expect(
        screen.getAllByRole('link', { name: new RegExp(escapeRegExp(tool.name)) }).length,
      ).toBeGreaterThan(0)
    for (const suite of suites)
      expect(screen.getByRole('link', { name: suite.name })).toHaveAttribute('href', `/suites/${suite.id}`)
    for (const guide of guides)
      expect(screen.getByRole('link', { name: guide.title })).toHaveAttribute('href', `/guides/${guide.id}`)
  })

  it('home says how much of the catalog a person has checked', () => {
    renderAt('/')
    const checked = [...tools, ...alternatives].filter((entry) => entry.checkedBy).length
    expect(checked).toBeGreaterThan(0)
    expect(screen.getByText(/written or checked by someone who uses the tool/)).toHaveTextContent(
      `${checked} of the ${tools.length + alternatives.length} entries have been written or checked`,
    )
  })

  it.each(tools.map((tool) => [tool.id, tool] as const))('tool page renders: %s', (_id, tool) => {
    renderAt(`/tools/${tool.id}`)
    expect(heading()).toHaveTextContent(`Alternatives to ${tool.name}`)
    // One row per alternative, each saying how hard the move is in a word.
    expect(pathHeadings()).toHaveLength(tool.paths.length)
    for (const path of tool.paths) {
      const name = alternatives.find((alternative) => alternative.id === path.to)!.name
      expect(pathRow(name)).toHaveTextContent(/Easy|Moderate|Demanding|Hard|Very hard/)
    }
  })

  it.each(alternatives.map((alternative) => [alternative.id, alternative] as const))(
    'alternative page renders: %s',
    (_id, alternative) => {
      renderAt(`/alternatives/${alternative.id}`)
      expect(heading()).toHaveTextContent(alternative.name)
      expect(screen.getByText(alternative.weaknesses[0]!)).toBeDefined()
      expect(screen.getByRole('link', { name: /Source code/ })).toHaveAttribute(
        'href',
        alternative.links.source,
      )
    },
  )

  it.each(suites.map((suite) => [suite.id, suite] as const))('suite page renders: %s', (_id, suite) => {
    renderAt(`/suites/${suite.id}`)
    expect(heading()).toHaveTextContent(suite.name)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(suite.components.length)
  })

  it.each(guides.map((guide) => [guide.id, guide] as const))('guide page renders: %s', (_id, guide) => {
    renderAt(`/guides/${guide.id}`)
    expect(heading()).toHaveTextContent(guide.title)
    expect(screen.getAllByRole('checkbox')).toHaveLength(stepIds(guide).length)
  })

  it.each(['/browse', '/browse?view=alternatives', '/guides', '/about'])('%s renders', (path) => {
    renderAt(path)
    expect(heading()).toBeDefined()
  })

  it.each(['/nowhere', '/tools/nope', '/alternatives/nope', '/guides/nope', '/suites/nope'])(
    '%s shows the not-found page',
    (path) => {
      renderAt(path)
      expect(heading()).toHaveTextContent(/not in the catalog/)
    },
  )

  it('external links open safely in a new tab', () => {
    renderAt('/alternatives/nextcloud')
    for (const link of screen.getAllByRole('link')) {
      if (link.getAttribute('href')?.startsWith('https://')) {
        expect(link).toHaveAttribute('target', '_blank')
        expect(link.getAttribute('rel')).toContain('noopener')
      }
    }
  })
})

describe('interactions', () => {
  it('search finds a tool and opens it', async () => {
    const user = userEvent.setup()
    const router = renderAt('/')
    await user.type(screen.getByRole('combobox'), 'onedrive')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('OneDrive & SharePoint files')
    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/tools/onedrive')
  })

  it('offers a way to ask when search finds nothing', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      renderAt('/')
      await user.type(screen.getByRole('combobox'), 'zzzzzz')
      expect(screen.getByRole('option')).toHaveTextContent('“zzzzzz” is not covered yet')
      await user.keyboard('{Enter}')
      expect(open).toHaveBeenCalledWith(expect.any(String), '_blank', 'noopener,noreferrer')
      // The issue opens with its title filled in, and a note on what the catalog lists.
      const url = new URL(open.mock.calls[0]![0] as string)
      expect(url.origin + url.pathname).toBe('https://github.com/noobmaster69/ExitPath/issues/new')
      expect(url.searchParams.get('title')).toBe('Please cover: zzzzzz')
      expect(url.searchParams.get('body')).toMatch(
        /^<!-- .*proprietary products are not listed as alternatives.* -->\n\n$/,
      )
    } finally {
      open.mockRestore()
    }
  })

  it('does not pass off a description match as an answer', async () => {
    const user = userEvent.setup()
    renderAt('/')
    // mailcow runs in Docker; that does not make it an alternative to Docker.
    await user.type(screen.getByRole('combobox'), 'docker')
    expect(screen.getByRole('option')).toHaveTextContent('“docker” is not covered yet')
  })

  it('finds the company login by the names people use for it', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const box = screen.getByRole('combobox')
    for (const query of ['sso', 'azure ad', 'entra']) {
      await user.clear(box)
      await user.type(box, query)
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('Microsoft Entra ID')
    }
  })

  it('has the situation toggles on the page, and remembers them', async () => {
    const user = userEvent.setup()
    renderAt('/tools/onedrive')
    expect(pathRow('Nextcloud')).toHaveTextContent('Self-host, or Providers listed by Nextcloud')

    await user.click(screen.getByRole('radio', { name: /Managed/ }))
    await user.click(screen.getByRole('radio', { name: /Small team/ }))
    expect(pathRow('Nextcloud')).toHaveTextContent('Hosted by Providers listed by Nextcloud')
    expect(getPrefs()).toMatchObject({ hosting: 'managed', teamSize: 'small' })

    // The options dialog holds the same two answers, plus the rest.
    await user.click(screen.getByRole('button', { name: 'More options' }))
    const options = screen.getByRole('dialog', { name: 'Options' })
    expect(within(options).getByRole('radio', { name: /Managed/ })).toBeChecked()
    expect(within(options).getByRole('radio', { name: /Small team/ })).toBeChecked()
  })

  it('grades in words, and keeps the number for the breakdown', async () => {
    const user = userEvent.setup()
    renderAt('/tools/slack')
    const row = pathRow('Mattermost')
    expect(row).toHaveTextContent('Moderate')
    expect(row).not.toHaveTextContent(/\d+ (of|out of) 100/)

    const detail = await openDetails(user, 'Mattermost')
    expect(detail).toHaveTextContent(/Moderate: a score of \d+ out of 100, from six ratings/)
    expect(detail).toHaveTextContent(/Getting data out \d.*Lock-in \d.*People to move \d/)
    // Unfolding is reversible, and the button says which row it belongs to.
    await user.click(within(row).getByRole('button', { name: 'Hide details for Mattermost' }))
    expect(screen.queryByText(/a score of \d+ out of 100/)).toBeNull()
  })

  it('says who can host a project for you, and what that does to the grade', async () => {
    const user = userEvent.setup()
    renderAt('/tools/slack')
    expect(pathRow('Zulip')).toHaveTextContent('Self-host, or Zulip Cloud')
    const detail = await openDetails(user, 'Zulip')
    expect(detail).toHaveTextContent(
      /Running it yourself: Moderate, \d+ of 100\. Includes .+ to set up and secure the server\./,
    )
    expect(detail).toHaveTextContent(/Hosted by Zulip Cloud.*: (Easy|Moderate), \d+ of 100\./)
    expect(within(detail).getByRole('link', { name: /Zulip Cloud/ })).toHaveAttribute(
      'href',
      'https://zulip.com/plans/',
    )
  })

  it('puts the verdict and main drawback in the row, and the licence catch one click away', async () => {
    const user = userEvent.setup()
    renderAt('/tools/slack')
    const row = pathRow('Mattermost')
    expect(row).toHaveTextContent(/Needs the least retraining/)
    expect(row).toHaveTextContent(/Main drawback: Open core, and the line keeps moving/)
    const detail = await openDetails(user, 'Mattermost')
    expect(within(detail).getByText(/^Licence: MIT, open core$/)).toBeDefined()
    expect(within(detail).getByText(/no longer includes GitLab SSO/)).toBeDefined()
  })

  it('gives ratings as plain words', async () => {
    const user = userEvent.setup()
    renderAt('/tools/slack')
    const mattermost = await openDetails(user, 'Mattermost')
    expect(mattermost).toHaveTextContent('Getting data inEasy')
    expect(mattermost).toHaveTextContent('MaturityMature')
    const element = await openDetails(user, 'Element (Matrix)')
    expect(element).toHaveTextContent('Getting data inHard')
    // No dots to count, and no "n out of 5" beside a word that already says it.
    expect(element).not.toHaveTextContent(/\d (out )?of 5/)
  })

  it('says "not known" where the catalog does not know, and lets entries differ in length', () => {
    const unknown = alternatives.filter((alternative) =>
      Object.values(alternative.features).includes('unknown'),
    )
    expect(unknown.length).toBeGreaterThan(0)
    const sample = unknown[0]!
    renderAt(`/alternatives/${sample.id}`)
    expect(screen.getAllByText('Not known').length).toBeGreaterThan(0)

    // Entries are as long as what is worth saying about them, not a fixed four and four.
    const shapes = new Set(alternatives.map((a) => `${a.strengths.length}/${a.weaknesses.length}`))
    expect(shapes.size).toBeGreaterThan(3)
  })

  it("uses the browser's own checkboxes and progress bar on a checklist", () => {
    const guide = guides[0]!
    renderAt(`/guides/${guide.id}`)
    const bar = screen.getByRole('progressbar', { name: `Progress through ${guide.title}` })
    expect(bar.tagName).toBe('PROGRESS')
    expect(bar).toHaveAttribute('max', String(stepIds(guide).length))
    for (const box of screen.getAllByRole('checkbox')) expect(box.className).not.toContain('appearance-none')
  })

  it('says when managed hosting was asked for but does not exist', async () => {
    const user = userEvent.setup()
    setPrefs({ hosting: 'managed' })
    renderAt('/tools/outlook-exchange')
    expect(pathRow('Stalwart')).toHaveTextContent('Self-host only')
    const detail = await openDetails(user, 'Stalwart')
    expect(detail).toHaveTextContent(/No managed Stalwart hosting is listed/)
  })

  it('can leave out everything that is not fully open source', async () => {
    const user = userEvent.setup()
    const notion = getTool('notion')!
    renderAt('/tools/notion')
    expect(pathHeadings()).toHaveLength(notion.paths.length)

    await user.click(screen.getByRole('button', { name: 'Options' }))
    await user.click(screen.getByRole('radio', { name: /Open source only/ }))
    expect(getPrefs().licences).toBe('open')
    const left = pathHeadings()
    expect(left.length).toBeLessThan(notion.paths.length)
    for (const rowHeading of left) expect(within(rowHeading).getByText('Open source')).toBeDefined()
    expect(screen.getByText(/Grades and hours follow/)).toHaveTextContent(
      `Showing open-source projects only, which hides ${notion.paths.length - left.length} alternatives.`,
    )
  })

  it('states the two answers in one line, which a phone shows in place of the toggles', async () => {
    const user = userEvent.setup()
    renderAt('/tools/slack')
    const change = screen.getByRole('button', { name: 'Change' })
    const line = change.closest('p')!
    expect(line).toHaveTextContent('Graded for Just me · Self-host')
    expect(change).toHaveAttribute('aria-expanded', 'false')

    await user.click(change)
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('radio', { name: /Larger team/ }))
    await user.click(screen.getByRole('radio', { name: /Managed/ }))
    expect(line).toHaveTextContent('Graded for Larger team · Managed')

    setPrefs({ licences: 'open' })
    expect(await screen.findByText('Open source only')).toBeDefined()
    expect(line).toHaveTextContent('Graded for Larger team · Managed · Open source only')
  })

  it('orders the alternatives by fit or maturity, and keeps the choice in the address', async () => {
    const user = userEvent.setup()
    const router = renderAt('/tools/slack')
    const names = () =>
      pathHeadings().map((rowHeading) => within(rowHeading).getAllByRole('link')[0]!.textContent)
    expect(names()).toEqual(['Mattermost', 'Zulip', 'Element (Matrix)'])
    // Whatever the order, the easiest one stays marked.
    const easiest = () => screen.getByText('Easiest for you').closest('tr')
    expect(easiest()).toBe(pathRow('Mattermost'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Most mature first')
    expect(names()[0]).toBe('Zulip')
    expect(router.state.location.search).toBe('?sort=maturity')
    expect(easiest()).toBe(pathRow('Mattermost'))
  })

  it('points to GitHub for the list of contributors instead of keeping its own', () => {
    renderAt('/about')
    expect(screen.getByRole('link', { name: /Everyone who has contributed/ })).toHaveAttribute(
      'href',
      'https://github.com/noobmaster69/ExitPath/graphs/contributors',
    )
    expect(screen.queryByText(/Written or checked by/)).toBeNull()
  })

  it('says which entries a person has checked and which are AI drafts', () => {
    renderAt('/alternatives/galene')
    const credit = screen.getByText(/Written or checked by/)
    expect(within(credit).getByRole('link', { name: /Stefane Fermigier/ })).toHaveAttribute(
      'href',
      'https://github.com/sfermigier',
    )
    cleanup()

    renderAt('/alternatives/nextcloud')
    expect(screen.getByText(/^AI draft: written with an AI assistant/)).toBeDefined()
    expect(screen.getByRole('link', { name: /Check or correct this entry/ })).toHaveAttribute(
      'href',
      'https://github.com/noobmaster69/ExitPath/edit/main/catalog/alternatives/nextcloud.json',
    )
    cleanup()

    // In the table, the same fact in two words.
    renderAt('/tools/zoom')
    expect(pathRow('Galène')).toHaveTextContent('Checked')
    expect(pathRow('Jitsi Meet')).toHaveTextContent('AI draft')
  })

  it('applies the colours and text size chosen in the options', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.click(screen.getByRole('button', { name: 'Options' }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    await user.click(screen.getByRole('radio', { name: 'Large' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.text).toBe('large')

    await user.click(screen.getByRole('radio', { name: 'Match my device' }))
    await user.click(screen.getByRole('radio', { name: 'Normal' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(document.documentElement.dataset.text).toBeUndefined()
  })

  it('ticking a step updates progress and saves it', async () => {
    const user = userEvent.setup()
    const guide = guides[0]!
    const total = stepIds(guide).length
    renderAt(`/guides/${guide.id}`)

    const progress = screen.getByRole('complementary', { name: 'Your progress' })
    expect(progress).toHaveTextContent(`0 of ${total} steps`)

    const [first, second] = screen.getAllByRole('checkbox')
    await user.click(first!)
    await user.click(second!)
    expect(progress).toHaveTextContent(`2 of ${total} steps`)

    await user.click(first!)
    expect(progress).toHaveTextContent(`1 of ${total} steps`)

    const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY)!)
    expect(stored[guide.id].done).toEqual([stepIds(guide)[1]])
  })

  it('asks before clearing a guide, in the page rather than a browser dialog', async () => {
    const user = userEvent.setup()
    const guide = guides[0]!
    const total = stepIds(guide).length
    renderAt(`/guides/${guide.id}`)
    const progress = screen.getByRole('complementary', { name: 'Your progress' })

    await user.click(screen.getAllByRole('checkbox')[0]!)
    expect(progress).toHaveTextContent(`1 of ${total} steps`)

    // Cancelling keeps everything.
    await user.click(screen.getByRole('button', { name: 'Clear my progress' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(progress).toHaveTextContent(`1 of ${total} steps`)

    // Confirming clears it.
    await user.click(screen.getByRole('button', { name: 'Clear my progress' }))
    await user.click(screen.getByRole('button', { name: 'Yes, clear' }))
    expect(progress).toHaveTextContent(`0 of ${total} steps`)
    expect(localStorage.getItem(PROGRESS_KEY)).toBe('{}')
  })

  it('export always offers the data as text, and erase asks first', async () => {
    const user = userEvent.setup()
    const guide = guides[0]!
    renderAt(`/guides/${guide.id}`)
    await user.click(screen.getAllByRole('checkbox')[0]!)
    cleanup()

    renderAt('/guides')
    await user.click(screen.getByRole('button', { name: 'open the options' }))
    const options = within(screen.getByRole('dialog', { name: 'Options' }))
    await user.click(options.getByRole('button', { name: 'Export my data' }))
    const exported = JSON.parse((options.getByLabelText('Your data as text') as HTMLTextAreaElement).value)
    expect(exported.format).toBe('exitpath-export')
    expect(exported.progress[guide.id].done).toEqual([stepIds(guide)[0]])

    await user.click(options.getByRole('button', { name: 'Erase everything' }))
    expect(localStorage.getItem(PROGRESS_KEY)).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(options.getByRole('button', { name: 'Erase everything' })).toHaveFocus()

    await user.click(options.getByRole('button', { name: 'Erase everything' }))
    await user.click(options.getByRole('button', { name: 'Yes, erase' }))
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(options.getByRole('status')).toHaveTextContent(/has been erased/)
    expect(options.queryByLabelText('Your data as text')).toBeNull()
  })

  it('builds a plan from the tools you tick', async () => {
    const user = userEvent.setup()
    renderAt('/plan')
    expect(screen.getByText('Nothing in your plan yet')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Slack' }))
    await user.click(screen.getByRole('button', { name: 'Visual Studio Code' }))
    expect(heading()).toHaveTextContent('Your plan')
    expect(screen.getByRole('heading', { name: '2 moves, easiest first' })).toBeDefined()
    expect(getPlan()).toEqual({ slack: null, vscode: null })

    // Easiest first: swapping an editor is easier than moving a team's chat.
    const moves = screen.getAllByRole('listitem').filter((item) => within(item).queryByRole('combobox'))
    expect(moves).toHaveLength(2)
    expect(within(moves[0]!).getByRole('heading')).toHaveTextContent('VSCodium')

    // Choosing a specific destination is remembered.
    await user.selectOptions(within(moves[1]!).getByRole('combobox'), 'zulip')
    expect(getPlan().slack).toBe('zulip')
    expect(
      within(
        screen.getAllByRole('listitem').filter((item) => within(item).queryByRole('combobox'))[1]!,
      ).getByRole('heading'),
    ).toHaveTextContent('Zulip')

    await user.click(screen.getByRole('button', { name: 'Remove Slack from the plan' }))
    expect(getPlan()).toEqual({ vscode: null })
    expect(screen.getByRole('heading', { name: '1 move, easiest first' })).toBeDefined()
  })

  it('adds a whole suite to the plan without overriding earlier picks', async () => {
    const user = userEvent.setup()
    setPlanChoice('onedrive', 'seafile')
    renderAt('/plan')
    await user.click(screen.getByRole('button', { name: 'Add all of Microsoft 365' }))
    const plan = getPlan()
    expect(Object.keys(plan).sort()).toEqual([
      'microsoft-entra',
      'microsoft-office',
      'microsoft-teams',
      'onedrive',
      'outlook-exchange',
      'zoom',
    ])
    expect(plan.onedrive).toBe('seafile')
  })

  it('adds a path to the plan from a tool page and counts it in the header', async () => {
    const user = userEvent.setup()
    renderAt('/tools/notion')
    await user.click(within(pathRow('Outline')).getByRole('button', { name: 'Add to my plan' }))
    expect(getPlan()).toEqual({ notion: 'outline' })
    expect(within(pathRow('Outline')).getByRole('button', { name: 'In your plan' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('link', { name: 'Plan, 1 move planned' })).toBeDefined()

    // Another alternative for the same tool offers to switch rather than add.
    await user.click(within(pathRow('AppFlowy')).getByRole('button', { name: 'Use this in my plan' }))
    expect(getPlan()).toEqual({ notion: 'appflowy' })
  })

  it('opens search from any page with the slash key', async () => {
    const user = userEvent.setup()
    const router = renderAt('/about')
    expect(screen.queryByRole('combobox')).toBeNull()

    await user.keyboard('/')
    const input = screen.getByPlaceholderText(/Search for a tool, such as/)
    expect(input).toHaveFocus()
    await user.type(input, 'immich')
    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/alternatives/immich')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('does not hijack the slash key while typing', async () => {
    const user = userEvent.setup()
    renderAt('/browse')
    await user.type(screen.getByRole('searchbox'), 'a/b')
    expect(screen.getByRole('searchbox')).toHaveValue('a/b')
    expect(screen.queryByPlaceholderText(/Search for a tool, such as/)).toBeNull()
  })

  it('shows returning visitors where they left off', async () => {
    const guide = guides[0]!
    setStepDone(guide.id, stepIds(guide)[0]!, true)
    setPlanChoices({ slack: 'mattermost', notion: null })
    renderAt('/')
    const pickUp = screen.getByRole('region', { name: 'Pick up where you left off' })
    expect(within(pickUp).getByRole('link', { name: new RegExp(guide.title) })).toHaveAttribute(
      'href',
      `/guides/${guide.id}`,
    )
    expect(within(pickUp).getByRole('link', { name: /2 moves/ })).toHaveAttribute('href', '/plan')
  })

  it('says nothing about picking up to a newcomer', () => {
    renderAt('/')
    expect(screen.queryByRole('region', { name: 'Pick up where you left off' })).toBeNull()
  })

  it('links every entry to its file in the repository', () => {
    renderAt('/tools/slack')
    expect(screen.getByRole('link', { name: /Edit this entry/ })).toHaveAttribute(
      'href',
      'https://github.com/noobmaster69/ExitPath/edit/main/catalog/tools/slack.json',
    )
  })

  it('browse filters by category and by name', async () => {
    const user = userEvent.setup()
    renderAt('/browse')
    expect(screen.getByRole('status')).toHaveTextContent(`Showing ${tools.length} tools`)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Team chat')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 tools')

    await user.type(screen.getByRole('searchbox'), 'sla')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 tool')
    expect(screen.getByRole('link', { name: /Slack/ })).toBeDefined()

    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('Nothing matches those filters')).toBeDefined()
  })

  it('browse narrows the alternatives by licence, server and hosting', async () => {
    const user = userEvent.setup()
    const router = renderAt('/browse?view=alternatives')
    const shown = () => Number(/Showing (\d+)/.exec(screen.getByRole('status').textContent)![1])
    expect(shown()).toBe(alternatives.length)

    await user.click(screen.getByRole('button', { name: 'Works without a server' }))
    const withoutServer = alternatives.filter(
      (alternative) => alternative.selfHosting === null || alternative.selfHosting.optional === true,
    )
    expect(shown()).toBe(withoutServer.length)
    expect(router.state.location.search).toContain('noserver=1')
    await user.click(screen.getByRole('button', { name: 'Works without a server' }))

    await user.click(screen.getByRole('button', { name: 'Has managed hosting' }))
    expect(shown()).toBe(alternatives.filter((alternative) => alternative.managedHosting.length > 0).length)
    await user.click(screen.getByRole('button', { name: 'Has managed hosting' }))

    await user.click(screen.getByRole('button', { name: 'Checked by a person' }))
    const checked = alternatives.filter((alternative) => alternative.checkedBy)
    expect(shown()).toBe(checked.length)
    expect(screen.getByRole('link', { name: checked[0]!.name })).toBeDefined()
    expect(router.state.location.search).toContain('checked=1')
    await user.click(screen.getByRole('button', { name: 'Checked by a person' }))

    // The licence filter is the same setting as in the options, so it follows you to other pages.
    await user.click(screen.getByRole('button', { name: 'Open source only' }))
    expect(shown()).toBe(alternatives.filter((alternative) => alternative.openness === 'open-source').length)
    expect(getPrefs().licences).toBe('open')
  })

  it('ticks off finished moves and works out how long the rest will take', async () => {
    const user = userEvent.setup()
    setPlanChoices({ vscode: 'vscodium', slack: 'zulip' })
    renderAt('/plan')
    const summary = () => screen.getByText(/hours a week/).closest('dl')!
    expect(summary()).toHaveTextContent('Hands-on work')
    expect(summary()).toHaveTextContent('At 5 hours a week')
    expect(summary()).toHaveTextContent('Hardest move left' + 'Slack')

    await user.click(screen.getByRole('checkbox', { name: 'Visual Studio Code to VSCodium: done' }))
    expect(getPlanDone()).toEqual(['vscode'])
    expect(summary()).toHaveTextContent('Work left')
    expect(summary()).toHaveTextContent('1 of 2 moves done.')
    expect(summary()).toHaveTextContent('Last move' + 'Slack')

    await user.click(screen.getByRole('checkbox', { name: 'Slack to Zulip: done' }))
    expect(summary()).toHaveTextContent('Finished')

    // The pace is one of the options, and the timeline follows it.
    await user.click(screen.getByRole('checkbox', { name: 'Slack to Zulip: done' }))
    const before = summary().textContent
    await user.click(screen.getByRole('button', { name: 'Change the pace' }))
    await user.click(screen.getByRole('radio', { name: '2 hours' }))
    expect(summary()).toHaveTextContent('At 2 hours a week')
    expect(summary().textContent).not.toBe(before)
  })

  it('folds the tool picker away once there is a plan, and brings it back when the plan is cleared', async () => {
    const user = userEvent.setup()
    setPlanChoices({ slack: null })
    renderAt('/plan')
    const picker = () => screen.getByText('What do you use?').closest('details')!
    expect(picker().open).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Clear my plan' }))
    await user.click(screen.getByRole('button', { name: 'Yes, clear' }))
    expect(getPlan()).toEqual({})
    expect(picker().open).toBe(true)
    expect(screen.getByText('Nothing in your plan yet')).toBeDefined()
  })

  it('copies the plan as Markdown and as a link', async () => {
    const user = userEvent.setup()
    setPlanChoices({ vscode: 'vscodium', slack: null })
    setMoveDone('vscode', true)
    renderAt('/plan')

    await user.click(screen.getByRole('button', { name: 'Copy as Markdown' }))
    const markdown = await navigator.clipboard.readText()
    expect(markdown).toContain('- [x] **Visual Studio Code → VSCodium**')
    expect(markdown).toContain('- [ ] **Slack → Mattermost**')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Copy a link to this plan' }))
    expect(await navigator.clipboard.readText()).toMatch(/#\/plan\?p=vscode\.vscodium~slack$/)
  })

  it('shows the text to copy when the clipboard is not available', async () => {
    const user = userEvent.setup()
    setPlanChoices({ slack: null })
    renderAt('/plan')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('blocked')) },
    })
    await user.click(screen.getByRole('button', { name: 'Copy as Markdown' }))
    const box = (await screen.findByLabelText('Select and copy')) as HTMLTextAreaElement
    expect(box.value).toContain('**Slack → Mattermost**')
  })

  it('previews a plan from a link and only saves it when asked', async () => {
    const user = userEvent.setup()
    const router = renderAt('/plan?p=slack.zulip~github~not-a-tool')
    const shared = screen.getByRole('region', { name: 'A plan shared with you' })
    expect(shared).toHaveTextContent('Slack to Zulip')
    expect(shared).toHaveTextContent('GitHub to Forgejo')
    expect(getPlan()).toEqual({})

    await user.click(within(shared).getByRole('button', { name: 'Save as my plan' }))
    expect(getPlan()).toEqual({ slack: 'zulip', github: null })
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('region', { name: 'A plan shared with you' })).toBeNull()
    expect(screen.getByRole('heading', { name: '2 moves, easiest first' })).toBeDefined()
  })

  it('asks before a shared plan replaces your own, and can be dismissed', async () => {
    const user = userEvent.setup()
    setPlanChoices({ notion: 'logseq' })
    renderAt('/plan?p=slack.zulip')
    const shared = () => screen.getByRole('region', { name: 'A plan shared with you' })

    await user.click(within(shared()).getByRole('button', { name: 'Save as my plan' }))
    expect(getPlan()).toEqual({ notion: 'logseq' })
    await user.click(within(shared()).getByRole('button', { name: 'Cancel' }))
    await user.click(within(shared()).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('region', { name: 'A plan shared with you' })).toBeNull()
    expect(getPlan()).toEqual({ notion: 'logseq' })
  })

  it('does not offer a shared plan that is the one you already have', () => {
    setPlanChoices({ slack: 'zulip' })
    renderAt('/plan?p=slack.zulip')
    expect(screen.queryByRole('region', { name: 'A plan shared with you' })).toBeNull()
  })

  it('hides finished steps on a checklist when asked, and copies it as Markdown', async () => {
    const user = userEvent.setup()
    const guide = guides[0]!
    const total = stepIds(guide).length
    renderAt(`/guides/${guide.id}`)
    expect(screen.queryByRole('button', { name: 'Hide finished steps' })).toBeNull()

    await user.click(screen.getAllByRole('checkbox')[0]!)
    await user.click(screen.getByRole('button', { name: 'Hide finished steps' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(total - 1)
    // Still counted, only out of sight.
    expect(screen.getByRole('complementary', { name: 'Your progress' })).toHaveTextContent(
      `1 of ${total} steps`,
    )
    await user.click(screen.getByRole('button', { name: 'Hide finished steps' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(total)

    await user.click(screen.getByRole('button', { name: 'Copy as Markdown' }))
    const markdown = await navigator.clipboard.readText()
    expect(markdown.startsWith(`# ${guide.title}\n`)).toBe(true)
    expect(markdown.match(/^- \[x\] /gm)).toHaveLength(1)
  })
})
