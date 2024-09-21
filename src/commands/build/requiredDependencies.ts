import { SwiftBuildType } from "../../swift"
import { doesJavaScriptKitCheckedOut, doesWebCheckedOut } from "./helpers"

export async function checkRequiredDependencies() {
        var result: { missing: string[] } = { missing: [] }
        if (!doesJavaScriptKitCheckedOut(SwiftBuildType.Wasi))
            result.missing.push('JavaScriptKit')
        if (!doesWebCheckedOut(SwiftBuildType.Wasi))
            result.missing.push('web')
        return result
}