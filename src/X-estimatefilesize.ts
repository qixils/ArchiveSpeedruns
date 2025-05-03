import { loadFrom } from "./utils";
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

interface Video {
  id: string
  views: string
  duration: string
  channel: string
  peril: 'y' | 'n'
  speedrun: 'y' | 'n'
}

const readCsvLine = (header: string[], line: string[]) => {
  return Object.fromEntries(line.map((item, index) => [header[index], item])) as unknown as Video
}

const readCsv = async () => {
  const videoData = (await loadFrom("speedrunners-highlights-and-uploads.csv")).toString().trim().split('\n')
  const header = videoData[0].split(',')
  return videoData.slice(1).map(line => readCsvLine(header, line.split(',')))
}

const getRandomSample = (array: any[], percentage: number) => {
  const sampleSize = Math.ceil(array.length * percentage);
  const shuffled = array.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, sampleSize);
}

const parseFilesize = (match?: RegExpMatchArray, def?: number) => {
  if (!match) {
    if (!def) {
      console.error("No default value provided", match, def)
    }
    return def || 0
  }
  const value = parseFloat(match[3]);
  const unit = match[4]
  switch (unit) {
    case 'K': return value * 1024;
    case 'M': return value * (1024 ** 2);
    case 'G': return value * (1024 ** 3);
    case 'T': return value * (1024 ** 4);
    default: {
      console.error("Unknown unit", unit);
      return 0;
    }
  }
}

;(async function() {
  const allVideos = await readCsv();
  const speedrunPerilVideos = allVideos.slice(0, allVideos.findIndex(v => v.peril === 'n' || v.speedrun === 'n'))

  console.log("Read CSV")

  const sampleSize = 0.05;
  const sampleVideos = getRandomSample(speedrunPerilVideos, sampleSize);

  console.log("Randomly sampled")

  let totalAudio = 0;
  let totalSource = 0;
  let total720p_60 = 0;
  let total720p = 0;
  let total480p = 0;
  let total360p = 0;
  let total160p = 0;

  const processVideo = async (video: any): Promise<void> => {
    try {
      const { stdout } = await execPromise(`py -m yt_dlp -F https://twitch.tv/videos/${video.id}`);
      const matches = [...stdout.matchAll(/(?:\d+x(\d+)\s+(\d+)|audio only).+~\s*(\d+\.\d+)(K|M|G)iB/g)];
      if (matches.length < 2) return;

      const audioFilesize = parseFilesize(matches[0]);
      const sourceFilesize = parseFilesize(matches[matches.length - 1]) + audioFilesize;
      const p720_60Filesize = parseFilesize(matches.find(match => match[1] === '720' && match[2] === '60') || (matches.length > 2 && matches.at(-1)) || undefined, (sourceFilesize - audioFilesize)) + audioFilesize;
      const p720Filesize = parseFilesize(matches.find(match => match[1] === '720') || (matches.length > 3 && matches.at(-2)) || undefined, (p720_60Filesize - audioFilesize)) + audioFilesize;
      const p480Filesize = parseFilesize(matches.find(match => match[1] === '480') || (matches.length > 4 && matches.at(-3)) || undefined, (p720Filesize - audioFilesize)) + audioFilesize;
      const p360Filesize = parseFilesize(matches.find(match => match[1] === '360') || (matches.length > 5 && matches.at(-4)) || undefined, (p480Filesize - audioFilesize)) + audioFilesize;
      const p160Filesize = parseFilesize(matches.find(match => match[1] === '160') || (matches.length > 6 && matches.at(-5)) || undefined, (p360Filesize - audioFilesize)) + audioFilesize;

      totalAudio += audioFilesize;
      totalSource += sourceFilesize;
      total720p_60 += p720_60Filesize;
      total720p += p720Filesize;
      total480p += p480Filesize;
      total360p += p360Filesize;
      total160p += p160Filesize;

      console.log(`Current video data:`, totalSource, total720p, total480p)
    } catch (error) {
      if (String(error).includes('does not exist') || String(error).includes('Forbidden')) return;
      console.error(`Error processing video ${video.id}:`, error);
    }
  }

  const maxConcurrent = 10;
  const promises = new Set<Promise<any>>();

  let i = 0;
  for (const video of sampleVideos) {
    console.log("Spawning", i++, "of", sampleVideos.length, `${(100 * i / sampleVideos.length).toFixed(2)}%`)
    const promise = processVideo(video).then(() => { promises.delete(promise) });
    promises.add(promise);
    if (promises.size >= maxConcurrent) {
      await Promise.race(promises);
    }
  }

  await Promise.all(promises);

  const totalAudioTiB = (totalAudio * (1/sampleSize)) / (1024 ** 4);
  const totalSourceTiB = (totalSource * (1/sampleSize)) / (1024 ** 4);
  const total720p_60TiB = (total720p_60 * (1/sampleSize)) / (1024 ** 4);
  const total720pTiB = (total720p * (1/sampleSize)) / (1024 ** 4);
  const total480pTiB = (total480p * (1/sampleSize)) / (1024 ** 4);
  const total360pTiB = (total360p * (1/sampleSize)) / (1024 ** 4);
  const total160pTiB = (total160p * (1/sampleSize)) / (1024 ** 4);

  console.log(`Total Source Filesize: ${totalSourceTiB.toFixed(2)} TiB`);
  console.log(`Total ~720p60 Filesize: ${total720p_60TiB.toFixed(2)} TiB`);
  console.log(`Total ~720p Filesize: ${total720pTiB.toFixed(2)} TiB`);
  console.log(`Total ~480p Filesize: ${total480pTiB.toFixed(2)} TiB`);
  console.log(`Total ~360p Filesize: ${total360pTiB.toFixed(2)} TiB`);
  console.log(`Total ~160p Filesize: ${total160pTiB.toFixed(2)} TiB`);
  console.log(`Total Audio Filesize: ${totalAudioTiB.toFixed(2)} TiB`);
})();