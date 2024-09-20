import { SwiftRuntime } from 'javascript-kit-swift'
import { WASI } from '@wasmer/wasi'

const swift = new SwiftRuntime()

const wasi = new WASI({
    args: [],
    env: {},
    bindings: {
        ...WASI.defaultBindings,
        fs: wasmFs.fs
    }
})

export const startWasiTask = async (target, isService) => {
    const fetchPromise = fetch(`/${target}.wasm`)

    // Fetch our Wasm File
    const response = await fetchPromise

    const reader = response.body.getReader()

    // Step 2: get total length
    const contentLength = +response.headers.get('Content-Length')

    if (!isService) {
        if (response.status == 304) {
            new Event('WASMLoadedFromCache')
        } else if (response.status == 200) {
            if (contentLength > 0) {
                document.dispatchEvent(new Event('WASMLoadingStarted'))
                document.dispatchEvent(new CustomEvent('WASMLoadingProgress', { detail: 0 }))
            } else {
                document.dispatchEvent(new Event('WASMLoadingStartedWithoutProgress'))
            }
        } else {
            document.dispatchEvent(new Event('WASMLoadingError'))
        }
    }
    // Step 3: read the data
    let receivedLength = 0
    let chunks = []
    while(true) {
        const {done, value} = await reader.read()
        if (done) break
        chunks.push(value)
        receivedLength += value.length
        if (!isService) {
            if (contentLength > 0) {
                document.dispatchEvent(new CustomEvent('WASMLoadingProgress', { detail: Math.trunc(receivedLength / (contentLength / 100)) }))
            }
        }
    }

    // Step 4: concatenate chunks into single Uint8Array
    let chunksAll = new Uint8Array(receivedLength)
    let position = 0
    for (let chunk of chunks) {
        chunksAll.set(chunk, position)
        position += chunk.length
    }

    // Instantiate the WebAssembly file
    const wasmBytes = chunksAll.buffer
    
    const patchWASI = function (wasiObject) {
        // PATCH: @wasmer-js/wasi@0.x forgets to call `refreshMemory` in `clock_res_get`,
        // which writes its result to memory view. Without the refresh the memory view,
        // it accesses a detached array buffer if the memory is grown by malloc.
        // But they wasmer team discarded the 0.x codebase at all and replaced it with
        // a new implementation written in Rust. The new version 1.x is really unstable
        // and not production-ready as far as katei investigated in Apr 2022.
        // So override the broken implementation of `clock_res_get` here instead of
        // fixing the wasi polyfill.
        // Reference: https://github.com/wasmerio/wasmer-js/blob/55fa8c17c56348c312a8bd23c69054b1aa633891/packages/wasi/src/index.ts#L557
        const original_clock_res_get = wasiObject.wasiImport["clock_res_get"]
        
        wasiObject.wasiImport["clock_res_get"] = (clockId, resolution) => {
            wasiObject.refreshMemory()
            return original_clock_res_get(clockId, resolution)
        }
        return wasiObject.wasiImport
    }
    
    var wasmImports = {}
    wasmImports.wasi_snapshot_preview1 = patchWASI(wasi)
    wasmImports.javascript_kit = swift.wasmImports
    wasmImports.__stack_sanitizer = {
        report_stack_overflow: () => {
            throw new Error("Detected stack buffer overflow.")
        }
    }

    const module = await WebAssembly.instantiate(wasmBytes, wasmImports)

    // Node support
    const instance = "instance" in module ? module.instance : module
    
    if (swift && instance.exports.swjs_library_version) {
        swift.setInstance(instance)
    }
    
    // Start the WebAssembly WASI instance
    wasi.start(instance)
    
    // Initialize and start Reactor
    if (instance.exports._initialize) {
        instance.exports._initialize()
        console.dir(instance.exports)
        instance.exports.__main_argc_argv()
        //instance.exports.main()
    }
}