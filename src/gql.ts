import { JsonObject } from "type-fest"
import type { GQLResponse, Video, VideoQueryOutput, User } from "./gql-types"
import { ratelimit } from "./utils"

const gqlUrl = new URL("https://gql.twitch.tv/gql")
const gqlHeaders = { "Client-ID": "kd1unb4b3q4t58fwlpcbzcbnm76a8fp" } // twitch generic client id
const limit = 0

const gqlPost = async <T>(input: JsonObject): Promise<GQLResponse<T>> => {
  await ratelimit(limit)
  const response = await fetch(gqlUrl, {
    method: 'POST',
    headers: gqlHeaders,
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GQL request failed: ${response.status} ${text}`)
  }
  const body: GQLResponse<T> = await response.json()
  if (body.errors?.length && !(body.data && Object.values(body.data).filter(item => !!item).length)) {
    throw new Error(`GQL request failed: ${JSON.stringify(body.errors)}`)
  }
  return body
}

const gqlQuery = async <T>(query: string): Promise<GQLResponse<T>> => {
  query = query.trim().replace(/\s+/g, ' ')
  return await gqlPost({ query })
}

const genVideoQuery = (id: string) => `
  video(id: "${id}") {
    id
    title
    description
    createdAt
    lengthSeconds
    viewCount
    language
    broadcastType
    owner {
      id
    }
  }
`

export const getVideo = async (id: string): Promise<GQLResponse<VideoQueryOutput>> => {
  const query = `
    {
      ${genVideoQuery(id)}
    }
  `

  return await gqlQuery(query)
}

export const getVideos = async (ids: string[]): Promise<Video[]> => {
  const queries = ids.map((id, index) => `video${index}: ${genVideoQuery(id)}`).join("\n")
  const query = `
    {
      ${queries}
    }
  `

  const response: GQLResponse<VideoQueryOutput<string>> = await gqlQuery(query)
  const videos = Object.values(response.data || {}).filter((video) => !!video)
  return videos
}

export const getUsers = async (ids: string[]): Promise<User[]> => {
  const query = `
    {
      users(ids: [${ids.map(id => `"${id}"`).join(", ")}]) {
        id
        login
        displayName
        followers {
          totalCount
        }
        roles {
          isAffiliate
          isPartner
          isStaff
          isGlobalMod
          isSiteAdmin
        }
        videos(first: 1, type: ARCHIVE, sort: TIME_ASC, options: { includePrivate: false }) {
          edges {
            node {
              createdAt
              recordedAt
              publishedAt
              viewableAt
              updatedAt
            }
          }
        }
      }
    }
  `

  const response: GQLResponse<{ users: User[] }> = await gqlQuery(query)
  if (!response.data?.users) return []

  const out = response.data.users.filter(user => !!user)

  // Before we go, let's log a warning for any users that are missing
  const missingUsers = ids.filter(id => !out.some(user => user.id === id))
  if (missingUsers.length > 0) {
    console.warn(`Missing users: ${missingUsers.join(", ")}`)
  }
  
  return out
}

// temp
// ;(async () => {
//   for (let x = 0; x < 1000; x++) {
//     const start = Math.floor(Math.random() * 2400000000)
//     const data = await getVideos([...Array(139).keys()].map(i => (start + i).toString()))
//     console.log(start, data.length, data[0])
//   }
// })();
