import path from 'path';
import fs from 'fs';
import * as matter from 'gray-matter';

/**
 * Used to move the files into one folder, usually to use with another stage in a pipeline
 * to build the documentation.
 * @param {import('./models.mjs').RawPage[]} pages 
 */
export function run(pages, options) {
    if (!options.to) throw new Error('You need to specify --to for the copy export')
    const extension = options.extension || 'md'

    for (const file of pages) {
        const filePath = path.resolve(options.to, `${file.title}.${extension}`)

        if (options.plain) fs.writeFileSync(filePath, file.content)
        else fs.writeFileSync(filePath, matter.default.stringify(file.content, file.data))
    }
}

export function help () {
    return `
    Copy: Exports the documentation / configuration files to a specified folder. 
    Usually to use with a build stage in a pipeline.
    --to <folder>     The folder to export to.
    --extension <ext> The extension to use for the files. (default: md)
    --plain           Do not export the header information.

    Remember that you can use a "-t" flag to preprocess the files before they are exported,
    this is useful if you need to inject additional metadata. 
    `.replace(/\n[ ]+/g, '\n')
}