import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import type { Video } from './database';

const dataDir = path.join(__dirname, '../data');
const canonPath = 'videos.db'
const targetDb = new Database(path.join(dataDir, canonPath));

// targetDb.pragma('journal_mode = WAL');
// targetDb.pragma('synchronous = NORMAL');
// targetDb.pragma('temp_store = MEMORY');
// targetDb.pragma('mmap_size = 30000000000');
// targetDb.pragma('page_size = 32768');

// Create schema in target database
targetDb.exec(`
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

const insertVideo = targetDb.prepare<Video>(`
  INSERT OR REPLACE INTO videos (id, channel_id, title, duration_seconds, view_count, language, type, created_at)
  VALUES (@id, @channel_id, @title, @duration_seconds, @view_count, @language, @type, @created_at)
`);

const batchInsert = targetDb.transaction((videos: Video[]) => {
  for (const video of videos) {
    insertVideo.run(video);
  }
});

async function findDatabases(): Promise<string[]> {
  const files = await fs.readdir(dataDir);
  return files
    .filter(f => f.endsWith('.db') && f !== canonPath)
    .map(f => path.join(dataDir, f));
}

const BATCH_SIZE = 10000;

async function mergeDatabase(sourcePath: string) {
  console.log(`Merging ${path.basename(sourcePath)}...`);
  const sourceDb = new Database(sourcePath, { readonly: true });

  const targetCount = targetDb.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number };
  console.log(`Target has ${targetCount.count} videos`);
  
  const count = sourceDb.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number };
  console.log(`Found ${count.count} videos to merge`);

  let offset = 0;
  let processed = 0;
  
  while (offset < count.count) {
    const videos = sourceDb.prepare<{}, Video>(`
      SELECT * FROM videos 
      LIMIT ${BATCH_SIZE} 
      OFFSET ${offset}
    `).all({});
    
    if (videos.length === 0) break;
    
    batchInsert(videos);
    
    processed += videos.length;
    offset += BATCH_SIZE;
    
    if (processed % 100000 === 0) {
      console.log(`Processed ${processed.toLocaleString()} / ${count.count.toLocaleString()} videos`);
    }
  }

  sourceDb.close();
  console.log(`Finished merging ${path.basename(sourcePath)}`);
}

async function main() {
  const databases = await findDatabases();
  console.log(`Found ${databases.length} databases to merge`);

  for (const db of databases) {
    await mergeDatabase(db);
  }

  const finalCount = targetDb.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number };
  console.log(`Merge complete! Final database contains ${finalCount.count} videos`);
  targetDb.close();
}

main().catch(console.error);
