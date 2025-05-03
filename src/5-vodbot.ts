import { loadFrom } from "./utils";
import { exec } from 'child_process';
import util from 'util';
import fs from 'node:fs/promises';
import readline from 'readline';

const execPromise = util.promisify(exec);

interface Video {
  id: string
  views: string
  duration: string
  channel: string
  peril?: 'y' | 'n'
  speedrun?: 'y' | 'n'
}

interface VideoState {
  downloaded: Set<string>;
  uploaded: Set<string>;
  failed: Set<string>;
}

const STATE_FILE = "H:\\vodbot\\vods\\state.json";

async function loadState(): Promise<VideoState> {
  try {
    const data = await fs.readFile(STATE_FILE);
    const state = JSON.parse(data.toString());
    return {
      downloaded: new Set(state.downloaded),
      uploaded: new Set(state.uploaded),
      failed: new Set(state.failed)
    };
  } catch {
    return { downloaded: new Set(), uploaded: new Set(), failed: new Set() };
  }
}

async function saveState(state: VideoState) {
  await fs.writeFile(STATE_FILE, JSON.stringify({
    downloaded: Array.from(state.downloaded),
    uploaded: Array.from(state.uploaded),
    failed: Array.from(state.failed)
  }));
}

const readCsvLine = (header: string[], line: string[]) => {
  return Object.fromEntries(line.map((item, index) => [header[index], item])) as unknown as Video
}

const readCsv = async () => {
  const videoData = (await loadFrom("speedrunners-highlights-and-uploads.csv")).toString().trim().split('\n')
  const header = videoData[0].split(',')
  return videoData.slice(1).map(line => readCsvLine(header, line.split(',')))
}

const readPeril = async () => {
  const allVideos = await readCsv();
  return allVideos//.filter(v => v.peril === 'y' && v.speedrun === 'y')
}

const loadUnknownErrors = async () => {
  try {
    return (await fs.readFile("H:\\vodbot\\vods\\skipped.txt")).toString().trim().split(/\s+/)
  } catch {
    return []
  }
}

const loadUploaded = async () => {
  try {
    return (await fs.readFile("H:\\vodbot\\vods\\uploads.csv")).toString().trim().split(/\s+/).map(line => line.split(",")[1]);
  } catch {
    return [];
  }
}

const loadDownloaded = async () => {
  try {
    const files = await fs.readdir("H:\\vodbot\\stage");
    return files.map(f => f.replace(/\.stage$/, ''));
  } catch {
    return [];
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let downloadConcurrency = 0;
let uploadConcurrency = 5;
let exitRequested = false;

rl.on('line', (input) => {
  const [command, ...args] = input.trim().toLowerCase().split(/\s+/);
  switch (command) {
    case 'exit':
      exitRequested = true;
      rl.close();
      console.log("Will exit at nearest convenience");
      break;
    case 'concurrency':
      const [type, value] = args;
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < 0) {
        console.log('Invalid concurrency value. Must be a non-negative number.');
        break;
      }
      if (type === 'download') {
        downloadConcurrency = numValue;
        console.log(`Download concurrency set to ${numValue}`);
      } else if (type === 'upload') {
        uploadConcurrency = numValue;
        console.log(`Upload concurrency set to ${numValue}`);
      } else {
        console.log('Usage: concurrency <download|upload> <number>');
      }
      break;
    default:
      console.log('Unknown command. Available commands: exit, concurrency');
  }
});

async function downloadVideo(video: Video, state: VideoState): Promise<boolean> {
  try {
    console.log('Downloading', video.id)
    const { stderr } = await execPromise(
      `py -m vodbot -c H:\\vodbot\\config.json stage new ${video.id}`,
      { maxBuffer: 1024 * 1024 * 100 }
    );
    if (stderr) console.warn(stderr);
    state.downloaded.add(video.id);
    await saveState(state);
    console.log("Downloaded", video.id);
    return true;
  } catch (error) {
    console.error(`Error downloading ${video.id}:`, error);
    state.failed.add(video.id);
    await saveState(state);
    return false;
  }
}

async function uploadVideo(video: Video, state: VideoState): Promise<void> {
  while (!exitRequested) {
    try {
      console.log('Uploading', video.id)
      const { stderr } = await execPromise(
        `py -m vodbot -c H:\\vodbot\\config.json upload ${video.id}`,
        { maxBuffer: 1024 * 1024 * 100 }
      );
      if (stderr) console.warn(stderr);
      state.uploaded.add(video.id);
      await saveState(state);
      console.log("Uploaded", video.id);
      return;
    } catch (error: any) {
      if ('stdout' in error && String(error.stdout).includes('uploadLimitExceeded')) {
        console.log('Upload limit exceeded, sleeping for 30 minutes...');
        await sleep(30 * 60 * 1000);
        continue;
      }
      console.error(`Error uploading ${video.id}:`, error);
      state.failed.add(video.id);
      await saveState(state);
      return;
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processQueue(
  videos: Video[],
  state: VideoState,
  operation: "download" | "upload"
) {
  const promises = new Set<Promise<any>>();
  
  while (!exitRequested) {
    let foundWork = false;
    const concurrency = operation === "download" ? downloadConcurrency : uploadConcurrency;
    
    if (concurrency === 0) {
      // console.debug(`${operation} queue paused, sleeping...`);
      await sleep(5000);
      continue;
    }
    
    for (const video of videos) {
      if (exitRequested) break;
      
      if (operation === "download") {
        if (state.downloaded.has(video.id) || state.failed.has(video.id)) continue;
      } else {
        if (!state.downloaded.has(video.id) || state.uploaded.has(video.id) || state.failed.has(video.id)) continue;
      }

      foundWork = true;
      const task = operation === "download" 
        ? downloadVideo(video, state)
        : uploadVideo(video, state);
      
      const promise = task.then(() => {promises.delete(promise)});
      promises.add(promise);
      
      if (promises.size >= concurrency) {
        await Promise.race(promises);
      }
    }
    
    if (!foundWork) {
      console.log("Waiting for new uploads")
      await sleep(5000); // Wait 5 seconds before scanning again
    }
  }

  await Promise.all(promises);
}

;(async function() {
  const videos = await readPeril();
  const state = await loadState();
  
  // Add unknown errors to failed state and load previously uploaded/downloaded videos
  const [unknownErrors, uploaded, downloaded] = await Promise.all([
    loadUnknownErrors(), 
    loadUploaded(),
    loadDownloaded(),
  ]);
  // console.log("Errors:", unknownErrors, "- Uploaded:", uploaded, "- Downloaded:", downloaded)
  for (const id of unknownErrors) {
    state.failed.add(id);
  }
  for (const id of uploaded) {
    state.uploaded.add(id);
  }
  for (const id of downloaded) {
    state.downloaded.add(id);
  }
  // allow failed uploads to retry
  for (const id of state.downloaded) {
    state.failed.delete(id)
  }
  await saveState(state);
  
  console.log("Starting download and upload processors...");
  
  // Run download and upload processors concurrently
  await Promise.all([
    processQueue(videos, state, "download"),
    processQueue(videos, state, "upload"),
  ]);

  console.log("done");
})();