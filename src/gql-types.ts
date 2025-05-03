export interface GQLResponse<T> {
  data?: T
  errors?: { message: string }[]
}

export type ID = string
export type Time = string

export interface User {
  id: ID
  login: string
  displayName: string
  followers: {
    totalCount: number
  }
  roles: {
    isAffiliate: boolean
    isPartner: boolean
    isStaff: boolean
    isGlobalMod: boolean
    isSiteAdmin: boolean
  }
  videos: {
    edges: {
      node: Pick<Video, 'createdAt' | 'recordedAt' | 'publishedAt' | 'viewableAt' | 'updatedAt'>
    }[]
  }
  // ... other user fields would go here
}

export enum BroadcastType {
  ARCHIVE = 'ARCHIVE',
  HIGHLIGHT = 'HIGHLIGHT',
  UPLOAD = 'UPLOAD',
  PREMIERE_UPLOAD = 'PREMIERE_UPLOAD',
  PAST_PREMIERE = 'PAST_PREMIERE'
}

export interface Video {
  id: ID
  title?: string
  description?: string
  createdAt: Time
  recordedAt?: Time
  publishedAt?: Time
  viewableAt?: Time
  updatedAt?: Time
  lengthSeconds?: number
  viewCount?: number
  language?: string
  broadcastType: BroadcastType
  owner: Pick<User, 'id'>
}

export type VideoQueryOutput<Alias extends string = 'video'> = {
  [key in Alias]: Omit<Video, 'recordedAt' | 'publishedAt' | 'viewableAt' | 'updatedAt'> | null
};
