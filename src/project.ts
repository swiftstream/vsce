import { Webber } from "./webber"

export class Project {
    get currentDirectoryPath() { return this.webber.currentDirectoryPath }

    webber: Webber

    _managedBy = 'managed by SwifWeb'
    xmlManagedBy = `<!--${this._managedBy}-->`
    hashCommentManagedBy = `# ${this._managedBy}`
    commentManagedBy = `// ${this._managedBy}`

    constructor(webber: Webber) {
        this.webber = webber

    }
}