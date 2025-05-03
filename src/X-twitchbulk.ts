import { loadFrom, saveTo } from "./utils";
import * as twitch from "./twitch"
import * as gql from "./gql"
import readline from 'readline';
import { getLastVideoId, insertVideosBulk, db, type Video as DbVideo } from "./database";

let lastVideo = 0
let lastLogged = 0

const videosPerPage = 139 // roughly 140 is the max before it rarely errors
const concurrency = 25

// const parseDuration = (duration: string): number => {
//   const match = duration.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
//   if (!match) throw new Error(`Unknown duration ${duration}`);
  
//   const h = parseInt(match[1] || '0')
//   const m = parseInt(match[2] || '0')
//   const s = parseInt(match[3] || '0')
//   return (((h * 60) + m) * 60) + s
// }

// const fetchPage = async (id: string[]) => {
//   const videos = await twitch.getVideos({ id })
//   if (!videos?.data?.length) return;
  
//   const validVideos = videos.data
//     .map(video => ({
//       id: parseInt(video.id, 10),
//       channel_id: parseInt(video.user_id, 10),
//       title: video.title,
//       duration_seconds: parseDuration(video.duration),
//       view_count: video.view_count,
//       language: video.language,
//       type: video.type,
//       created_at: video.created_at
//     }));

//   if (validVideos.length > 0) {
//     insertVideosBulk(validVideos);
//   }
// }

const fetchPage = async (ids: string[]) => {
  const videos = await gql.getVideos(ids)
  if (!videos?.length) return;
  
  const validVideos = videos
    .map(video => ({
      id: parseInt(video.id, 10),
      channel_id: parseInt(video.owner.id, 10),
      title: video.title || '',
      // description: video.description || '',
      duration_seconds: video.lengthSeconds || 0,
      view_count: video.viewCount || 0,
      language: video.language || 'en',
      type: video.broadcastType.includes('PREMIERE') ? 'upload' : video.broadcastType.toLowerCase() as DbVideo['type'],
      created_at: video.createdAt
    } as const satisfies DbVideo))

  if (validVideos.length > 0) {
    insertVideosBulk(validVideos)
  }
}

const fetchFrom = async (from: number) => {
  const idsNumeric = [...Array(videosPerPage).keys()].map(i => from + i)
  const idsString = idsNumeric.map(i => i.toString())

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await fetchPage(idsString)
      break
    } catch (e) {
      const isTimeout = String(e).includes('service timeout')
      const ms = (attempt + 1) * (isTimeout ? 100 : 500)
      console.error(`Failed to fetch page; sleeping for ${ms}ms`, idsString[0], isTimeout ? 'service timeout' : e)
      await sleep(ms)
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let exitRequested = false;

const handleExit = (signal: string) => {
  if (exitRequested) return; // prevent double handling
  exitRequested = true;
  rl.close();
  console.log(`\nReceived ${signal}, will exit at nearest convenience`);
};

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));

rl.on('line', (input) => {
  if (input.trim().toLowerCase() === 'exit') {
    handleExit('exit command');
  }
});

const save = async () => {
  const diff = lastVideo - lastLogged
  lastLogged = lastVideo
  let lastRow = undefined;
  try {
    lastRow = getLastVideoId.get()
  } catch {
    console.warn("Failed to query DB for last row")
  }
  console.log("Fetched up to TXT:", lastVideo, "/ DB:", lastRow?.id, "/ DIFF:", diff)
  await saveTo(lastVideo.toString(), "twitch-scrape-from.txt")
}

;(async function() {
  // Load last video ID
  try {
    const data = await loadFrom("twitch-scrape-from.txt")
    lastVideo = parseInt(data.toString().trim())
  } catch {
    lastVideo = 0
    console.error("Failed to load scrape-from file; waiting for 5s")
    await sleep(5000)
  }

  // Load the range of IDs this instance is configured to scrape
  const data = await loadFrom("twitch-scrape-ranges.txt")
  const ranges = data.toString().split(",").map(range => range.split("-").map(i => parseInt(i.trim())))
  console.log("Ranges:", ranges)
  
  const saver = setInterval(save, 5000)

  try {
    const promises = new Set<Promise<any>>();

    // Find current or next range
    const findRange = () => {
      for (const [start, end] of ranges) {
        if (lastVideo >= start && lastVideo <= end) return [start, end];
        if (lastVideo < start) {
          lastVideo = start;
          return [start, end];
        }
      }
      return null;
    }

    let currentRange = findRange();
    console.log("Current range:", currentRange, lastVideo);
    while (currentRange && !exitRequested) {
      const [, end] = currentRange;
      const task = fetchFrom(lastVideo + 1);
      const promise = task.then(() => {promises.delete(promise)});
      promises.add(promise);

      if (promises.size >= concurrency) {
        await Promise.race(promises);
      }

      lastVideo += videosPerPage;
      
      // Check if we need to move to next range
      if (lastVideo >= end) {
        currentRange = findRange();
        console.log("Moving to next range:", currentRange, lastVideo);
      }
    }

    await Promise.allSettled(promises)
  } catch (e) {
    console.error('Unknown error', e);
  }

  clearInterval(saver)
  await save()
  db.close()
})();