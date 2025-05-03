import { loadFrom, saveTo } from "./utils"

const videoIds = new Set<string>()

const loadFile = async (filename: string) => {
  try {
    const existingIdsFile = await loadFrom(filename)
    const existingIds = existingIdsFile.toString().trim().split(/[,\s]+/)
    console.log(`Adding ${existingIds.length} videos (ex. ${existingIds[0]})`)
    existingIds.forEach(videoId => videoIds.add(videoId))
  } catch (e) {
    console.error('No prior videos', e)
  }

  console.log("Loaded states")
}

const saveFile = async () => {
  try {
    await saveTo([...videoIds].join("\n"), "videos.txt")
  } catch (e) {
    console.error("Faield to save videos", e)
  }
  console.log("Saved states")
}

;(async function() {
  await loadFile("videos-A.txt")
  await loadFile("videos-B.txt")
  await saveFile()
})();
