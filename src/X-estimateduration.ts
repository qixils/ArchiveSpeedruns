import { getAllV1, getAllV2, getGames, getRunsV2 } from "./src";
import { jsonifyFrom, jsonifyTo, src1Limit } from "./utils";

type CategoryID = string
const twitchUrl = /twitch\.tv\/(?:videos|\w+\/v)\/(\d+)/ig

;(async function() {
  const games: {[game: string]: CategoryID[]} = await jsonifyFrom('games')

  const minQueries = Object.entries(games).reduce(
    // news + guide + resource + forum thread
    (accumulator, nextValue) => accumulator + 5,
    0,
  )

  const millis = minQueries * src1Limit
  const hours = millis / (1000*60*60)

  console.log("Archiving will take at least", hours.toFixed(3), "hours")

  // const keys = [...Object.keys(games)]
  // const startAt = keys[Math.floor(.95585 * keys.length)]
  // const state = { stage: 'runs', id: startAt }
  // try { await jsonifyTo(state, "discovery-state-middle") } catch (e) { console.log("Failed to save state", e) }
  // console.log(JSON.stringify(state), keys.length, startAt, Math.floor(.95585 * keys.length))
})();