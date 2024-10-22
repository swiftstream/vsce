import ReconnectingWebSocket from "reconnecting-websocket"

export var devSocket = undefined

const env = _SwiftStreamEnv_

if (env.isDevelopment) {
    devSocket = new ReconnectingWebSocket(`wss://${location.host}/webber`)
    devSocket.addEventListener('message', message => {
        if (message.data === 'wasmRecompiled') {
            location.reload()
        } else if (message.data === 'entrypointRecooked') {
            location.reload()
        }
    })
}