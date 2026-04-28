import { runScanner } from './scanner/index.js'
import { runDigest } from './digest.js'

function scheduleInterval(label: string, intervalMs: number, fn: () => Promise<void>) {
  console.log(`[scheduler] ${label} every ${Math.round(intervalMs / 3600000 * 10) / 10}h`)
  setTimeout(async function tick() {
    console.log(`[scheduler] starting ${label}`)
    try { await fn() } catch (e) { console.error(`[scheduler] ${label} error:`, e) }
    setTimeout(tick, intervalMs)
  }, intervalMs)
}

function scheduleDaily(label: string, hour: number, fn: () => Promise<void>) {
  function scheduleNext() {
    const now = new Date()
    const next = new Date()
    next.setHours(hour, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    const ms = next.getTime() - now.getTime()
    console.log(`[scheduler] ${label} next run at ${next.toISOString()} (in ${Math.round(ms / 60000)} min)`)
    setTimeout(async () => {
      console.log(`[scheduler] starting ${label}`)
      try { await fn() } catch (e) { console.error(`[scheduler] ${label} error:`, e) }
      scheduleNext()
    }, ms)
  }
  scheduleNext()
}

export function startScheduler() {
  const scanIntervalHours = Number(process.env.SCAN_INTERVAL_HOURS ?? 6)
  const digestHour = Number(process.env.DIGEST_HOUR ?? 6)
  scheduleInterval('scanner', scanIntervalHours * 3600000, runScanner)
  scheduleDaily('digest', digestHour, runDigest)
}
