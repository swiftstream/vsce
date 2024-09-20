import { WasmFs } from '@wasmer/wasmfs'

// Instantiate a new WASI Instance
const wasmFs = new WasmFs()

export function overrideFS(devSocket) {
    // Output stdout and stderr to console
    const originalWriteSync = wasmFs.fs.writeSync
    wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
        const text = new TextDecoder("utf-8").decode(buffer)
        if (text !== "\\n") {
            switch (fd) {
            case 1:
                console.log(text)
                break
            case 2:
                if (process.env.NODE_ENV === 'development' && devSocket) {
                    console.error(text)
                    const prevLimit = Error.stackTraceLimit
                    Error.stackTraceLimit = 1000
                    devSocket.send(
                        JSON.stringify({
                            kind: "stackTrace",
                            stackTrace: new Error().stack
                        })
                    )
                    Error.stackTraceLimit = prevLimit
                } else {
                    console.error(text)
                }
                break
            }
        }
        return originalWriteSync(fd, buffer, offset, length, position)
    }
}