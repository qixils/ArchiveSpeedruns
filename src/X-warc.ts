import { loadFrom, saveTo } from "./utils";
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { AutoWARCParser, WARCRecord } from 'node-warc';

const twitchUrl = /twitch\.tv\/(?:videos\/|\w+\/[bcv]\/|.+video=v?)(\d+)/ig
// const anyUrl = /https?:\/\/(?:www\.)?(\S+)/g

const videoIds = new Set<string>()
let videoIdsSize = 0
// const allUrls = new Set<string>()
// let allUrlsSize = 0

const searchForVideos = (str?: string) => {
  if (typeof str !== 'string') return

  for (const result of str.matchAll(twitchUrl)) {
    const videoId = result[1]
    if (videoIds.has(videoId)) continue;

    // console.log("Discovered Video ID", videoId)
    if (videoIds.size % 50 === 0) console.log("Discovered", videoIds.size, "videos");
    videoIds.add(videoId)
  }

  // for (const result of str.matchAll(anyUrl)) {
  //   let videoUrl = result[1]
  //   // don't save twitch urls twice
  //   if (videoUrl.match(twitchUrl)) continue;
  //   // don't save existing urls
  //   if (allUrls.has(videoUrl)) continue;

  //   if (allUrls.size % 50 === 0) console.log("Discovered", allUrls.size, "URLs");
  //   allUrls.add(videoUrl)
  // }
}

const loadState = async () => {
  try {
    const existingIdsFile = await loadFrom("videos.txt")
    const existingIds = existingIdsFile.toString().trim().split(/[,\s]+/)
    console.log(`Adding ${existingIds.length} videos (ex. ${existingIds[0]})`)
    existingIds.forEach(videoId => videoIds.add(videoId))
    videoIdsSize = videoIds.size
  } catch (e) {
    console.error('No prior videos', e)
  }

  // try {
  //   const existingUrlsFile = await loadFrom("urls.txt")
  //   const existingUrls = existingUrlsFile.toString().trim().split(/\s+/)
  //   console.log(`Adding ${existingUrls.length} URLs (ex. ${existingUrls[0]})`)
  //   existingUrls.forEach(videoUrl => allUrls.add(videoUrl))
  //   allUrlsSize = allUrls.size
  // } catch (e) {
  //   console.error('No prior URLs', e)
  // }

  console.log("Loaded states")
}

const saveState = async () => {
  if (videoIds.size !== videoIdsSize) {
    try {
      await saveTo([...videoIds].join("\n"), "videos.txt")
      videoIdsSize = videoIds.size
    } catch (e) {
      console.error("Faield to save videos", e)
    }
  }
  // if (allUrls.size !== allUrlsSize) {
  //   try {
  //     await saveTo([...allUrls].join("\n"), "urls.txt")
  //     allUrlsSize = allUrls.size
  //   } catch (e) {
  //     console.error("Faield to save URLs", e)
  //   }
  // }
  console.log("Saved states")
}

const processWarcRecord = (record: WARCRecord) => {
  if (record.warcType === 'response') {
    try {
      searchForVideos(record.warcTargetURI);
      const content = record.content.toString();
      searchForVideos(content);
    } catch (e) {
      console.error('Failed to process WARC record', e);
    }
  }
}

;(async function() {
  // Load states
  await loadState()

  // Parse WARCs
  try {
    const root = join('..', 'data')
    const warcFiles = (await readdir(root))
      .filter(file => file.match(/-\d{5}\.warc\.gz$/));
    
    console.log(`Found ${warcFiles.length} WARC files`);
    
    for (const file of warcFiles) {
      console.log(`Processing ${file}...`);
      const filePath = join(root, file);
      
      try {
        for await (const record of new AutoWARCParser(filePath)) {
          processWarcRecord(record);
        }
      } catch (e) {
        console.error(`Failed to process ${file}`, e);
      }
      
      // Save progress after each file
      await saveState();
    }
  } catch (e) {
    console.error('Failed to read WARC files', e);
  }

  // Save states
  await saveState();
})();