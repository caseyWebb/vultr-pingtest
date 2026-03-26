#!/usr/bin/env node

'use strict'

const { parseArgs } = require('node:util')

// --- Server Definitions ---

const ASIAN_SERVERS = {
  sg: ['Singapore', 'sgp'],
  jp: ['Tokyo, Japan', 'hnd-jp']
}

const EUROPEAN_SERVERS = {
  de: ['Frankfurt, DE', 'fra-de'],
  fr: ['Paris, FR', 'par-fr'],
  nl: ['Amsterdam, NL', 'ams-nl'],
  uk: ['London, UK', 'lon-gb'],
  au: ['Sydney, Australia', 'syd-au']
}

const AMERICAN_SERVERS = {
  ny: ['New York (New Jersey)', 'nj-us'],
  il: ['Chicago, IL', 'il-us'],
  fl: ['Miami, FL', 'fl-us'],
  wa: ['Seattle, WA', 'wa-us'],
  tx: ['Dallas, TX', 'tx-us'],
  sf: ['San Francisco, CA', 'sjo-ca-us'],
  la: ['Los Angeles, CA', 'lax-ca-us']
}

const REGIONS = { as: ASIAN_SERVERS, eu: EUROPEAN_SERVERS, us: AMERICAN_SERVERS }
const ALL_SERVERS = { ...ASIAN_SERVERS, ...EUROPEAN_SERVERS, ...AMERICAN_SERVERS }
const VALID_KEYS = [...Object.keys(ALL_SERVERS), ...Object.keys(REGIONS)]

// --- CLI ---

function printUsage() {
  console.log(`Usage: vultr-pingtest [options]

Options:
  -h, --host <host>          Hostname to ping (default: google.com)
  -l, --locations <loc...>   Locations to test (default: all)
      --help                 Show this help

Locations:
  ${Object.entries(ALL_SERVERS).map(([k, [name]]) => `${k.padEnd(4)} ${name}`).join('\n  ')}

Regions:
  as   All Asian servers
  eu   All European servers
  us   All American servers`)
  process.exit(0)
}

const { values: opts, positionals } = parseArgs({
  options: {
    host: { type: 'string', short: 'h', default: 'google.com' },
    locations: { type: 'string', short: 'l', multiple: true },
    help: { type: 'boolean', default: false }
  },
  allowPositionals: true,
  strict: false
})

if (opts.help) printUsage()

const hasLocations = opts.locations || positionals.length > 0
const locationKeys = hasLocations
  ? [...(opts.locations || []), ...positionals]
  : VALID_KEYS

const seen = new Set()
const selectedLocations = locationKeys.flatMap((l) => {
  if (REGIONS[l]) return Object.values(REGIONS[l])
  if (ALL_SERVERS[l]) return [ALL_SERVERS[l]]
  console.error(`Unknown location: ${l}\nValid: ${VALID_KEYS.join(', ')}`)
  process.exit(1)
}).filter(([, sub]) => seen.has(sub) ? false : (seen.add(sub), true))

// --- ANSI ---

const ESC = '\x1b['
const RESET = `${ESC}0m`
const RED = `${ESC}31m`
const GREEN = `${ESC}32m`
const YELLOW = `${ESC}33m`
const CYAN = `${ESC}36m`
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`
const CLEAR_LINE = `${ESC}2K`
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// --- Task Runner ---

function runTasks(tasks) {
  return new Promise((resolve) => {
    const states = tasks.map(() => 'running')
    const results = []
    let frame = 0
    let done = 0

    process.stderr.write(HIDE_CURSOR)
    process.stderr.write('\n'.repeat(tasks.length))

    const render = () => {
      process.stderr.write(`${ESC}${tasks.length}A`)
      for (let i = 0; i < tasks.length; i++) {
        const icon = states[i] === 'running'
          ? `${CYAN}${SPINNER[frame % SPINNER.length]}${RESET}`
          : states[i] === 'done'
            ? `${GREEN}✓${RESET}`
            : `${RED}✗${RESET}`
        process.stderr.write(`${CLEAR_LINE}  ${icon} ${tasks[i].title}\n`)
      }
    }

    const cleanup = () => { clearInterval(interval); process.stderr.write(SHOW_CURSOR) }
    process.on('SIGINT', () => { cleanup(); process.exit(130) })

    const interval = setInterval(() => { frame++; render() }, 80)

    tasks.forEach((task, i) => {
      task.run()
        .then((result) => { states[i] = 'done'; results.push(result) })
        .catch(() => { states[i] = 'error' })
        .finally(() => {
          if (++done === tasks.length) {
            cleanup()
            render()
            resolve(results)
          }
        })
    })
  })
}

// --- Ping ---

function createPingTask([title, subdomain], host) {
  return {
    title,
    run: () => fetch(`http://${subdomain}-ping.vultr.com/ajax.php?cmd=ping&host=${host}`)
      .then((res) => res.text())
      .then((data) => {
        const m = data.match(/rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/)
        if (!m) throw new Error('Failed to parse ping response')
        return { title, min: +m[1], avg: +m[2], max: +m[3], mdev: +m[4] }
      })
  }
}

// --- Table ---

const COLUMNS = [
  { header: 'Rank',     width: 6,  align: 'left',  color: CYAN },
  { header: 'Location', width: 25, align: 'left',  color: CYAN },
  { header: 'Min',      width: 10, align: 'right', color: GREEN },
  { header: 'Avg',      width: 10, align: 'right', color: YELLOW },
  { header: 'Max',      width: 10, align: 'right', color: RED },
  { header: 'Mdev',     width: 10, align: 'right', color: CYAN }
]

function pad(s, w, align) {
  s = String(s)
  const p = Math.max(0, w - s.length)
  return align === 'right' ? ' '.repeat(p) + s : s + ' '.repeat(p)
}

function printTable(results) {
  const sorted = results.sort((a, b) => a.avg - b.avg)

  const rule = (l, m, r) =>
    l + COLUMNS.map((c) => '─'.repeat(c.width + 2)).join(m) + r

  const row = (cells) =>
    '│' + cells.map((s) => ` ${s} `).join('│') + '│'

  console.log(rule('┌', '┬', '┐'))
  console.log(row(COLUMNS.map((c) => `${c.color}${pad(c.header, c.width, c.align)}${RESET}`)))
  console.log(rule('├', '┼', '┤'))

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    console.log(row([
      pad(i + 1, COLUMNS[0].width, COLUMNS[0].align),
      pad(r.title, COLUMNS[1].width, COLUMNS[1].align),
      pad(r.min.toFixed(3), COLUMNS[2].width, COLUMNS[2].align),
      pad(r.avg.toFixed(3), COLUMNS[3].width, COLUMNS[3].align),
      pad(r.max.toFixed(3), COLUMNS[4].width, COLUMNS[4].align),
      pad(r.mdev.toFixed(3), COLUMNS[5].width, COLUMNS[5].align)
    ]))
  }

  console.log(rule('└', '┴', '┘'))
}

// --- Main ---

runTasks(selectedLocations.map((loc) => createPingTask(loc, opts.host)))
  .then((results) => { if (results.length > 0) printTable(results) })
