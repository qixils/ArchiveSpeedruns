import { jsonifyFrom, jsonifyTo, loadFrom, saveTo } from "./utils";
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { AutoWARCParser, WARCRecord } from 'node-warc';
import { Merge } from "type-fest";

// duration, views
type VideoOut = [number, number]
let videosByChannel: Record<string, Map<string, VideoOut>> = {}

const parsedFiles: Set<string> = new Set()

const loadState = async () => {
  try {
    const parsed = await jsonifyFrom("megawarc-videos")
    videosByChannel = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, new Map(Object.entries(v as object))])
    )
  } catch (e) {
    console.error('No prior json', e)
  }

  try {
    const files: string[] = await jsonifyFrom("megawarc-files")
    files.forEach(file => parsedFiles.add(file))
  } catch (e) {
    console.error('No prior files', e)
  }

  console.log("Loaded states")
}

const saveState = async () => {
  try {
    const serialized = Object.fromEntries(
      Object.entries(videosByChannel).map(([k, v]) => [k, Object.fromEntries(v)])
    )
    await jsonifyTo(serialized, "megawarc-videos")
  } catch (e) {
    console.error('Could not save json', e)
  }

  try {
    await jsonifyTo([...parsedFiles], "megawarc-files")
  } catch (e) {
    console.error('Could not save files', e)
  }

  console.log(`Saved states (${Object.keys(videosByChannel).length} channels)`)
}

const processWarcRecord = (record: WARCRecord) => {
  try {
    if (record.warcType !== 'response') return;
    if (record.warcTargetURI !== 'https://gql.twitch.tv/gql') return;
    if (!record.httpInfo) return;
    if (record.warcContentType !== 'application/http;msgtype=response') return;
    if (!Object.entries(record.httpInfo.headers).find(([key, value]) => key.toLowerCase() === 'content-type' && value.toLowerCase() === 'application/json')) return;

    const [, item] = (Object.entries(record.warcHeader).find(([key, value]) => key === "X-Wget-AT-Project-Item-Name") || []) as string[]
    if (!item) return
    if (!item.match(/^novideo:/)) return

    const isChunk = !!Object.entries(record.httpInfo.headers).find(([key, value]) => key.toLowerCase() === 'transfer-encoding' && value === 'chunked')

    let data = record.content.toString()
    if (isChunk) {
      // Remove chunk sizes and combine chunks
      data = data
        .replace(/(?:\r\n|^)[0-9a-f]+\r\n/ig, '') // Remove chunk size headers
        .replace(/\r\n0\r\n\r\n$/, '') // Remove final chunk marker
    }

    try {
      const json = JSON.parse(data.trim())
      parseFullRecord(json)
    } catch (e) {
      console.log('Failed to parse record', isChunk, data, e)
    }
  } catch (e) {
    console.error('Failed to process WARC record', e);
  }
}

type Named<N extends string, D extends object> = Merge<D, { "__typename": N }>

type Edge<N extends string, D extends object> = Named<N, {
  cursor: ""
  node: D
}>[]

type GraphData<N extends string, D extends object> = [{
  data: D
  extensions: {
    operationName: N
    durationMilliseconds: number
    requestID: string
  }
}]

type VideoMomentsData = GraphData<"VideoPreviewCard__VideoMoments", {
  video: Named<"Video", {
    id: string
    moments: Named<"VideoMomentConnection", {
      edges: Edge<"VideoMomentEdge", Named<"VideoMoment", {
        id: string
        durationMilliseconds: number
        positionMilliseconds: number
        type: string
        description: string
        thumbnailURL: string
        details: Named<"GameChangeMomentDetails", {
          game: Named<"Game", {
            id: string
            slug: string
            displayName: string
            boxArtURL: string
          }>
        }>
        video: Named<"Video", {
          id: string
          lengthSeconds: number
        }>
      }>>
    }>
  }> | null
}>

type VideoCommentsData = GraphData<"VideoCommentsByOffsetOrCursor", {
  video: Named<"Video", {
    id: string
    creator: Named<"User", {
      id: string
      channe: Named<"Channel", {
        id: string
      }>
    }>
    comments: Named<"VideoCommentConnection", {
      edges: Edge<"VideoCommentEdge", Named<"VideoComment", {
        id: string
        commenter: Named<"User", {
          id: string,
          login: string,
          displayName: string,
        }>
        contentOffsetSeconds: number
        createdAt: string
        message: Named<"VideoCommentMessage", {
          fragments: Named<"VideoCommentMessageFragment", {
            emote: Named<"EmbeddedEmote", {
              id: string // `${emoteID};${from};${to}` i think?
              emoteID: string
              from: number
            }> | null
            text: string // when emote is non-null, this is the name of the emote
          }>[]
          userBadges: Named<"Badge", {
            id: string // base64?
            setID: string // "partner"
            version: string // "1"
          }>[]
          userColor: string | null // #5B99FF
        }>
      }>>
      pageInfo: Named<"PageInfo", {
        hasNextPage: boolean
        hasPreviousPage: boolean
      }>
    }>
  }>
}>

type VideoMetadataData = GraphData<"VideoMetadata", {
  user: Named<"User", {
    id: string
    primaryColorHex: string // 3F0606
    isPartner: boolean
    profileImageURL: string
    lastBroadcast: Named<"Broadcast", {
      id: string
      startedAt: string
    }>
    stream: null // todo
    followers: Named<"FollowerConnection", {
      totalCount: number
    }>
  }> | null
  currentUser: null
  video: Named<"Video", {
    id: string
    title: string
    description: string | null
    previewThumbnailURL: string
    createdAt: string
    viewCount: number
    publishedAt: string
    lengthSeconds: number
    broadcastType: 'HIGHLIGHT' // todo
    owner: Named<"User", {
      id: string
      login: string
      displayName: string
    }>
    game: Named<"Game", {
      id: string
      slug: string
      boxArtURL: string
      name: string
      displayName: string
    }>
  }> | null
}>

// TODO: more
type VideoData = VideoMomentsData | VideoCommentsData | VideoMetadataData

const parseFullRecord = (json: VideoData) => {
  try {
    if (json[0].extensions.operationName !== 'VideoMetadata') return
    // TODO: improve typing
    const { user, video } = (json as VideoMetadataData)[0].data
    if (!user) return
    if (!video) return

    const videoData: VideoOut = [video.lengthSeconds, video.viewCount]

    if (!(video.owner.id in videosByChannel)) videosByChannel[video.owner.id] = new Map()
    videosByChannel[video.owner.id].set(video.id, videoData)
  } catch (e) {
    console.error("Failed to parse full record", e)
  }
}

;(async function() {
  // Load states
  await loadState()

  // const saver = setInterval(saveState, 5000)

  // Parse WARCs
  try {
    const root = join('..', 'data')
    const allFiles = await readdir(root)
    const warcFiles = allFiles.filter(file => file.match(/^twitch_.+\.megawarc\.warc$/));
    
    console.log(`Found ${warcFiles.length} WARC files`);
    
    for (const file of warcFiles) {
      if (parsedFiles.has(file)) continue;
      console.log(`Processing ${file}...`);
      const filePath = join(root, file);
      
      try {
        for await (const record of new AutoWARCParser(filePath)) {
          processWarcRecord(record);
        }
      } catch (e) {
        console.error(`Failed to process ${file}`, e);
      }

      parsedFiles.add(file);
      await saveState()
    }
  } catch (e) {
    console.error('Failed to read WARC files', e);
  }
})();