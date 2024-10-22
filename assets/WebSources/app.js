import { WasmFs } from '@wasmer/wasmfs'
import { WASI } from '@wasmer/wasi'
import { devSocket } from './wasi/devSocket.js'
import { overrideFS } from './wasi/overrideFS.js'
import { startWasiTask } from './wasi/startTask.js'
import { wasiErrorHandler } from './wasi/errorHandler.js'

const env = _SwiftStreamEnv_

const wasmFs = new WasmFs()
const wasi = new WASI({
    args: [],
    env: env,
    bindings: {
        ...WASI.defaultBindings,
        fs: wasmFs.fs
    }
})

overrideFS(wasmFs, devSocket)

try {
    startWasiTask(wasi, env.target, false).catch(wasiErrorHandler)
} catch (e) {
    wasiErrorHandler(e)
}