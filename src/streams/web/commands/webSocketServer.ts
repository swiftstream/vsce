import { WebSocketServer } from 'ws'
import { ExtensionStream, extensionStream } from '../../../extension'
import { isHotReloadEnabled } from '../webStream'

let wss: WebSocketServer | undefined

function broadcast(data: any) {
    wss?.clients.forEach((x) => x.send(JSON.stringify(data)))
}

export function startWebSocketServer() {
    wss = extensionStream == ExtensionStream.Web ? new WebSocketServer({ port: 3050 }) : undefined
    if (!wss) return
    if (extensionStream != ExtensionStream.Web) return
    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            console.log('🌎 ws received: %s', message)
        })
    })
}

enum WSEvent {
    BuildStarted = 'buildStarted',
    BuildProgress = 'buildProgress',
    BuildError = 'buildError',
    BuildAborted = 'BuildAborted',
    HotReload = 'hotReload'
}

export function wsSendBuildStarted(isHot: boolean) {
    if (!isHotReloadEnabled) return
    broadcast({ type: WSEvent.BuildStarted, isHot: isHot })
}

export function wsSendBuildProgress(progress: number) {
    if (!isHotReloadEnabled) return
    broadcast({ type: WSEvent.BuildProgress, progress: progress })
}

export function wsSendBuildError(error: any) {
    if (!isHotReloadEnabled) return
    broadcast({ type: WSEvent.BuildError, error: error })
}

export function wsSendBuildAborted() {
    if (!isHotReloadEnabled) return
    broadcast({ type: WSEvent.BuildAborted })
}

export function wsSendHotReload() {
    if (!isHotReloadEnabled) return
    broadcast({ type: WSEvent.HotReload })
}