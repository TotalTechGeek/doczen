
import fs from 'fs'
import glob from 'glob'
import path from 'path'
import logSymbols from 'log-symbols'

/**
 * Validates that the documentation is up to date by checking the files that it references.
 * @param {import('./models.mjs').RawPage[]} files 
 */
export async function run (files) {
    let count = 0
    for (const original of files) {
        const source = original.source 
        if (original.data.files) {
            const globs = [].concat(original.data.files)
            const updatedAt = fs.statSync(source).mtime

            for (const glb of globs) {
                const files = glob.sync(glb, {
                    cwd: path.resolve(source, '../')
                })

                for (const file of files) {
                    const filePath = path.resolve(source, '../', file)
                    const stat = fs.statSync(filePath)
                    if (stat.mtime > updatedAt) {
                        console.log(logSymbols.error, `${file} is newer than ${original.relativeSource}, update your documentation.`)
                        count++
                    }
                }
            }
        }
    }
    if (count) process.exit(count)
}