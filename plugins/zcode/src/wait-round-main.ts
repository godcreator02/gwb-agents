import { WAIT_FAILED_PREFIX, waitRound } from './wait-round.js'

waitRound(process.argv.slice(2)).then(
  (line) => { process.stdout.write(`${line}\n`) },
  (error: unknown) => {
    process.stdout.write(`${WAIT_FAILED_PREFIX} ${(error as Error).message.replace(/\s+/g, ' ')}\n`)
    process.exitCode = 1
  },
)
