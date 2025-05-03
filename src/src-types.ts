import { Merge } from "type-fest"

export type TimeType = 'primary' | 'realtime' | 'realtime_noloads' | 'ingame'
export type ModType = 'super-moderator' | 'moderator' // TODO: verifier?
export type AssetType = 'logo' | 'cover-tiny' | 'cover-small' | 'cover-medium' | 'cover-large' | 'icon' | 'trophy-1st' | 'trophy-2nd' | 'trophy-3rd' | 'trophy-4th' | 'background' | 'foreground'
export type VerificationStatus = 'verified' | 'new' | 'rejected'

export type PaginationLinkType = 'prev' | 'next'
export type DeveloperLinkType = 'self' | 'games'
export type VariableLinkType = 'self' | 'game'
export type PlatformLinkType = 'self' | 'games' | 'runs'
export type UserLinkType = 'self' | 'runs' | 'games' | 'personal-bests'
export type LevelLinkType = 'self' | 'game' | 'categories' | 'variables' | 'records' | 'runs' | 'leaderboard'
export type CategoryLinkType = 'self' | 'game' | 'variables' | 'records' | 'runs' | 'leaderboard'
export type GameLinkType = 'self' | 'runs' | 'levels' | 'categories' | 'variables' | 'records' | 'series' | 'derived-games' | 'romhacks' | 'leaderboard'
export type RunLinkType = 'self' | 'game' | 'category' | 'level' | 'platform' | 'examiner'
export type Links<Keys extends string> = { rel: Keys, uri: string }[]

export interface PaginationResponse<T> {
  data: T[]
  pagination: {
    offset: number
    max: number
    size: number
    links: Links<PaginationLinkType>
  }
}

export interface Platform {
  id: string
  name: string
  released: number
  links: Links<PlatformLinkType>
}

export interface Region {
  id: string
  name: string
  links: Links<PlatformLinkType>
}

export interface Developer {
  id: string
  name: string
  links: Links<DeveloperLinkType>
}

export interface Publisher {
  id: string
  name: string
  links: Links<DeveloperLinkType>
}

interface Names {
  international: string
  japanese?: string
}

export interface User {
  id: string
  names: Names
  supporterAnimation: boolean
  pronouns: string // TODO: is this hardcoded?
  weblink: string
  // 'name-style':
  // role: string
  // location:
  signup: string
  twitch?: { uri: string }
  hitbox?: { uri: string }
  youtube?: { uri: string }
  twitter?: { uri: string }
  speedrunslive?: { uri: string }
  // assets:
  links: Links<UserLinkType>
}

export interface Level {
  id: string
  name: string
  weblink: string
  rules?: string
  links: Links<LevelLinkType>
}

export interface Category extends Level {
  type: 'per-game' | 'per-level'
  players: {
    type: 'exactly' | 'up-to'
    value: number
  }
  miscellaneous: boolean
  links: Links<CategoryLinkType>
}

export interface Variable {
  id: string
  name: string
  category?: string
  scope: {
    // TODO
    type: 'global' | 'all-levels'
  }
  mandatory: boolean
  'user-defined': boolean
  obsoletes: boolean
  values: {
    /**
     * @deprecated
     */
    choices: { [key: string]: string } // ID to human name map
    values: {
      [key: string]: {
        label: string
        rules?: string
        flags: {
          miscellaneous: boolean
        }
      }
    }
    default: string // ID
  }
  'is-subcategory': boolean
  links: Links<VariableLinkType>
}

export interface Genre {
  id: string
  name: string
  links: Links<DeveloperLinkType>
}

export interface Engine {
  id: string
  name: string
  links: Links<DeveloperLinkType>
}

export interface GameType {
  id: string
  name: string
  links: Links<DeveloperLinkType>
}

export interface BulkGame {
  id: string
  names: Names
  abbreviation: string
  weblink: string
}

export interface ExtendedGame extends BulkGame {
  boostReceived: number
  boostDistinctDonors: number
  discord: string
  released: number
  'release-date': string
  ruleset: {
    'show-milliseconds': boolean
    'require-verification': true
    'require-video': true
    'run-times': TimeType[]
    'default-time': TimeType
    'emulators-allowed': boolean
  }
  romhack: boolean
  gametypes: string[]
  platforms: string[]
  regions: string[]
  genres: string[]
  engines: string[]
  developers: string[]
  publishers: string[]
  moderators: { [id: string]: ModType }
  // created:
  assets: { [Id in AssetType]: { uri?: string } }
  links: Links<GameLinkType>
}

type Embed<Embedded> = { data: Embedded[] }

export interface EmbeddedGame {
  gametypes: Embed<GameType>
  engines: Embed<Engine>
  developers: Embed<Developer>
  publishers: Embed<Publisher>
  platforms: Embed<Platform>
  regions: Embed<Region>
  moderators: Embed<User> // yes, this does overwrite what type of mod they are, lol
  levels: Embed<Level>
  categories: Embed<Category>
  variables: Embed<Variable>
  genres: Embed<Genre>
}

export interface Run {
  id: string
  weblink: string
  game: string
  level?: string
  category: string
  videos?: {
    text?: string,
    links: { uri: string }[]
  }
  comment: string
  status: {
    status: VerificationStatus,
    examiner: string,
    "verify-date": string
  },
  players: {
    rel: 'user' | 'guest'
    id: string
    uri: string
  }[]
  date: string,
  submitted?: string // i think?
  times: Merge<
    { [Type in TimeType]?: string },
    { [Type in TimeType as `${Type}_t`]: number }
  >
  system: {
    platform: string
    emulated: boolean
    region?: string
  },
  splits?: {
    rel: string
    uri: string
  }
  values: Record<string, string>
  links: Links<RunLinkType>
}

//// API objects

export interface SortableOptions<Sorts extends string> {
  orderby?: Sorts
  direction?: 'asc' | 'desc'
}

export interface GameOptions<Embeds extends keyof EmbeddedGame>
extends SortableOptions<'name.int' | 'name.jap' | 'abbreviation' | 'released' | 'created' | 'similarity'> {
  name?: string
  abbreviation?: string
  released?: number
  gametype?: string
  platform?: string
  region?: string
  genre?: string
  engine?: string
  developer?: string
  publisher?: string
  moderator?: string
  /**
   * @deprecated
   */
  romhack?: boolean
  embed?: ReadonlyArray<Embeds>
}