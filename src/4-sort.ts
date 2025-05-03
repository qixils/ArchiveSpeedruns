import { readFile } from "fs/promises";
import { loadFrom, saveTo } from "./utils";
import { join } from "path";

interface Video {
  id: string
  views: number
  duration: number
  channel: string
  peril: boolean
}

const genCSV = (v: Record<string, any>[]) => {
  const keys = Object.keys(v[0])
  let output = keys.join(',') + '\n'
  for (const obj of v) {
    output += keys.map(key => String(obj[key])).join(',') + '\n'
  }
  return output.trim()
}

const readCsvLine = (header: string[], line: string[]) => {
  return Object.fromEntries(line.map((item, index) => [header[index], parseInt(item)])) as unknown as { id: number, channel_id: number, view_count: number, duration_seconds: number }
}

const readCsv = async () => {
  const videoData = (await loadFrom("full-endangered-videos-query-sorted.csv")).toString().trim().split('\n')
  const header = videoData[0].split(',')
  return videoData.slice(1).map(line => readCsvLine(header, line.split(',')))
}

;(async function() {
  console.log((await loadFrom("channels.txt")).toString().trim().split(/\s+/).length, "channels")

  const videoIds = new Set((await loadFrom("videos.txt")).toString().trim().split("\n"))
  const manualChannelIds = new Set((await readFile(join("..", "data", "manual-channel-ids.txt"))).toString().trim().split("\n"))

  let videos = false
    ? (await loadFrom("peril-videos.jsonl")).toString().trim().split("\n").map(line => JSON.parse(line) as Video)
      .filter(video => video.peril /*&& (videoIds.has(video.id) || manualChannelIds.has(video.channel)) && video.views >= 300*/)
      .map(({peril, ...video}) => ({
        ...video,
        id: parseInt(video.id),
        channel: parseInt(video.channel),
        // speedrun: videoIds.has(video.id) ? 'y' as const : 'n' as const,
        // peril: video.peril ? 'y' as const : 'n' as const,
      }))
    : (await readCsv()).map(v => ({
        id: v.id,
        channel: v.channel_id,
        views: v.view_count,
        duration: v.duration_seconds,
      }))

  videos = videos.filter(v => v.views >= 4000)

  console.log("Videos", videos.length)

  videos.sort((a, b) => {
    // if (b.peril !== a.peril) {
    //   return a.peril === 'y' ? -1 : 1
    // }
    // if (b.speedrun !== a.speedrun) {
    //   return a.speedrun === 'y' ? -1 : 1
    // }
    if (b.views !== a.views) return b.views - a.views;
    if (b.channel !== a.channel) return a.channel - b.channel;
    if (b.duration !== a.duration) return b.duration - a.duration;
    if (b.id !== a.id) return a.id - b.id;
    return 0;
  })
  const csv = genCSV(videos)
  const split = csv.split('\n')
  console.log(JSON.stringify(split.slice(0, 10), undefined, 2))
  console.log(JSON.stringify(split.slice(split.length-10, split.length), undefined, 2))
  await saveTo(csv, "all-viewed-highlights-and-uploads.csv")

  /// misc

  const getIndexInfo = (index: number) => {
    return ["not met at index", index, `(${(100 * index / videos.length).toFixed(2)}%)`]
  }

  console.log("Videos", videos.length)

  // console.log("Perilous videos", ...getIndexInfo(videos.findIndex(video => video.peril === 'n')))

  // console.log("Perilous speedrun videos", ...getIndexInfo(videos.findIndex(video => video.speedrun === 'n')))

  // videos.sort((a, b) => b.speedrun === a.speedrun ? 0 : a.speedrun === 'y' ? -1 : 1)

  // console.log("Speedruns", ...getIndexInfo(videos.findIndex(video => video.speedrun === 'n')))
  console.log("For reference,", videoIds.size, "videos were discovered in searching")

  // videos.sort((a, b) => b.views - a.views)

  const printViewsAtLeast = (views: number) => {
    const index = videos.findIndex(video => video.views <= views)
    console.log("View target", views, ...getIndexInfo(index))
  }

  printViewsAtLeast(1000000)
  printViewsAtLeast(100000)
  printViewsAtLeast(10000)
  printViewsAtLeast(1000)
  printViewsAtLeast(100)
  printViewsAtLeast(50)
  printViewsAtLeast(10)
  printViewsAtLeast(9)
  printViewsAtLeast(8)
  printViewsAtLeast(7)
  printViewsAtLeast(6)
  printViewsAtLeast(5)
  printViewsAtLeast(4)
  printViewsAtLeast(3)
  printViewsAtLeast(2)
  printViewsAtLeast(1)
  printViewsAtLeast(0)

  const noViewsPeril = videos.reduce((acc, video) => acc + (/*video.peril === 'y' &&*/ video.views === 0 ? 1 : 0), 0)
  console.log("No views in peril", noViewsPeril, `(${(100 * noViewsPeril / videos.length).toFixed(2)}%)`)

  // sum views
  const sumViews = videos.reduce((acc, video) => acc + video.views, 0)
  console.log("Sum views", sumViews)

  // sum duration
  const sumDuration = videos.reduce((acc, video) => acc + video.duration, 0)
  console.log("Sum duration", sumDuration)

  // count unique channels
  const uniqueChannels = new Set(videos.map(video => video.channel))
  console.log("Unique channels", uniqueChannels.size)
})();