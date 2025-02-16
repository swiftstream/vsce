import { buildStatus } from "../../webber"

export interface AwaitBrotlingParams {
    brotledTargets: string[],
	targetsToRebuild: string[],
	brotliFail: () => any | undefined
}

export function shouldAwaitBrotling(params: AwaitBrotlingParams): boolean {
    return params.brotledTargets.length != params.targetsToRebuild.length
}

export async function awaitBrotling(params: AwaitBrotlingParams) {
	if (!shouldAwaitBrotling(params)) return
    buildStatus(`Await Brotling`)
    await new Promise<void>((resolve, reject) => {
        function wait() {
            if (params.brotledTargets.length == params.targetsToRebuild.length) {
                return resolve()
            }
            const brotliFail = params.brotliFail()
            if (brotliFail) {
                reject(brotliFail)
            } else {
                setTimeout(wait, 100)
            }
        }
        wait()
    })
}