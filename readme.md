---
title: Readme
---
# Doczen

Documentation coming soon, ironic for a documentation tool, huh?

The gist is that it'll fetch documentation from your projects and help you bundle, validate, and export them to other systems, like Confluence.

### What this project is / is not

Doczen is best used as a tool to enhance your documentation & configuration pipelines, making it easier to aggregate & filter those items for export or validation.

However, because there are many excellent solutions out there (Docusaurus, GitBook, Hugo, and many more), Doczen will not attempt to build websites natively.

Instead, we encourage you to use Doczen to feed those tools, and in the near future guides will be added to show an example pipeline that does so.

## CLI Usage

```txt
$ doczen -h confluence -h current -h copy
Version: 0.0.4
Main: A tool designed to super-charge your code-base's documentation.
-i, --input <glob>       Glob of files to parse. (You may use multiple -i flags)
-p, --prefix <prefix>    Prefix to add to all titles.
-x, --export <module>    A module used by doczen, executed left to right.
-h, --help <module>      Gets help for the specified module.
-t <file>                Uses an exported "transform" function to preprocess documentation before it is used.
--exclude <glob>         Glob of files to ignore. (You may use multiple --exclude flags)


Confluence: Exports a collection of markdown files to Confluence.
-s, --space <space>     The space key to export to
-u, --url <url>         The url of the confluence instance


Current: Validates that the documentation is up to date by checking the files that it references.

No command line options.

In the header of your documentation, you may specify a "files" property, which is an array of globs. Ex.
files: ["*.tsx"]


Copy: Exports the documentation / configuration files to a specified folder. 
Usually to use with a build stage in a pipeline.
--to <folder>     The folder to export to.
--extension <ext> The extension to use for the files. (default: md)

Remember that you can use a "-t" flag to preprocess the files before they are exported,
this is useful if you need to inject additional metadata. 
```

### Examples

```txt
---
title: Our Cool Component API
files: ["*.tsx"] 
---

# Our Cool Component API

...
```

```bash
# Validate that the documentation is newer than the code it describes (uses the "files" annotation)
doczen -i "src/**/*.md" -x current
```

``` bash
# Export the documentation to Confluence
doczen -i "src/**/*.md" -x confluence -u doczen -s DOC
```
