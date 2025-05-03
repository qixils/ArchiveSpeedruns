import { loadFrom, saveTo } from "./utils";
import * as twitch from "./twitch"
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

let channels = new Set<string>()

const loadState = async () => {
  try {
    const lastChannels = (await loadFrom("channels.txt")).toString().trim().split(/\s+/)
    lastChannels.forEach(channel => channels.add(channel))
  } catch (e) {
    console.error("Failed to load channels", e)
  }
}

const saveState = async () => {
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

  const root = join("..", "data")
  const manualChannels = [...new Set((await readFile(join(root, "manual-channels.txt"))).toString().trim().split('\n').map(str => str.trim()))]
  const manualChannelIds = new Set<string>()

  let index = 0
  while (index < manualChannels.length) {
    const slice = manualChannels.slice(index, index+100)
    const users = await twitch.getUsers({ login: slice })
    for (const user of users.data) {
      channels.add(user.id)
      manualChannelIds.add(user.id)
    }
    await saveState()
    console.log(channels.size, `found (${(100 * index / manualChannels.length).toFixed(2)}%)`)
    index += 100
  }

  const manualChannelIdsOut = [...manualChannelIds].map(str => str.toString()).join('\n')
  await writeFile(join(root, "manual-channel-ids.txt"), manualChannelIdsOut)

  console.log("done")

})();