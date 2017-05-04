#!/usr/bin/env node

'use strict'

const { extend, keys, map, reduce, sortBy, uniq, values } = require('lodash')
const axios = require('axios')
const Listr = require('listr')
const table = require('tty-table')

const ASIAN_SERVERS = {
  'sg': ['Singapore',             'sgp'],
  'jp': ['Tokyo, Japan',          'hnd-jp']
}

const EUROPEAN_SERVERS = {
  'de': ['Frankfurt, DE',         'fra-de'],
  'fr': ['Paris, FR',             'par-fr'],
  'nl': ['Amsterdam, NL',         'ams-nl'],
  'uk': ['London, UK',            'lon-gb'],
  'au': ['Sydney, Australia',     'syd-au']
}

const AMERICAN_SERVERS = {
  'ny': ['New York (New Jersey)', 'nj-us'],
  'il': ['Chicago, IL',           'il-us'],
  'fl': ['Miami, FL',             'fl-us'],
  'wa': ['Seattle, WA',           'wa-us'],
  'tx': ['Dallas, TX',            'tx-us'],
  'sf': ['San Francisco, CA',     'sjo-ca-us'],
  'la': ['Los Angeles, CA',       'lax-ca-us']
}

const ALL_SERVERS = extend({},
  ASIAN_SERVERS,
  EUROPEAN_SERVERS,
  AMERICAN_SERVERS,
  {
    'as': null,
    'eu': null,
    'us': null
  })

const { argv } = require('yargs')
  .usage('Usage: $0 [options]')
  .option('h', {
    alias: 'host',
    description: 'Hostname to ping',
    default: 'google.com',
    type: 'string'
  })
  .option('l', {
    alias: 'locations',
    description: 'Locations to test',
    default: keys(ALL_SERVERS),
    defaultDescription: 'All locations',
    type: 'array',
    choices: keys(ALL_SERVERS)
  })
  .help()

const selectedLocations = uniq(reduce(argv.locations, (accum, l) => {
  switch (l) {
  case 'as':
    return accum.concat(values(ASIAN_SERVERS))
  case 'eu':
    return accum.concat(values(EUROPEAN_SERVERS))
  case 'us':
    return accum.concat(values(AMERICAN_SERVERS))
  default:
    return accum.concat([ALL_SERVERS[l]])
  }
}, []))

function createPingTask([title, subdomain]) {
  return {
    title,
    task: (ctx) => axios
      .get(`http://${subdomain}-ping.vultr.com/ajax.php?cmd=ping&host=${argv.host}`)
      .then(({ data }) => {
        const pingSummaryParserRegex = /rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/
        const [, min, avg, max, mdev] = map(data.match(pingSummaryParserRegex), parseFloat)
        if (!ctx.results) {
          ctx.results = []
        }
        ctx.results.push({ title, min, avg, max, mdev })
      })
  }
}

function printResults(results) {
  const header = [
    {
      value: 'rank',
      headerColor: 'cyan',
      color: 'white',
      align: 'left',
      paddingLeft: 1,
      width: 8
    },
    {
      value: 'location',
      headerColor: 'cyan',
      color: 'white',
      align: 'left',
      paddingLeft: 1,
      width: 25
    },
    {
      value: 'min',
      headerColor: 'green',
      color: 'white',
      align: 'right',
      paddingLeft: 1,
      width: 10
    },
    {
      value: 'avg',
      headerColor: 'yellow',
      color: 'white',
      align: 'right',
      paddingLeft: 1,
      width: 10
    },
    {
      value: 'max',
      headerColor: 'red',
      color: 'white',
      align: 'right',
      paddingLeft: 1,
      width: 10
    },
    {
      value: 'mdev',
      headerColor: 'cyan',
      color: 'white',
      align: 'right',
      paddingLeft: 1,
      width: 10
    }
  ]

  const rows = map(sortBy(results, ({ avg }) => avg), (r, i) => [i + 1, ...values(r)])

  console.log(table(header, rows).render())
}

new Listr(map(selectedLocations, createPingTask), { concurrent: true })
  .run()
  .then((ctx) => printResults(ctx.results))
