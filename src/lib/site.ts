/** Where the source and the catalog live. Change these if you fork the project. */
export const REPO_URL = 'https://github.com/noobmaster69/ExitPath'
export const DEFAULT_BRANCH = 'main'

export type CatalogFolder = 'tools' | 'alternatives' | 'guides' | 'suites'

/** GitHub's in-browser editor for one catalog entry; it offers to open a pull request. */
export const editUrl = (folder: CatalogFolder, id: string) =>
  `${REPO_URL}/edit/${DEFAULT_BRANCH}/catalog/${folder}/${id}.json`

/** A new issue with the title filled in, and optionally the start of its text. */
export const issueUrl = (title: string, body?: string) =>
  `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}${body ? `&body=${encodeURIComponent(body)}` : ''}`

/**
 * What the catalog lists, said where someone asking for an addition will read
 * it: in the issue they are about to write. It is a comment, so it guides the
 * writer and does not show in the issue once posted.
 */
export const REQUEST_NOTE =
  '<!-- You can ask for a proprietary tool to leave, or for an alternative to one. ' +
  'An alternative must have its source available (open source, open core or source-available): ' +
  'proprietary products are not listed as alternatives. ' +
  'Please say what it is and what licence it is under. -->\n\n'

/** A new issue asking for something to be covered. */
export const requestUrl = (name = '') => issueUrl(`Please cover: ${name}`, REQUEST_NOTE)

/** GitHub's own list of everyone who has contributed. It is always current, so the site keeps no copy. */
export const CONTRIBUTORS_URL = `${REPO_URL}/graphs/contributors`
