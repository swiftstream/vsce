import { commands, env, window } from "vscode"

export async function sshHostInstructions() {
    const existingTerminals = new Set(window.terminals.map(t => t.name))
    const existingTeminal = window.terminals.find(t => {
        const tt: any = t.creationOptions
        return tt?.cwd?.scheme === 'vscode-local'
    })
    if (!existingTeminal)
        await commands.executeCommand('workbench.action.terminal.newLocal')
    setTimeout(async () => {
        const newTerminals = window.terminals.filter(t => !existingTerminals.has(t.name))
        if (existingTeminal || newTerminals.length > 0) {
            const hostTerminal = existingTeminal ?? newTerminals[0]
            hostTerminal.show()
            hostTerminal.sendText(`clear && [ -n "$SSH_AUTH_SOCK" ] && echo -e "\\x1b[1;32m\\nAlready loaded keys:\\n\\x1b[0m" && ssh-add -l && echo -e "\\x1b[1;33m\\nAdd more via\\x1b[1;32m\\n    ssh-add ~/.ssh/id_rsa\\n\\x1b[0m" || (eval "$(ssh-agent -s)" && echo -e "\\x1b[1;33m\\nAdd your key via\\x1b[1;32m\\n    ssh-add ~/.ssh/id_rsa\\n\\x1b[0m")`)
        } else {
            switch (await window.showInformationMessage(
                `To make sure your SSH agent is working on the host machine:\n
            1. Open a terminal on your host (not in the container).
            2. Start the SSH agent if it’s not running:
                eval "$(ssh-agent -s)"
            3. Add your private key to the agent:
                ssh-add ~/.ssh/id_rsa
            
            After that, reconnect to your devcontainer.`,
                'Copy Command'
            )) {
                case 'Copy Command':
                    await env.clipboard.writeText('eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_rsa')
                    window.showInformationMessage('Command copied to clipboard!')
                    break
                default: break
            }
        }
    }, 1000)
}