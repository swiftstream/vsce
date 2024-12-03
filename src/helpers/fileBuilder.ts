import * as fs from 'fs'

export class FileBuilder {
    private lines: string[] = []
    
    constructor () {}

    import(name: string): FileBuilder {
        this.lines.push(`import ${name}`)
        return this
    }

    emptyLine(): FileBuilder {
        this.lines.push('')
        return this
    }
    
    line(content: string): FileBuilder {
        this.lines.push(content)
        return this
    }
    
    ifLine(condition: boolean, content: string): FileBuilder {
        if (condition) {
            this.lines.push(content)
        }
        return this
    }

    content(): string {
        return this.lines.join('\n')
    }

    writeFile(folder: string, file: string) {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true })
        }
        fs.writeFileSync(`${folder}/${file}`, this.content())
    }
}