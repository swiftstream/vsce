const env = _SwiftStreamEnv_

export function overrideFS(wasmFs, devSocket) {
    // Output stdout and stderr to console
    const originalWriteSync = wasmFs.fs.writeSync
    wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
        const text = new TextDecoder('utf-8').decode(buffer)
        if (text !== "\\n") {
            switch (fd) {
            case 1:
                console.log(text)
                break
            case 2:
                if (env.isDevelopment && devSocket) {
                    console.error(text)
                    const prevLimit = Error.stackTraceLimit
                    Error.stackTraceLimit = 1000
                    devSocket.send(
                        JSON.stringify({
                            kind: 'stackTrace',
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