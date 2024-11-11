import { buildStatus } from "../../webber"

export interface AwaitGzippingParams {
	gzippedTargets: string[],
	targetsToRebuild: string[],
	gzipFail: () => any | undefined
}

export function shouldAwaitGzipping(params: AwaitGzippingParams): boolean {
    return params.gzippedTargets.length != params.targetsToRebuild.length
}

export async function awaitGzipping(params: AwaitGzippingParams) {
	if (!shouldAwaitGzipping(params)) return
    buildStatus(`Await Gzipping`)
    await new Promise<void>((resolve, reject) => {
        function wait() {
            if (params.gzippedTargets.length == params.targetsToRebuild.length) {
                return resolve()
            }
            const gzipFail = params.gzipFail()
            if (gzipFail) {
                reject(gzipFail)
            } else {
                setTimeout(wait, 100)
            }
        }
        wait()
    })
}