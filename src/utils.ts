export const USER_AGENT = 'indieping/0.1 (+https://github.com)'

export function normalizeDomain(input: string): string {
  return input
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase()
    .trim()
}
