export function wasiErrorHandler(e) {
    console.error(e)
    if (e instanceof WebAssembly.RuntimeError) {
        console.log(e.stack)
    }
}