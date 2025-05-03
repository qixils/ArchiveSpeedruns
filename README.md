# Archive Speedruns

Collection of scripts for discovering and saving endangered broadcasts from the upcoming purge of Twitch videos on [May 19th 2025].
Twitch is scheduled to keep every channel's 100 hours of most viewed highlights and uploads, and delete everything else.

## Explanations

| File                       | Use                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `0-games`                  | Scans the speedrun.com games list                                                                                                          |
| `1-discovery`              | Scans through all the content on speedrun.com using the data from #0 to find all Twitch (and miscellaneous) URLs                           |
| `2-twitch-channels`        | Scans for the uploader of all discovered videos                                                                                            |
| `3-twitch-peril`           | Scans every uploader's uploaded videos to find which ones are at risk of deletion                                                          |
| `4-sort`                   | Generates CSVs describing the endangered videos, optionally with some filtering for importance                                             |
| `5-vodbot`                 | Uses [vodbot] to download and upload endangered videos to YouTube                                                                          |
| `X-warc`                   | Scans locally downloaded WARC files for video URLs, a la #1                                                                                |
| `X-html`                   | Scans locally downloaded text files for video URLs, a la #1                                                                                |
| `X-twitch-channels-manual` | Scans a locally downloaded list of channel usernames for video URLs, a la #1                                                               |
| `X-decodeR`                | Util to check the progress of #1                                                                                                           |
| `X-estimateduration`       | Estimates how long #1 will take                                                                                                            |
| `X-estimatefilesize`       | Estimates the expected filesize of downloading all videos from #4                                                                          |
| `X-megawarc`               | Attempts to extract a dataset of all videos on Twitch using items from the Archive Team project. Abandoned due to items remaining private. |
| `X-twitchbulk`             | Scans all video IDs on Twitch                                                                                                              |
| `X-twitchmerge`            | Merges multiple databases from twitchbulk, for instance from running on multiple IPs                                                       |
| `database`                 | Has some random queries used to extract interesting data from twitchbulk, including endangered videos                                      |
| `X-broadcasters`           | Adds extra account information to some data extracted from twitchbulk, used for the [Broadcasters w/ Endless Retention] list               |

Compile with `npx tsc` and run from the `out` folder with `node blah.js`

<!-- URLS -->

[May 19th 2025]: http://archive.today/2025.04.21-074155/https://help.twitch.tv/s/article/video-on-demand?language=en_US
[vodbot]: https://github.com/qixils/vodbot
[Broadcasters w/ Endless Retention]: https://docs.google.com/spreadsheets/d/1-_XWKN_QEtoWKMuzhMWoFzP1jgA1i2y6D1rYVTskWsg/edit?usp=sharing
