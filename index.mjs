#!/usr/bin/env node
import { program } from 'commander'
import superagent from 'superagent'
import glob from 'glob'
import * as matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import markdownItContainer from 'markdown-it-container'
import fs from 'fs'

program
    .version('0.0.1')
    .option('-s, --space <space>', 'The space key to use')
    .option('-i, --input <glob>', 'The glob to use to find the input files')
    .option('-u, --url <url>', 'The url of the wiki. Can also just be the <base>.atlassian.net')
    .option('-p, --prefix <prefix>', 'The prefix to use for the pages')
    .parse()

const options = program.opts()

if (!options.space || !options.url || !options.input) {
    throw new Error('You must specify a space, url & glob path')
}

const AUTHORIZATION = process.env.AUTHORIZATION || process.env.CONFLUENCE_AUTHORIZATION
const PAGE_SIZE = 1000
const SPACE_KEY = options.space
const base = options.url.includes('://') ? options.url : `https://${options.url}.atlassian.net`
const contentBase = `${base}/wiki/rest/api/content`
const url = `${contentBase}?limit=${PAGE_SIZE}&spaceKey=${SPACE_KEY}&expand=version&status=current`

/**
 * Used to get all the pages of the GEN wiki, in order to get a title dictionary. 
 * @returns {Promise<{ [key: string]: string }>} A mapping of titles to Page IDs.
 */
async function getPages () {
    let response = await superagent.get(url).set('Authorization', AUTHORIZATION)
    const pages = {}
    let count = 0
    while (true) {
        response.body.results.reduce((acc, page) => {
            acc[page.title] = { id: page.id, version: page.version.number }
            return acc
        }, pages)
        count += PAGE_SIZE
        if (response.body.size === PAGE_SIZE) response = await superagent.get(url + `&start=${count}`).set('Authorization', AUTHORIZATION)
        else break
    }
    return pages
}

/** @typedef {{ title: string, content: string, parent?: string }} Page */

/**
 * 
 * @param {Omit<Page, 'parent'>[]} pages 
 */
async function createPages (pages) {
    const hierarchy = { pages: {} }

    for (const page of pages) {
        let current = hierarchy
        
        const path = page.title.split('/')
        const title = path.pop()
        for (const p of path) {
            if (!current.pages[p]) current.pages[p] = {
                pages: {},
                title: p
            }
            current = current.pages[p]
        }
        current.pages[title] = {
            title,
            content: page.content,
            pages: { ...(current.pages[title]?.pages || {}) }
        }
    }

    /** @type {Page[]} */
    const correctPages = unwrapPages(hierarchy)
    const confluencePages = await getPages()    

    for (const page of correctPages) {
        if (page.title in confluencePages) {
            await updatePage(confluencePages[page.title].id, page.title, page.content, confluencePages[(page.parent||'').split('/').pop()]?.id, confluencePages[page.title].version + 1)
        }
        else {
            const id = await createPage(page.title, page.content, confluencePages[(page.parent||'').split('/').pop()]?.id)
            confluencePages[page.title] = { id, version: 1 } // add it to the dictionary
        }   
    }
} 


async function updatePage(id, title, content, parent, version) {
    const result = await superagent.put(`${contentBase}/${id}`).set('Authorization', AUTHORIZATION).send({
        type: 'page',
        title,
        space: {
            key: SPACE_KEY
        },
        version: { number: version },
        body: {
            storage: {
                value: content,
                representation: 'storage'
            }
        },
        ...(parent && {
            ancestors: [{ type: "page", id: parent }]
        })
    })
}

async function createPage(title, content, parent) {
    const result = await superagent.post(contentBase).set('Authorization', AUTHORIZATION).send({
        type: 'page',
        title,
        space: {
            key: SPACE_KEY
        },
        body: {
            storage: {
                value: content,
                representation: 'storage'
            }
        },
        ...(parent && {
            ancestors: [{ type: "page", id: parent }]
        })
    })
    return result.body.id
}

function unwrapPages (obj, arr = [], parent = undefined) {
    for (let item in obj.pages) {
        const data = obj.pages[item]
        if (parent) item += `${getZeroWidthHash(parent + '$' + item).substring(0, 6)}`
        arr.push({
            title: item,
            content: (data.content || '<Title /><TableOfContents />')
                .replace(/\<TableOfContents ?\/\>/, tableOfContents(item, Object.keys(data.pages)))
                .replace(/\<Title ?\/\>/, `<h1>${item}</h1>\n`),
            parent
        })
        unwrapPages(data, arr, parent ? `${parent}/${item}` : item)
    }
    return arr
}

/**
 * Generates placeholder text for the page, which is essentially a table index.
 * @param {string} title 
 * @param {string[]} keys 
 */
function tableOfContents (title, keys) {
    return `<ul>${keys.map(key => { 
        key += `${getZeroWidthHash(title + '$' + key).substring(0, 6)}`
        return `<li><ac:link><ri:page ri:content-title="${key}" /><ac:plain-text-link-body><![CDATA[${key}]]></ac:plain-text-link-body></ac:link></li>` 
    }).join('')}</ul>`
}

const cyrb53 = function(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
};

function getZeroWidthHash (str, alphabet = '\u200B\u200C\u200D\u2009\u200A\u206F') {
    const num = cyrb53(str)
    const base = alphabet.length
    const baseStr = num.toString(base)
    return baseStr.replace(/\d/g, match => alphabet[parseInt(match, base)]);
}

function createAtlassianPanel (icon, iconId, bgColor) {
    return (tokens, idx) => {
        if (tokens[idx].nesting === 1) {
            return `<ac:structured-macro ac:name="panel" ac:schema-version="1" ac:macro-id="7e3a9194-4ba2-4671-aec5-1cfd3542af88">
            <ac:parameter ac:name="panelIcon">${icon}</ac:parameter>
            <ac:parameter ac:name="panelIconId">${iconId}</ac:parameter>
            <ac:parameter ac:name="bgColor">${bgColor}</ac:parameter>
            <ac:rich-text-body>` 
          } 
          return '</ac:rich-text-body></ac:structured-macro>';
    }
}

async function main () {
    const files = glob.sync(options.input)
    const md = new MarkdownIt({
        xhtmlOut: true,
        html: true
    })

    md.use(markdownItContainer, 'info', { render: createAtlassianPanel(':icon:', 'atlassian-info', '#DFEBFF') })
    md.use(markdownItContainer, 'Info', { render: createAtlassianPanel(':icon:', 'atlassian-info', '#DFEBFF') })
    md.use(markdownItContainer, 'warning', { render: createAtlassianPanel(':icon:', 'atlassian-warning', '#FFFAE6') })
    md.use(markdownItContainer, 'caution', { render: createAtlassianPanel(':icon:', 'atlassian-warning', '#FFFAE6') })
    md.use(markdownItContainer, 'Warning', { render: createAtlassianPanel(':icon:', 'atlassian-warning', '#FFFAE6') })
    md.use(markdownItContainer, 'Success', { render: createAtlassianPanel(':icon:', 'atlassian-success', '#E3FCEF') })
    md.use(markdownItContainer, 'success', { render: createAtlassianPanel(':icon:', 'atlassian-success', '#E3FCEF') })
    md.use(markdownItContainer, 'Note', { render: createAtlassianPanel(':icon:', 'atlassian-note', '#EAE6FF') })
    md.use(markdownItContainer, 'note', { render: createAtlassianPanel(':icon:', 'atlassian-note', '#EAE6FF') })
    md.use(markdownItContainer, 'tip', { render: createAtlassianPanel(':icon:', 'atlassian-note', '#EAE6FF') })
    md.use(markdownItContainer, 'Tip', { render: createAtlassianPanel(':icon:', 'atlassian-note', '#EAE6FF') })

    const results = files.map(file => {
        const { data, content } = matter.default(fs.readFileSync(file, 'utf8'))
        return { 
            source: file,
            title: options.prefix && data.title ? `${options.prefix}/${data.title}` :data.title,
            content: md.render(content)
        }
    }).filter(i => i.title)
    await createPages(results)
}
main()