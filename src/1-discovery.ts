import { getAllV1, getAllV2, getArticleList, getChallengeRuns, getForumList, getGames, getGameSummary, getGuideList, getNewsList, getResourceList, getRunsV1, getRunsV2, getSearch, getSeriesList, getSeriesSummary, getThread, getThreadList, getVariables } from "./src";
import { jsonifyFrom, jsonifyTo, loadFrom, saveTo } from "./utils";
import type { Run as RunV1 } from "./src-types";
import { Forum, Obsoletion, Verification, VideoFilter } from "./src-types-2";

type CategoryID = string
interface State {
  stage: 'none' | 'runs' | 'series' | 'done'
  id?: string
}

const twitchUrl = /twitch\.tv\/(?:videos|\w+\/[bcv])\/(\d+)/ig
const anyUrl = /https?:\/\/(\S+)/g

const videoIds = new Set<string>()
let videoIdsSize = 0
const allUrls = new Set<string>()
let allUrlsSize = 0
let state: State = { stage: 'runs' }

const searchForVideos = (str?: string) => {
  if (typeof str !== 'string') return

  for (const result of str.matchAll(twitchUrl)) {
    const videoId = result[1]
    if (videoIds.has(videoId)) continue;

    // console.log("Discovered Video ID", videoId)
    if (videoIds.size % 50 === 0) console.log("Discovered", videoIds.size, "videos");
    videoIds.add(videoId)
  }

  for (const result of str.matchAll(anyUrl)) {
    let videoUrl = result[1]
    if (videoUrl.startsWith("www.")) videoUrl = videoUrl.substring("www.".length);
    // don't save twitch urls twice
    if (videoUrl.match(twitchUrl)) continue;
    // don't save existing urls
    if (allUrls.has(videoUrl)) continue;

    if (allUrls.size % 50 === 0) console.log("Discovered", allUrls.size, "URLs");
    allUrls.add(videoUrl)
  }
}

const searchForum = async (forum: Forum) => {
  searchForVideos(forum.description)
  const forumId = forum.id
  const threadList = (await getAllV2(getThreadList({ forumId })))?.threadList || []
  console.log(`Archiving ${threadList.length} threads`)
  for (const thread of threadList) {
    const { id } = thread
    const commentList = (await getAllV2(getThread({ id })))?.commentList || []
    console.log(`Archiving ${commentList.length} comments`)
    for (const comment of commentList) {
      searchForVideos(comment.text)
    }
  }
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

  try {
    const existingUrlsFile = await loadFrom("urls.txt")
    const existingUrls = existingUrlsFile.toString().trim().split(/\s+/)
    console.log(`Adding ${existingUrls.length} URLs (ex. ${existingUrls[0]})`)
    existingUrls.forEach(videoUrl => allUrls.add(videoUrl))
    allUrlsSize = allUrls.size
  } catch (e) {
    console.error('No prior URLs', e)
  }

  try {
    state = await jsonifyFrom("discovery-state") as State
    console.log(JSON.stringify(state))
  } catch (e) {
    console.error("No prior state", e)
  }

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
  if (allUrls.size !== allUrlsSize) {
    try {
      await saveTo([...allUrls].join("\n"), "urls.txt")
      allUrlsSize = allUrls.size
    } catch (e) {
      console.error("Faield to save URLs", e)
    }
  }
  try { await jsonifyTo(state, "discovery-state") } catch (e) { console.log("Faield to save state", e) }
  console.log("Saved states")
}

;(async function() {
  // Load states
  const games: {[game: string]: CategoryID[]} = await jsonifyFrom('games')
  await loadState()

  // Begin

  if (state.stage === 'none') {
    console.log("Doing site-wide archive for first run")

    const articleList = (await getAllV2(getArticleList()))?.articleList || []
    console.log(`Archiving ${articleList.length} articles`)
    for (const article of articleList) {
      searchForVideos(article.body)
      searchForVideos(article.summary)
    }

    // YES i am using includeNews here. this search is fucked. dont worry about it
    const search = await getSearch({
      query: 'a',
      includeChallenges: true,
      includeNews: true,
      includePages: true, // broken, it hooks to news instead, but doesnt hurt
    })
    const pageList = search?.pageList || []
    console.log(`Archiving ${pageList.length} pages`)
    for (const page of pageList) {
      searchForVideos(page.body)
      searchForVideos(page.summary)
    }

    const newsList = search?.newsList || []
    console.log(`Archiving ${newsList.length} news`)
    for (const news of newsList) {
      searchForVideos(news.body)
    }

    const challengeList = search?.challengeList || []
    console.log(`Archiving ${challengeList.length} challenges`)
    for (const challenge of challengeList) {
      const challengeId = challenge.id
      const leaderboard = (await getAllV2(getChallengeRuns({ challengeId, verified: Verification.Verified })))?.challengeRunList || []
      console.log(`Archiving ${leaderboard.length} runs`)
      for (const run of leaderboard) {
        searchForVideos(run.video)
        searchForVideos(run.comment)
      }
    }

    const forumList = (await getAllV2(getForumList()))?.forumList || []
    console.log(`Archiving ${forumList.length} forums`)
    for (const forum of forumList) {
      await searchForum(forum)
    }

    state = { stage: 'runs' }
    await saveState()
  }

  if (state.stage === 'runs') {
    let begun = !state?.id // start if there is no id, otherwise we have to find it
    const total = Object.entries(games).length
    let tally = 0
    for (const [gameId, categoryIds] of Object.entries(games)) {
      ++tally;
      if (!begun && gameId !== state.id) continue;
      begun = true
      if (gameId === state.id) continue;

      if (!['y65797de'].includes(gameId)) continue;

      console.log(`Archiving ${gameId}, game ${tally} of ${total} (${((tally/total)*100).toFixed(2)}%)`)
      /*
      const gameSummary = await getGameSummary({ gameId })

      if (gameSummary?.threadCount) {
        await searchForum(gameSummary.forum)
      }

      console.log(`Archiving ${gameSummary?.newsList?.length} news`)
      if (gameSummary?.newsList?.length) {
        for (const news of gameSummary.newsList) {
          searchForVideos(news.body)
        }
      }
  
      console.log(`Archiving ${gameSummary?.resourceCount} resources`)
      if (gameSummary?.resourceCount) {
        const resourceList = (await getAllV2(getResourceList({ gameId })))?.resourceList || []
        if (gameSummary.resourceCount !== resourceList.length) {
          console.error(`Mismatching resource count ${gameSummary.resourceCount} / ${resourceList.length} for game ${gameId}`)
        }
        for (const resource of resourceList) {
          searchForVideos(resource.link)
          searchForVideos(resource.description)
          searchForVideos(resource.path) // idk what this is
        }
      }
  
      console.log(`Archiving ${gameSummary?.guideCount} guide`)
      if (gameSummary?.guideCount) {
        const guideList = (await getAllV2(getGuideList({ gameId })))?.guideList || []
        if (gameSummary.guideCount !== guideList.length) {
          console.error(`Mismatching guide count ${gameSummary.guideCount} / ${guideList.length} for game ${gameId}`)
        }
        for (const guide of guideList) {
          searchForVideos(guide.text)
        }
      }
  

      let runs = await getAllV1(getRunsV1({ game: gameId, orderby: 'submitted', direction: 'asc', status: 'verified', max: 200 }))
      if (runs.length >= 10000) {
        console.error('Notice: pulling >10K runs, please verify')
        const runMap = new Map<string, typeof runs[number]>()
        runs.forEach(run => runMap.set(run.id, run))
        const moreRuns = await getAllV1(
          getRunsV1({ game: gameId, orderby: 'submitted', direction: 'desc', status: 'verified', max: 200 }),
          (runs) => {
            // stop if the run ids has one of the new runs
            return !!runs.find(run => runMap.has(run.id))
          },
        )
        moreRuns.forEach(run => runMap.set(run.id, run))
        runs = [...runMap.values()]
      }
      */
      if (false) { /*runs.length < 19800) {
        for (const run of runs) {
          searchForVideos(run.comment)
          searchForVideos(run.videos?.text)
          run.videos?.links?.forEach(({ uri }) => searchForVideos(uri))
        }
        */
      } else {
        console.error('Notice: pulling >20K runs, please verify')
        // need to re-scrape using V2 API; this trade-off is ultimately worth it
        const result = await Promise.allSettled(categoryIds.map(async (categoryId) => {
          const variableData = await getVariables(categoryId)
          const values = Object.fromEntries(variableData.data.filter(variable => variable.mandatory).map(variable => [variable.id, Object.keys(variable.values.values)]))
          const permutations = Object.keys(values).reduce<Record<string, string>[]>((acc, key) => {
            const newAcc: Record<string, string>[] = [];
            for (const val of values[key]) {
              if (acc.length === 0) {
                newAcc.push({ [key]: val });
              } else {
                for (const obj of acc) {
                  newAcc.push({ ...obj, [key]: val });
                }
              }
            }
            return newAcc;
          }, [])

          const valuesResult = await Promise.allSettled(permutations.map(async (permutation) => {
            const valueParam = Object.entries(permutation).map(([variableId, choice]) => ({ variableId, valueIds: [choice] }))
            const leaderboard = (await getAllV2(getRunsV2({
              gameId,
              categoryId,
              verified: Verification.Verified,
              obsolete: Obsoletion.Shown,
              values: valueParam,
            })))?.runList || []
            for (const run of leaderboard) {
              searchForVideos(run.video)
              searchForVideos(run.comment)
            }
          }))

          for (const prommy of valuesResult) {
            if (prommy.status === 'rejected') {
              console.error("Prommy failed", prommy.reason)
            }
          }
        }))
        
        for (const prommy of result) {
          if (prommy.status === 'rejected') {
            console.error("Prommy failed", prommy.reason)
          }
        }
      }
  
      state = { stage: 'runs', id: gameId }
      await saveState()
    }
    
    state = { stage: 'done' }
    await saveState()
  }

  if (state.stage === 'series') {
    let begun = !state?.id // start if there is no id, otherwise we have to find it
    const seriesList = (await getAllV2(getSeriesList()))?.seriesList || []
    const total = Object.entries(seriesList).length
    let tally = 0
    for (const { url: seriesUrl } of seriesList) {
      ++tally;
      if (!begun && seriesUrl !== state.id) continue;
      begun = true

      const seriesSummary = await getSeriesSummary({ seriesUrl })
      console.log(`Archiving ${seriesUrl}, series ${tally} of ${total} (${((tally/total)*100).toFixed(2)}%)`)

      if (seriesSummary?.threadCount) {
        await searchForum(seriesSummary.forum)
      }
  
      state = { stage: 'series', id: seriesUrl }
      await saveState()
    }
    
    state = { stage: 'runs' }
    await saveState()
  }

  console.log("Finished! For now...")

})();