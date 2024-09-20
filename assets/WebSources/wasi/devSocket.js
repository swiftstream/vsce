export var devSocket = undefined

if (process.env.NODE_ENV === 'development') {
    const ReconnectingWebSocket = require('reconnecting-websocket')
    devSocket = new ReconnectingWebSocket(`wss://${location.host}/webber`)
    devSocket.addEventListener('message', message => {
        if (message.data === 'wasmRecompiled') {
            location.reload()
        } else if (message.data === 'entrypointRecooked') {
            location.reload()
        }
    })
}