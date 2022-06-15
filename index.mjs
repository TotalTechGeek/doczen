#!/usr/bin/env node
import glob from 'glob'
import * as matter from 'gray-matter'
import fs from 'fs'
import minimist from 'minimist'
import { pathToFileURL } from 'url'

const options = minimist(process.argv.slice(2))
options.prefix = options.prefix || options.p
options.exclude = [].concat(options.exclude || [])
options.input = [].concat(options.input || []).concat([].concat(options.i || []))
options.export = [].concat(options.export || []).concat([].concat(options.x || []))
options.help = [].concat(options.help || []).concat([].concat(options.h || []))

if (!options.input.length && !options.help.length) throw new Error('No input glob specified.')

export function help () {
    return `
    Version: 0.0.4
    Main: A tool designed to super-charge your code-base's documentation.
    -i, --input <glob>       Glob of files to parse. (You may use multiple -i flags)
    -p, --prefix <prefix>    Prefix to add to all titles.
    -x, --export <module>    A module used by doczen, executed left to right.
    -h, --help <module>      Gets help for the specified module.
    -t <file>                Uses an exported "transform" function to preprocess documentation before it is used.
    --exclude <glob>         Glob of files to ignore. (You may use multiple --exclude flags)
    `.replace(/\n[ ]+/g, '\n')
}

async function main () {
    if (options.help.length) {
        console.log(help())
        for (const item of options.help) {
            if (typeof item !== 'string') continue
            const defaultValue = () => `No help function available for "${item}".\n`
            if (fs.existsSync(`./${item}.js`)) console.log((await (await import(pathToFileURL(`${item}.js`).pathname))?.help ?? defaultValue)())
            else if (fs.existsSync(`./${item}.mjs`)) console.log((await (await import(pathToFileURL(`${item}.mjs`).pathname))?.help ?? defaultValue)())
            else console.log((await (await import(`./${item}.mjs`))?.help ?? defaultValue)())
        }
        return
    }

    const files = glob.sync(`*(${options.input.join('|')})`, { ignore: options.exclude })

    const firstExportIndex = process.argv.findIndex(i => i === '-x')
    const transform = process.argv.find((i, x) => (x < firstExportIndex || firstExportIndex === -1) && process.argv[x - 1] === '-t')
    const transformFunc = transform ? (await import(pathToFileURL(transform).pathname)).transform : i => i

    const results = files.map(file => {
        const { data, content } = matter.default(fs.readFileSync(file, 'utf8'))
        return transformFunc({ 
            source: pathToFileURL(file).pathname,
            relativeSource: file,
            title: options.prefix && data.title ? `${options.prefix}/${data.title}` : data.title,
            content,
            data
        })
    }).filter(i => i && i.title)

    for (const item of options.export) {
        // find the item in the arguments
        const index = process.argv.findIndex((i, x) => i === item && process.argv[x - 1] === '-x')
        let nextIndex = process.argv.findIndex((i, x) => i === '-x' && x > index)
        if (nextIndex === -1) nextIndex = process.argv.length

        const exportOptions = minimist(process.argv.slice(index + 1, nextIndex))
        const transformFunc = exportOptions.t ? (await import(pathToFileURL(exportOptions.t).pathname)).transform : i => i
        const arr = results.map(i => transformFunc(i)).filter(i => i)

        if (fs.existsSync(`./${item}.js`)) await (await import(pathToFileURL(`${item}.js`).pathname)).run(arr, exportOptions)
        else if (fs.existsSync(`./${item}.mjs`)) await (await import(pathToFileURL(`${item}.mjs`).pathname)).run(arr, exportOptions)
        else await (await import(`./${item}.mjs`)).run(arr, exportOptions)
    }
}
main()