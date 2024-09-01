export function sortLibraryFilePaths(paths: string[]): {
    js: string[],
    css: string[],
    fonts: string[]
} {
    const js = paths.filter((x) => {
        const s = x.split('.')
      return s[s.length - 1] == 'js'
    })
    const css = paths.filter((x) => {
        const s = x.split('.')
        return s[s.length - 1] == 'css'
    })
    const fonts = paths.filter((x) => {
        const s = x.split('.')
        return ['ttf', 'otf', 'woff', 'woff2', 'eot', 'sfnt'].includes(s[s.length - 1])
    })
    return {
        js: js,
        css: css,
        fonts: fonts
    }
}