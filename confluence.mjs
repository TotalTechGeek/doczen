import superagent from 'superagent'
import MarkdownIt from 'markdown-it'
import markdownItContainer from 'markdown-it-container'
import minimist from 'minimist'
import { getZeroWidthHash } from './hash.mjs'

const options = minimist(process.argv.slice(2))
options.space = options.space || options.s 
options.url = options.url || options.u || ''
options.input = options.input || options.i

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


/**
 * 
 * @param {Omit<import('./models.mjs').Page, 'parent'>[]} pages 
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

    /** @type {import('./models.mjs').Page[]} */
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

/**
 * 
 * @param {import('./models.mjs').RawPage[]} pages 
 */
export async function run (pages) {
    if (!options.space || !options.url) throw new Error('You must specify a space and a url/user to use the confluence export')

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

    await createPages(pages.map(page => ({
        ...page,
        content: md.render(page.content)
    })))
}