import base64url from "base64url"
import type * as V1 from "./src-types"
import type * as V2 from "./src-types-2"
import { urlWithParams, fetchJson } from "./utils"
import type { Entries, Merge, Promisable } from "type-fest"

const v1 = "https://www.speedrun.com/api/v1/"
const v2 = "https://www.speedrun.com/api/v2/"

/**
 * Encodes a params record into url-base64 encoded min-json, ready for use as `_r` in a V2 API GET URL.
 * @param params search parameters
 */
const encodeR = (params: Record<string, any>) => {
  const json = JSON.stringify(params)
  return base64url.encode(json)
}

const applyR = (url: string | URL, params: Record<string, any>) => {
  return urlWithParams(url, { "_r": encodeR(params) })
}

export const decodeR = (b64: string) => {
  const json = base64url.decode(b64)
  return JSON.parse(json)
}

const extractR = (uri: string | URL) => {
  const url = new URL(uri)
  const r = url.searchParams.get("_r")
  if (!r) return
  return decodeR(r)
}

export const getAllV1 = async <T>(promise: Promisable<V1.PaginationResponse<T>>, stopper?: ((items: T[]) => boolean)): Promise<T[]> => {
  const data: T[] = []
  
  let response = await promise

  while (true) {
    if (!response) break

    data.push(...response.data)
    if (stopper?.(response.data)) break

    const nextUri = response.pagination.links.find(link => link.rel === 'next')?.uri
    if (!nextUri) break
    // if (nextUri.includes("offset=10000")) break

    response = await fetchJson(nextUri)
  }

  return data
}

export const getAllV2 = async <T extends V2.PaginationResponse>(
  promise: Promisable<T |  undefined>,
): Promise<Partial<Omit<T, 'pagination' | 'url'>> | undefined> => {
  // The types could be crafted in a way to prevent a broad `as` in the `return`
  // But it makes the whole thing a bit messy so I'm not bothering

  const output: { [key: string]: Map<string, any> } = {}
  
  let response = await promise

  while (true) {
    if (!response) break

    for (const [key, value] of Object.entries(response)) {
      if (!Array.isArray(value)) continue

      if (!(key in output)) output[key] = new Map()
      const map = output[key]!
      for (const entry of value) {
        if (typeof entry !== 'object' || !('id' in entry)) continue
        map.set(entry.id, entry)
      }
    }

    // check for new page
    if (!response.pagination) break
    if (response.pagination.page >= response.pagination.pages) break

    const params: { page?: number } | undefined = extractR(response.url)
    const newParams = {
      ...(typeof params === 'object' ? params : {}),
      page: params?.page ? (params.page + 1) : 1, // suppose we started at 0 so next is 1?
    }
    const newUri = applyR(response.url, newParams)

    response = await fetchJson(newUri)
    if (response) {
      response = {
        ...response,
        url: newUri,
      }
    }
  }

  return Object.fromEntries(
    Object.entries(output).map(
      ([key, value]) => [key, [...value.values()]]
    )
  ) as Partial<Omit<T, 'pagination' | 'url'>> | undefined
}

export const getBulkGames = async () => {
  const url = urlWithParams(
    new URL("games", v1),
    { max: '1000', '_bulk': 'yes' },
  )
  return await fetchJson(url) as V1.PaginationResponse<V1.BulkGame>
}

export const getGames = async <Embeds extends keyof V1.EmbeddedGame = never>(
  options?: V1.GameOptions<Embeds>,
): Promise<V1.PaginationResponse<
  Merge<V1.ExtendedGame, Pick<V1.EmbeddedGame, Embeds>>
>> => {
  const url = urlWithParams(
    new URL("games", v1),
    {
      max: '200',
      ...(options?.embed ? { embed: options.embed.join(',') } : {}),
    },
  )
  return await fetchJson(url)
}

export const getVariables = async (
  categoryId: string
) => {
  const url = urlWithParams(
    new URL(`categories/${categoryId}/variables`, v1),
    {},
  )
  return await fetchJson(url) as V1.PaginationResponse<V1.Variable>
}

export const getRunsV1 = async (
  options?: {
    user?: string
    guest?: string
    examiner?: string
    game?: string
    level?: string
    category?: string
    platform?: string
    region?: string
    emulated?: boolean
    status?: V1.VerificationStatus
    orderby?: 'game' | 'category' | 'level' | 'platform' | 'region' | 'emulated' | 'date' | 'submitted' | 'status' | 'verify-date'
    direction?: 'asc' | 'desc'
    max?: number
    // TODO: embed
  }
) => {
  const url = urlWithParams(
    new URL("runs", v1),
    options ?? {},
  )
  return await fetchJson(url) as V1.PaginationResponse<V1.Run>
}

export const getRunsV2 = async (
  params: {
    gameId: string
    categoryId: string
    values?: {
      variableId: string
      valueIds: string[]
    }[]
    video?: V2.VideoFilter
    verified?: V2.Verification // TODO: make sure this is imported properly? its just used as a type here so probably fine
    // timer
    obsolete?: V2.Obsoletion
    platformIds?: string[]
    regionIds?: string[]
    dateFrom?: string
    dateTo?: string
  },
  // TODO: page
) => {
  const url = applyR(
    new URL("GetGameLeaderboard2", v2),
    { params },
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.GameResponse
}

export const getChallengeRuns = async (
  params: {
    challengeId: string
    verified?: V2.Verification
  },
) => {
  const url = applyR(
    new URL("GetChallengeLeaderboard", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.ChallengeLeaderboardResponse
}

export const getNewsList = async (
  params: {
    gameId: string
  },
) => {
  const url = applyR(
    new URL("GetNewsList", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.NewsListResponse
}

export const getResourceList = async (
  params: {
    gameId: string
  },
) => {
  const url = applyR(
    new URL("GetResourceList", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.ResourceListResponse
}

export const getGuideList = async (
  params: {
    gameId: string
  },
) => {
  const url = applyR(
    new URL("GetGuideList", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.GuideListResponse
}

export const getGameSummary = async (
  params: {
    gameId: string
  },
) => {
  const url = applyR(
    new URL("GetGameSummary", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.GameSummaryResponse
}

export const getSeriesSummary = async (
  params: {
    seriesUrl: string
  },
) => {
  const url = applyR(
    new URL("GetSeriesSummary", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.SeriesSummaryResponse
}

export const getThreadList = async (
  params: {
    forumId: string
  },
) => {
  const url = applyR(
    new URL("GetThreadList", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.ThreadListResponse
}

export const getThread = async (
  params: {
    id: string
  },
) => {
  const url = applyR(
    new URL("GetThread", v2),
    params,
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.ThreadResponse
}

export const getArticleList = async () => {
  const url = new URL("GetArticleList", v2)
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.ArticleListResponse
}

export const getForumList = async () => {
  const url = new URL("GetForumList", v2)
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.ForumListResponse
}

export const getSeriesList = async () => {
  const url = new URL("GetSeriesList", v2)
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.SeriesListResponse
}

export const getSearch = async (
  params: {
    query?: string
    favorExactMatches?: boolean
    includeGames?: boolean
    includeNews?: boolean
    includePages?: boolean
    includeSeries?: boolean
    includeUsers?: boolean
    includeChallenges?: boolean
  },
) => {
  const url = applyR(
    new URL("GetSearch", v2),
    {
      query: 'a',
      ...params,
    },
  )
  const body = await fetchJson(url)
  if (!body) return
  return { ...body, url } as V2.SearchResponse
}
