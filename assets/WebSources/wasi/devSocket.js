import ReconnectingWebSocket from "reconnecting-websocket"

export var devSocket = undefined

const env = _SwiftStreamEnv_

if (env.isDevelopment) {
    devSocket = new ReconnectingWebSocket(`wss://${location.host}/webber`)
    devSocket.addEventListener('message', message => {
        if (!message.data) return
        const data = JSON.parse(message.data)
        if (!data) return
        if (data.type == 'buildStarted') {}
        else if (data.type == 'buildProgress') {}
        else if (data.type == 'buildError') {}
        else if (data.type == 'hotReload') {
            location.reload()
        }
    })
}