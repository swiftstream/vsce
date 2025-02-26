import { doesPackageCheckedOut, KnownPackage } from '../../../../commands/build/helpers'

export async function checkRequiredDependencies() {
    var result: { missing: string[] } = { missing: [] }
    if (!doesPackageCheckedOut(KnownPackage.JavaScriptKit))
        result.missing.push('JavaScriptKit')
    if (!doesPackageCheckedOut(KnownPackage.Web))
        result.missing.push('web')
    return result
}