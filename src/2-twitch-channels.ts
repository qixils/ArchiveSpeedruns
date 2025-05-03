import { loadFrom, saveTo } from "./utils";
import * as twitch from "./twitch"

let lastVideo: string | undefined = undefined
let channels = new Set<string>()

const loadState = async () => {
  try {
    lastVideo = (await loadFrom("last-video.txt")).toString().trim()
  } catch (e) {
    console.error("Failed to load video", e)
  }

  try {
    const lastChannels = (await loadFrom("channels.txt")).toString().trim().split(/\s+/)
    lastChannels.forEach(channel => channels.add(channel))
  } catch (e) {
    console.error("Failed to load channels", e)
  }
}

const saveState = async () => {
  try {
    if (!lastVideo) {
      console.error("No video progress to save")
    } else {
      await saveTo(lastVideo, "last-video.txt")
    }
  } catch (e) {
    console.error("Failed to save video", e)
  }

  try {
    if (!channels.size) {
      console.error("No channels to save")
    } else {
      await saveTo([...channels].join("\n"), "channels.txt")
    }
  } catch (e) {
    console.error("Failed to save channels", e)
  }
}

;(async function() {
  await loadState()

  const videoFile = await loadFrom("videos.txt")
  const videoIds = videoFile.toString().trim().split(/\s+/)

  let index = lastVideo ? (videoIds.findIndex(video => video === lastVideo) + 1) : 0
  while (index < videoIds.length) {
    const slice = videoIds.slice(index, index+100)
    const videos = await twitch.getVideos({ id: slice })
    for (const video of videos.data) {
      channels.add(video.user_id)
    }
    lastVideo = slice[slice.length-1]
    await saveState()
    console.log(channels.size, `found (${(100 * index / videoIds.length).toFixed(2)}%)`)
    index += 100
  }

  console.log("done")

})();