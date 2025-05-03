import { loadFrom } from "./utils"
import * as twitch from "./twitch"
import * as gql from "./gql"
import { writeFile } from "fs/promises"

const policy = Date.UTC(2014, 8, 1, 0, 0, 0, 0)
const testDate = Date.UTC(2025, 0, 20, 0, 0, 0, 0)
const timeKeys = ['createdAt', 'publishedAt', 'viewableAt', 'updatedAt', 'recordedAt'] as const

;(async () => {
  const broadcasterData = await loadFrom("endless-broadcasters.csv")
  const broadcasters = broadcasterData.toString().trim().split(/\s+/).flatMap(i => {
    const [idStr, dateStr, countStr] = i.split(',').map(x => x.trim())
    const id = parseInt(idStr)
    const dateStamp = Date.parse(dateStr)
    const date = dateStamp < policy
      ? 'Policy Inception'
      : new Date(dateStamp).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const count = parseInt(countStr)
    return [{ id, date, dateStamp, count }]
  })
  .sort((a, b) => a.id - b.id)

  const page = 50
  const usernames: (Omit<(typeof broadcasters)[number], 'dateStamp'> & { name: string, followers: number })[] = []
  for (let i = 0; i < broadcasters.length; i+=page) {
    const slice = broadcasters.slice(i, i+page)
    const id = slice.map(i => i.id.toString())
    const query = await gql.getUsers(id)
    for (const user of query) {
      const broadcaster = slice.find(u => u.id.toString() === user.id)
      if (!broadcaster) continue

      const { dateStamp, ...rest } = broadcaster

      const video = user.videos.edges.find(v => v?.node)?.node

      if (!video) {
        console.warn(`No video node for ${user.login} (${user.id})`)
        // continue
      }
      
      if (!(user.followers.totalCount >= 1000 || user.roles.isPartner) && (video && (timeKeys.every(key => !video[key] || Date.parse(video[key]) >= testDate)) || dateStamp >= testDate) && user.login.toLowerCase() !== 'sfpc_nyc') {
        console.warn(`${user.login}'s oldest video is newer than the test date`)
        continue
      }

      let name = user.displayName.toLowerCase() !== user.login.toLowerCase()
        ? `${user.displayName} (${user.login})`
        : user.displayName

      let roles = ''
      if (user.roles.isAffiliate) roles += 'A'
      if (user.roles.isPartner) roles += 'P'
      if (user.roles.isStaff) roles += 'S'
      if (user.roles.isGlobalMod) roles += 'G'
      if (user.roles.isSiteAdmin) roles += '!'
      if (roles) name += ` [${roles}]`

      usernames.push({
        ...rest,
        name,
        followers: user.followers.totalCount,
      })
    }
  }

  const userdata = usernames.map(user => ({ ...user, id: user.id.toString(), count: user.count.toString(), followers: user.followers.toString() }))
  userdata.sort((a, b) => {
    const name = a.name.localeCompare(b.name)
    if (name !== 0) return name

    return parseInt(a.id) - parseInt(b.id)
  })
  userdata.unshift({ id: 'ID', name: 'Display Name (Username)', date: 'Indefinite since', count: '# of archives', followers: 'Followers' })
  const maxIdLength = userdata.reduce((acc, item) => Math.max(item.id.length, acc), 0)
  const maxNameLength = userdata.reduce((acc, item) => Math.max(item.name.length, acc), 0)
  const maxDateLength = userdata.reduce((acc, item) => Math.max(item.date.length, acc), 0)
  const maxCountLength = userdata.reduce((acc, item) => Math.max(item.count.length, acc), 0)
  const maxFollowersLength = userdata.reduce((acc, item) => Math.max(item.followers.length, acc), 0)
  
  const output = userdata.map(user => `${user.id.toString().padStart(maxIdLength, ' ')} | ${user.name.padEnd(maxNameLength, ' ')} | ${user.date.padEnd(maxDateLength, ' ')} | ${user.count.padStart(maxCountLength)} | ${user.followers.padStart(maxFollowersLength, ' ')}`).join('\n') 
  await writeFile("../data/endless-broadcasters-badged.txt", output)
  console.log("done")
})();