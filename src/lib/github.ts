import { site } from './site-config'

export type ContributionDay = {
  contributionCount: number
  date: string
  weekday: number
}

export type ContributionCalendar = {
  totalContributions: number
  weeks: Array<{ contributionDays: ContributionDay[] }>
}

/** The GitHub login from site.config.ts (`social.github`), a bare handle or a full profile
 *  URL. Absent = the contribution calendar has nobody to draw, so it self-disables. */
function githubLogin(): string | null {
  const raw = site.social.github
  if (!raw) return null
  return raw.replace(/^https?:\/\/[^/]+\//, '').replace(/^@/, '').replace(/\/.*$/, '') || null
}

export async function getGitHubContributions(): Promise<ContributionCalendar | null> {
  const token = process.env.GITHUB_TOKEN
  const login = githubLogin()
  if (!token || !login) return null

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `{
          user(login: ${JSON.stringify(login)}) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                    weekday
                  }
                }
              }
            }
          }
        }`,
      }),
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json?.data?.user?.contributionsCollection?.contributionCalendar ?? null
  } catch {
    return null
  }
}
