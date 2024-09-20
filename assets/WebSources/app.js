import { devSocket } from './wasi/devSocket.js'
import { overrideFS } from './wasi/overrideFS.js'
import { startWasiTask } from './wasi/startTask.js'
import { wasiErrorHandler } from './wasi/errorHandler.js'

overrideFS(devSocket)

try {
    startWasiTask(env.app.target, false).catch(wasiErrorHandler)
} catch (e) {
    wasiErrorHandler(e)
}