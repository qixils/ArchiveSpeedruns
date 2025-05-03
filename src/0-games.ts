import { getAllV1, getGames } from "./src";
import { jsonifyTo } from "./utils";

;(async function() {
  const games = await getAllV1(getGames({ embed: ['categories'] }))
  const reduced = Object.fromEntries(games.map(game => ([game.id, game.categories.data.map(category => category.id)])))
  await jsonifyTo(reduced, 'games')
})();