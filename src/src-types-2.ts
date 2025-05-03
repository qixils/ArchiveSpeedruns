export interface PaginationResponse {
  pagination: {
    count: number
    page: number
    pages: number
    per: number
  }
  url: string | URL // to be added afterwards by yours truly for pagination
}

export enum Verification {
  Pending = 0,
  Verified,
  Rejected,
}

export enum Obsoletion {
  Hidden = 0,
  Shown,
  Exclusive,
}

export enum VideoFilter {
  Optional = 0,
  Required,
  Missing,
}

export interface Run {
  id: string
  gameId: string
  categoryId: string
  levelId?: string
  time?: number
  timeWithLoads?: number
  igt?: number
  enforceMs?: boolean
  platformId: string
  emulator: boolean
  regionId?: string
  video?: string
  comment?: string
  submittedById: string
  verified: Verification
  verifiedById: string
  reason?: string
  date: number
  dateSubmitted: number
  dateVerified?: number
  hasSplits: boolean
  obsolete: boolean
  place: number
  issues?: string[]
  playerIds: string[]
  valueIds: string[]
  orphaned?: boolean
  estimated?: boolean
}

export interface ChallengeRun extends Run {
  challengeId: string
}

export interface Player {
  id: string
  name: string
  url: string
  powerLevel: number
  color1Id: string
  color2Id: string
  colorAnimate: number
  areaId: string
}

// light guessage
export interface News {
  id: string
  gameId: string
  userId: string
  title: string
  body: string
  dateSubmitted: number
}

// huge guessage
export interface Resource {
  id: string
  // type
  name: string
  description: string
  date: number
  userId: string
  gameId: string
  path?: string
  link?: string
  fileName: string
  authorNames: string[]
}

export interface Guide {
  id: string
  name: string
  text: string
  date: number
  userId: string
  gameId: string
}

export interface Thread {
  id: string
  name: string
  gameId: string
  forumId: string
  userId: string
  replies: number
  created: number
  lastCommentId: string
  lastCommentUserId: string
  lastCommentDate: number
  sticky: boolean
  locked: boolean
}

export interface Forum {
  id: string
  name: string
  url: string
  description: string
  // type
  // threadCount
  // postCount
  // lastPostId
}

export interface Comment {
  id: string
  // itemType
  itemId: string
  date: number
  userId: string
  text: string
  parentId: string
  // deleted
}

export interface Like {
  // itemType
  itemId: string
  userId: string
  date: number
}

export interface Game {

}

export interface Page {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  userId: string
  createDate: number
  updateDate: number
  publishDate: number
  // publishTarget
  // publishTags[]
  // commentsCount
}

export interface Article extends Omit<Page, 'publishDate'> {
  gameId: string
  coverImagePath: string
  // community
}

export interface Challenge {
  id: string
  name: string
  url: string
  gameId: string
  createDate: number
  updateDate: number
  startDate: number
  endDate: number
  // state: int (enum)
  description: string
  rules: string
  numPlayers: number
  exactPlayers: number
  // playerMatchMode: int (enum)
  timeDirections: number
  enforceMs: boolean
  coverImagePath: string
  contest: boolean
  contestRules: string
  // runCommentsMode: int (enum)
  prizeConfig: {
      prizePool: number
      currency: string
      prizes: {
          place: number
          amount: number
      }[]
  }
  runsCommentsMode: number
}

export interface Series {
  id: string
  name: string
  url: string
  addedDate: number
  touchDate: number
  websiteUrl?: string
  discordUrl?: string
  runCount: number
  activePlayerCount: number
  totalPlayerCount: number
  officialGameCount: number
  // staticAssets
}

export interface GameResponse extends PaginationResponse {
  runList: Run[]
  playerList: Player[]
}

export interface NewsListResponse extends PaginationResponse {
  newsList: News[]
  users: Player[]
}

export interface ResourceListResponse extends PaginationResponse {
  resourceList: Resource[]
  users: Player[]
}

export interface GuideListResponse extends PaginationResponse {
  guideList: Guide[]
  users: Player[]
}

export interface ThreadListResponse extends PaginationResponse {
  threadList: Thread[]
  users: Player[]
}

export interface ThreadResponse extends PaginationResponse {
  thread: Thread
  commentList: Comment[]
  userList: Player[]
  likeList: Like[]
}

export interface ForumListResponse extends PaginationResponse {
  forumList: Forum[]
  gameList: Game[]
  userList: Player[]
}

export interface ChallengeLeaderboardResponse extends PaginationResponse {
  challengeRunList: ChallengeRun[]
  playerList: Player[]
  userList: Player[]
}

export interface SearchResponse extends PaginationResponse {
  gameList?: Game[]
  newsList?: News[]
  pageList?: Page[]
  seriesList?: Series[]
  userList?: Player[]
  challengeList?: Challenge[]
}

export interface ArticleListResponse extends PaginationResponse {
  articleList: Article[]
  gameList: Game[]
  userList: Player[]
}

export interface GameSummaryResponse {
  game: Game
  // gameBoosts: GameBoost[]
  // gameModerators: GameModerator[]
  forum: Forum
  newsList: News[]
  // gameStats: GameStats[]
  // stats: GameStats
  relatedGames: Game[]
  seriesList: Series[]
  // theme: Theme
  threadList: Thread[]
  users: Player[]
  challengeList: Challenge[]
  challengeCount: number
  guideCount: number
  levelCount: number
  newsCount: number
  relatedCount: number
  resourceCount: number
  streamCount: number
  threadCount: number
}

export interface SeriesListResponse extends PaginationResponse {
  seriesList: Series[]
}

export interface SeriesSummaryResponse {
  series: Series
  forum: Forum
  gameList: Game[]
  // moderatorList: GameModerator[]
  // theme: Theme
  threadList: Thread[]
  userList: Player[]
  gameCount: number
  streamCount: number
  threadCount: number
}
