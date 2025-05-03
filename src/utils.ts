import zlib from 'node:zlib';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from "node:path";

// Filesystem constants

export const gzip = promisify(zlib.gzip);
export const gunzip = promisify(zlib.gunzip);
const outDir = '../data/'

// Networking constants

const UA = `@qixils.dev/${Date.now()}`
let lastRequest = 0
export const src1Limit = 590
export const src2Limit = 800 // ms; theoretical ratelimit is 600
export const twitchLimit = 75

// Networking functions

export const ratelimit = async (limit: number) => {
  if (limit <= 0) return;

  const waitUntil = lastRequest + limit
  const waitFor = waitUntil - Date.now()
  lastRequest = Math.max(Date.now(), lastRequest) + limit
  if (waitFor <= 0) return
  await new Promise((resolve) => setTimeout(resolve, waitFor))
}

export const setSearchParams = (searchParams: URLSearchParams, params: Record<string, any>) => {
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value))
  }
}

export const urlWithParams = (url: string | URL, params: Record<string, any>) => {
  if (typeof url === 'string') {
    url = new URL(url)
  }
  setSearchParams(url.searchParams, params)
  return url
}

export const fetchJson = async (uri: string | URL | Request, init?: RequestInit, attempt?: number): Promise<any> => {
  if (!attempt) attempt = 0

  if (!init) init = { headers: { 'User-Agent': UA } };

  const uriString = String(uri)
  await ratelimit(
    uriString.includes('api.twitch.tv')
      ? twitchLimit
      : uriString.includes('speedrun.com/api/v2')
        ? src2Limit
        : src1Limit
  )
  // console.log('Fetching', uriString)

  try {
    const response = await fetch(uri, init)
    if (!response.ok) {
      const text = await response.text()
      console.error("Failed to", init.method || 'GET', uriString, "failed", response.status, text)
      if (response.status !== 404 && attempt < 15 && !text.includes("Invalid pagination")) {
        const sleepFor = response.status === 429 && response.headers.has('Ratelimit-Reset')
          ? Math.max(500, Date.now() - (parseInt(response.headers.get('Ratelimit-Reset') || '0') * 1000))
          : text.match(/rate ?limit|too many requests/ig)
            ? 90_000
            : 10_000
        await new Promise((resolve) => setTimeout(resolve, sleepFor))
        return await fetchJson(uri, init, attempt + 1)
      }
      return
    }
  
    const parsed = await response.json()
    if (!parsed) {
      console.error("Failed? to GET", uriString, "empty object", parsed)
    }
    return parsed
  } catch (e) {
    console.error("Failed to fetch for unknown reason", e)
    if (attempt < 15) {
      await new Promise((resolve) => setTimeout(resolve, 10_000))
      return await fetchJson(uri, init,attempt + 1)
    }
  }
}

// Filesystem functions

const replacer = (key: string, value: any) => {
  if (value instanceof Map) {
    return {
      dataType: 'Map',
      value: [...value],
    }
  }
  return value
}

const reviver = (key: string, value: any) => {
  if (typeof value === 'object' && value && 'dataType' in value && value.dataType === 'Map') {
    return new Map(value.value)
  }
  return value
}

export const outPath = (...to: string[]) => {
  return path.join(outDir, ...to)
}

export const saveTo = async (buffer: Parameters<typeof gzip>[0], to: string) => {
  const output = await gzip(buffer)
  const outFile = path.join(outDir, `${to}.gz`)
  await fs.writeFile(outFile, output)
  console.log('Saved', outFile)
}

export const jsonifyTo = async (object: Parameters<typeof JSON.stringify>[0], to: string) => {
  return saveTo(JSON.stringify(object, replacer), `${to}.json`)
}

export const loadFrom = async (from: string) => {
  try {
    const inFile = path.join(outDir, `${from}.gz`)
    const data = await fs.readFile(inFile)
    return await gunzip(data)
  } catch {
    const inFile = path.join(outDir, from)
    return await fs.readFile(inFile)
  }
}

export const jsonifyFrom = async (from: string) => {
  const input = await loadFrom(`${from}.json`)
  return JSON.parse(input.toString(), reviver)
}