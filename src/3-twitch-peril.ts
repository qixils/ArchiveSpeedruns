import { loadFrom, saveTo } from "./utils";
import * as twitch from "./twitch"

interface Video {
  id: string
  views: number
  duration: number
  channel: string
  peril: boolean
}

let lastChannel: string | undefined = undefined
let videos: Video[] = []
let videosSaved: number = 0

const loadState = async () => {
  try {
    lastChannel = (await loadFrom("last-channel.txt")).toString().trim()
  } catch (e) {
    console.error("Failed to load channel", e)
  }

  try {
    const lastVideos: Video[] = (await loadFrom("peril-videos.jsonl")).toString().trim().split("\n").map(line => JSON.parse(line))
    lastVideos.forEach(channel => videos.push(channel))
    videosSaved = videos.length
  } catch (e) {
    console.error("Failed to load videos", e)
  }
}

const saveState = async () => {
  try {
    if (!videos.length || videosSaved === videos.length) {
      console.error("No videos to save")
    } else {
      videosSaved = videos.length
      await saveTo(videos.map(video => JSON.stringify(video)).join("\n"), "peril-videos.jsonl")
    }
  } catch (e) {
    console.error("Failed to save videos", e)
  }

  try {
    if (!lastChannel) {
      console.error("No channel progress to save")
    } else {
      await saveTo(lastChannel, "last-channel.txt")
    }
  } catch (e) {
    console.error("Failed to save channel", e)
  }
}

const parseDuration = (duration: string): number => {
  const match = duration.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+s))?$/)
  if (!match) throw new Error(`Unknown duration ${duration}`);
  
  const h = parseInt(match[1] || '0')
  const m = parseInt(match[2] || '0')
  const s = parseInt(match[3] || '0')
  return (((h * 60) + m) * 60) + s
}

const deletionThreshold = 100 * 60 * 60

;(async function() {
  await loadState()
  const interval = setInterval(saveState, 10_000)

  const channelsFile = await loadFrom("channels.txt")
  const channelIds = channelsFile.toString().trim().split(/\s+/)

  const total = [...Array(1).keys()]
  let startIndex = Math.max((lastChannel ? (channelIds.findIndex(channel => channel === lastChannel) + 1) : 0) - total.length, 0)

  const run = async (offset: number, total: number) => {
    for (let i = startIndex + offset; i < channelIds.length; i += total) {
      const user_id = channelIds[i];
      try {
        const promised = await Promise.all([
          twitch.getAll(twitch.getVideos({ user_id, type: 'highlight', first: 100 })),
          twitch.getAll(twitch.getVideos({ user_id, type: 'upload', first: 100 })),
        ])
        const content = promised.flatMap(promise => promise).sort((a, b) => b.view_count - a.view_count)
    
        if (!content.length) {
          console.error("No videos to save for channel", user_id)
          continue
        }
        
        let savedDuration = 0
        let nextToSave = 0
        while (nextToSave < content.length) { // 100 hours
          const video = content[nextToSave]
          const duration = parseDuration(video.duration)
          if ((savedDuration + duration) < deletionThreshold) {
            savedDuration += duration
            nextToSave += 1
          } else {
            break
          }
        }

        // we need to check if multiple videos have the same perilous view count
        const cutoff = content[nextToSave]?.view_count
        if (cutoff !== undefined) {
          while (nextToSave > 0 && content[nextToSave - 1].view_count === cutoff) {
            nextToSave -= 1
          }
        }

        // nextToSave is now the index of the first video to not be saved
        content.forEach((video, index) => videos.push({ id: video.id, duration: parseDuration(video.duration), views: video.view_count, channel: user_id, peril: index >= nextToSave }))
    
        lastChannel = user_id
        console.log("For", user_id, "Twitch will save", nextToSave, `VODs (${(savedDuration/60/60).toFixed(2)}h) out of`, content.length, "leaving", content.length-nextToSave, "for us to save")
        console.log(content[0].view_count, content[nextToSave - 1]?.view_count, content[nextToSave]?.view_count, content.at(-1)?.view_count)
        console.log(i, `scanned of`, channelIds.length, `(${(100 * i / channelIds.length).toFixed(2)}%),`, videos.length, "to save")
      } catch (e) {
        console.error(user_id, 'failed', e)
      }
    }
  }

  await twitch.getCredentials()
  await Promise.allSettled(total.map(offset => run(offset, total.length)))
  

  console.log("done")
  clearInterval(interval)
  await saveState()
})();