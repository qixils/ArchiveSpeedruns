import "dotenv/config";
import { fetchJson } from "./utils";
import { MergeExclusive, Promisable } from "type-fest";

interface RawCredentials {
  access_token: string
  expires_in: number
  token_type: string
}

interface Credentials extends Omit<RawCredentials, 'expires_in'> {
  expires_at: number
}

let credentials: Credentials | undefined = undefined
const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env

export const getCredentials = async (): Promise<Credentials> => {
  if (credentials && Date.now() < credentials.expires_at) {
    return credentials
  }
  credentials = undefined

  const { expires_in, ...newCredentials }: RawCredentials = await fetchJson("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID!,
      client_secret: TWITCH_CLIENT_SECRET!,
      grant_type: "client_credentials",
    }).toString(),
  }, 10)

  credentials = {
    ...newCredentials,
    expires_at: Date.now() + expires_in,
  }

  return credentials
}

interface PaginationOptions {
  after?: string
  before?: string
}

interface PaginationResponse<T> {
  data: T[]
  pagination: {
    cursor?: string
  }
  url: string | URL
}

interface BasicResponse<T> {
  data: T[]
}

type VideoType = 'archive' | 'highlight' | 'upload'

/**
 * Options for game-based and user-based video search
 */
interface BaseVideoSearchOptions {
  /**
   * default 'all'
   */
  period?: 'all' | 'day' | 'month' | 'week'
  /**
   * always descending
   * default 'time'
   */
  sort?: 'time' | 'trending' | 'views'
  /**
   * default 'all'
   */
  // TODO: can this be multiple?
  type?: 'all' | VideoType
  /**
   * items per page, 1-100
   * default 20
   */
  first?: number
}

interface GameVideoSearchOptions extends BaseVideoSearchOptions {
  /**
   * a category or game ID
   */
  game_id: string
  /**
   * https://help.twitch.tv/s/article/languages-on-twitch#streamlang
   * i.e. 'DE' for german, 'other' for unsupported
   */
  language?: string
}

interface UserVideoSearchOptions extends BaseVideoSearchOptions, PaginationOptions {
  user_id: string
}

interface BulkVideoSearchOptions {
  id: string | string[]
}

type VideoSearchOptions = MergeExclusive<BulkVideoSearchOptions, MergeExclusive<UserVideoSearchOptions, GameVideoSearchOptions>>

interface Video {
  id: string
  stream_id: string
  user_id: string
  user_login: string
  user_name: string
  title: string
  description: string
  created_at: string
  published_at: string
  url: string
  thumbnail_url: string
  viewable: 'public'
  view_count: number
  language: string
  type: VideoType
  /**
   * 3m21s
   */
  duration: string
  muted_segments?: {
    duration: number
    offset: number
  }[]
}

type VideoSearchResponse = PaginationResponse<Video>

interface UserSearchOptions {
  id?: string | string[]
  login?: string | string[]
}

interface User {
  id: string
  login: string
  display_name: string
  type: 'admin' | 'global_mod' | 'staff' | ''
  broadcaster_type: 'affiliate' | 'partner' | ''
  description: string
  profile_image_url: string
  offline_image_url: string
  /**
   * @deprecated
   */
  view_count: number
  email?: string
  created_at: string
}

type UserSearchResponse = BasicResponse<User>

export const getAll = async <T>(promise: Promisable<PaginationResponse<T>>): Promise<T[]> => {
  const data: T[] = []
  
  let response = await promise

  while (true) {
    if (!response) break

    data.push(...response.data)

    const nextCursor = response.pagination.cursor
    if (!nextCursor) break

    const nextUri = new URL(response.url)
    nextUri.searchParams.set('after', nextCursor)

    const { access_token } = await getCredentials()
    const newResponse = await fetchJson(nextUri, { headers: {
      'Authorization': `Bearer ${access_token}`,
      'Client-Id': TWITCH_CLIENT_ID!,
    } })
    response = {
      ...newResponse,
      url: nextUri,
    }
  }

  return data
}

export const getVideos = async (options: VideoSearchOptions): Promise<VideoSearchResponse> => {
  const url = new URL("https://api.twitch.tv/helix/videos")

  for (const [key, value] of Object.entries(options)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, String(entry))
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  
  const { access_token } = await getCredentials()
  const response: Omit<VideoSearchResponse, 'url'> = await fetchJson(url, { headers: {
    'Authorization': `Bearer ${access_token}`,
    'Client-Id': TWITCH_CLIENT_ID!,
  } })

  return {
    ...response,
    url,
  }
}

export const getUsers = async (options: UserSearchOptions): Promise<UserSearchResponse> => {
  const url = new URL("https://api.twitch.tv/helix/users")

  for (const [key, value] of Object.entries(options)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, String(entry))
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  
  const { access_token } = await getCredentials()
  const response: UserSearchResponse = await fetchJson(url, { headers: {
    'Authorization': `Bearer ${access_token}`,
    'Client-Id': TWITCH_CLIENT_ID!,
  } })

  return {
    ...response,
  }
}
