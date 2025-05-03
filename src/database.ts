import Database from 'better-sqlite3';
import path from 'path';
import { loadFrom, saveTo } from "./utils";
import { writeFile } from 'fs/promises';

export interface Video {
  id: number;
  channel_id: number;
  title: string;
  duration_seconds: number;
  view_count: number;
  language: string;
  type: 'archive' | 'highlight' | 'upload';
  created_at: string;
}

type VideoId = Pick<Video, 'id'>

export const db = new Database(path.join(__dirname, '../data/videos.db'));

// Configure database for better write performance
// db.pragma('journal_mode = WAL');
// db.pragma('synchronous = NORMAL');
// db.pragma('temp_store = MEMORY');
// db.pragma('mmap_size = 30000000000');
// db.pragma('page_size = 32768');

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    view_count INTEGER NOT NULL,
    language TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at DATETIME NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_channel_id ON videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_created_at ON videos(created_at);
`);

export const insertVideo = db.prepare<Video>(`
  INSERT OR REPLACE INTO videos (id, channel_id, title, duration_seconds, view_count, language, type, created_at)
  VALUES (@id, @channel_id, @title, @duration_seconds, @view_count, @language, @type, @created_at)
`);

// Create a transaction wrapper for bulk inserts
export const insertVideosBulk = db.transaction((videos: Video[]) => {
  for (const video of videos) {
    insertVideo.run(video);
  }
});

export const getVideo = db.prepare<VideoId, Video>(`
  SELECT * FROM videos 
  WHERE id = @id
`);

export const getFirstVideoId = db.prepare<unknown[], VideoId>(`
  SELECT id FROM videos 
  ORDER BY id ASC LIMIT 1
`);

export const getLastVideoId = db.prepare<unknown[], VideoId>(`
  SELECT id FROM videos 
  ORDER BY id DESC LIMIT 1
`);

// Get top videos for a specific channel
export const getChannelTopVideos = db.prepare<{ channel_id: number, limit: number }, Video>(`
  SELECT * FROM videos 
  WHERE channel_id = @channel_id 
  AND type = 'archive'
  ORDER BY view_count DESC, id DESC
  LIMIT @limit
`);

/**
 * Gets the top 'highlight' and 'upload' videos that are at risk of being deleted on the 5/19 purge.
 * 
 * The videos that are SAFE are the most viewed videos of each channel, specifically the 100 most-viewed hours of content on each channel.
 * Thus the videos that are at risk are the ones that are not in the top 100 hours of videos.
 */
export const getTopEndangeredVideos = db.prepare<{ limit: number, offset: number }, Pick<Video, 'id' | 'channel_id' | 'duration_seconds' | 'view_count'>>(`
  WITH SafeVideos AS (
    SELECT 
      id,
      channel_id,
      duration_seconds,
      view_count,
      SUM(duration_seconds) OVER (PARTITION BY channel_id ORDER BY view_count DESC) as cumulative_duration
    FROM videos
    WHERE type IN ('highlight', 'upload')
  ),
  EndangeredVideos AS (
    SELECT 
      channel_id,
      MAX(view_count) as threshold_views
    FROM SafeVideos
    WHERE cumulative_duration > 360000
    GROUP BY channel_id
  )
  SELECT 
    v.id,
    v.channel_id,
    v.duration_seconds,
    v.view_count
  FROM videos v
  INNER JOIN EndangeredVideos ev ON v.channel_id = ev.channel_id
  WHERE 
    v.type IN ('highlight', 'upload')
    AND v.view_count = ev.threshold_views
  ORDER BY v.view_count DESC, v.id
  LIMIT @limit
  OFFSET @offset
`);

export const getVideos = db.prepare<{ limit: number, offset: number }, Pick<Video, 'id' | 'channel_id' | 'duration_seconds' | 'view_count'>>(`
  SELECT 
    id,
    channel_id,
    duration_seconds,
    view_count
  FROM videos
  WHERE type IN ('highlight', 'upload')
  ORDER BY channel_id, view_count, id
  LIMIT @limit
  OFFSET @offset
`);

export const getChannels = db.prepare<unknown[], { channels: number }>(`
  SELECT COUNT(DISTINCT channel_id) as channels
  FROM videos
  -- WHERE type IN ('highlight', 'upload')
`);

// Get channels with at least one video above view threshold
export const getChannelsAboveViews = db.prepare<{ min_views: number }, { channel_id: number }>(`
  SELECT DISTINCT channel_id
  FROM videos
  WHERE type IN ('highlight', 'upload')
  AND view_count >= @min_views
  -- ORDER BY channel_id
`);

export const countVideos = db.prepare<unknown[], { count: number }>(`
  SELECT COUNT(*) as count FROM videos
`);

export const sumViews = db.prepare<unknown[], { views: number }>(`
  SELECT SUM(view_count) as views
  FROM videos
  -- WHERE type IN ('highlight', 'upload')
`);

// Twitch deletes broadcasts after 60 days...
// With some exceptions... for fun, let's find the exceptions!
// Scraping started around 2025-04-20
export const getTwitchExceptions = db.prepare<unknown[], Pick<Video, 'channel_id'> & { earliest_date: string, archive_count: number }>(`
  SELECT 
    channel_id,
    MIN(created_at) as earliest_date,
    COUNT(*) as archive_count
  FROM videos
  WHERE type = 'archive'
  AND created_at < datetime('2025-01-20')
  GROUP BY channel_id
`);

export const sumExceptionViews = db.prepare<unknown[], { views: number, duration_seconds: number }>(`
  SELECT SUM(view_count) as views, SUM(duration_seconds) as duration_seconds
  FROM videos
  WHERE type = 'archive'
  AND created_at < datetime('2025-01-20')
`);

export const close = db.close;

// temp

const genCSV = (v: Record<string, any>[]) => {
  const keys = Object.keys(v[0])
  let output = keys.join(',') + '\n'
  for (const obj of v) {
    output += keys.map(key => String(obj[key])).join(',') + '\n'
  }
  return output.trim()
}

;(async () => {
  // Query is timing out so let's do this manually
  if (false) {
    const videosByChannel = new Map<number, Pick<Video, 'id' | 'duration_seconds' | 'view_count'>[]>(); // this map is hardly used now lol but whatever
    const endangeredVideos: Pick<Video, 'id' | 'channel_id' | 'duration_seconds' | 'view_count'>[] = [];

    const limit = 100000;
    let offset = 0;
    let activeChannelId = -1;

    while (true) {
      const videoBatch = getVideos.all({ limit, offset });
      if (videoBatch.length === 0) break;

      for (const queryVideo of videoBatch) {
        if (activeChannelId !== -1 && activeChannelId !== queryVideo.channel_id) {
          let totalDuration = 0;
          let endangeredAt = -1;
          const v = videosByChannel.get(activeChannelId) || [];
          videosByChannel.delete(activeChannelId);
          v.sort((a, b) => b.view_count - a.view_count);
          for (let i = 0; i < v.length; i++) {
            const vi = v[i];
            totalDuration += vi.duration_seconds;
            if (totalDuration > 360000) {
              endangeredAt = i;
              break;
            }
          }
          
          if (endangeredAt !== -1) {
            const thresholdViews = v[endangeredAt].view_count;
            endangeredAt = v.findIndex(vi => vi.view_count === thresholdViews);
            if (endangeredAt !== -1) {
              endangeredVideos.push(...v.slice(endangeredAt).map(vi => ({ ...vi, channel_id: activeChannelId })))
            }
          }
        }

        if (!videosByChannel.has(queryVideo.channel_id)) {
          videosByChannel.set(queryVideo.channel_id, []);
        }
        videosByChannel.get(queryVideo.channel_id)?.push(queryVideo);
      }

      offset += limit;

      if (offset % 100000 === 0) {
        console.log(`Processed ${offset.toLocaleString()} videos`);
      }
    }

    console.log(`Found ${endangeredVideos.length} endangered videos`);

    // Write CSV file
    const csv = genCSV(endangeredVideos);
    await saveTo(csv, "full-endangered-videos.csv");
  } else if (false) {
    const endangeredVideos = db.prepare<unknown[], Pick<Video, 'id' | 'channel_id' | 'duration_seconds' | 'view_count'>>(`
      WITH filtered AS (
        SELECT
          *
        FROM videos
        WHERE type IN ('highlight','upload')
      ),
      ordered AS (
        SELECT
          *,
          SUM(duration_seconds)
            OVER (
              PARTITION BY channel_id
              ORDER BY view_count DESC, id
            ) AS running_duration
        FROM filtered
      ),
      boundary AS (
        SELECT
          o.channel_id,
          o.view_count AS threshold_view_count
        FROM ordered AS o
        JOIN (
          SELECT
            channel_id,
            MIN(running_duration) AS min_running
          FROM ordered
          WHERE running_duration > 100 * 3600
          GROUP BY channel_id
        ) AS m
          ON o.channel_id = m.channel_id
        AND o.running_duration = m.min_running
      )
      SELECT
        v.id,
        v.channel_id,
        v.view_count,
        v.duration_seconds
      FROM videos AS v
      JOIN boundary AS b
        ON v.channel_id = b.channel_id
      WHERE v.view_count <= b.threshold_view_count
        AND v.type IN ('highlight','upload')
      ORDER BY v.channel_id ASC, v.view_count DESC, v.duration_seconds DESC, v.id ASC;
    `).all()

    console.log(endangeredVideos.length)

    const csv = genCSV(endangeredVideos);
    await saveTo(csv, "full-endangered-videos-query-sorted.csv");
  } else if (true) {
    // const jaku = getChannelTopVideos.all({ channel_id: 138803, limit: 1000 })
    // console.log("creator has", jaku.length, "videos")

    console.log(JSON.stringify(getChannelTopVideos.all({ channel_id: 24311419, limit: 1000 }), undefined, 2))

    // console.log("there are", countVideos.get()?.count, "videos in total")
    // console.log("video test:", getVideo.get({ id: 2436563279 }))
    // console.log("first video:", getFirstVideoId.get()?.id)
    // console.log("last video:", getLastVideoId.get()?.id)
    // console.log("channels:", getChannels.get()?.channels)
    // console.log("sum views:", sumViews.get()?.views)
    // console.log("sum exception:", sumExceptionViews.get())

    // const exceptions = getTwitchExceptions.all()
    // const exceptionStr = exceptions.map(e => `${e.channel_id},${e.earliest_date},${e.archive_count}`).join("\n")
    // await writeFile("../data/endless-broadcasters.csv", exceptionStr)
  }
})();