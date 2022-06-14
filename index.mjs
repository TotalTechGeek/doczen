#!/usr/bin/env node
import glob from 'glob'
import * as matter from 'gray-matter'
import fs from 'fs'
import minimist from 'minimist'
import { pathToFileURL } from 'url'

const options = minimist(process.argv.slice(2))
options.prefix = options.prefix || options.p
options.input = options.input || options.i
options.export = [].concat(options.export || []).concat([].concat(options.x || []))

if (!options.input) throw new Error('No input glob specified.')

async function main () {
    const files = glob.sync(options.input)

    const results = files.map(file => {
        const { data, content } = matter.default(fs.readFileSync(file, 'utf8'))
        return { 
            source: pathToFileURL(file).pathname,
            relativeSource: file,
            title: options.prefix && data.title ? `${options.prefix}/${data.title}` : data.title,
            content,
            data
        }
    }).filter(i => i.title)

    for (const item of options.export) {
        if (fs.existsSync(`./${item}.js`)) await (await import(pathToFileURL(`${item}.js`).pathname)).run(results)
        else if (fs.existsSync(`./${item}.mjs`)) await (await import(pathToFileURL(`${item}.mjs`).pathname)).run(results)
        else await (await import(`./${item}.mjs`)).run(results)
    }
}
main()