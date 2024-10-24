import * as fs from 'fs'
import { projectDirectory, webber } from "../../extension"
import { buildStatus, LogLevel, print, webSourcesPath } from '../../webber'
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified } from '../../helpers/filesHelper'
import { doesJavaScriptKitCheckedOut } from './helpers'
import { SwiftBuildType } from '../../swift'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function buildJavaScriptKit(options: { force: boolean }) {
    if (!webber) throw `webber is null`
    const jsKitPath = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/checkouts/JavaScriptKit`
    var packageWasModified = false
    var packageWasCompiled = doesJavaScriptKitCompiled(jsKitPath)
    const measure = new TimeMeasure()
    const doesPackageModulesPresent = () => fs.existsSync(`${jsKitPath}/node_modules`)
    if (doesJavaScriptKitCheckedOut(SwiftBuildType.Wasi)) {
        packageWasModified = wasFileModified({
            path: `${jsKitPath}/package.json`,
            lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.JavaScriptKitPackage)
        })
    }
    if (!options.force && packageWasCompiled && !packageWasModified) {
        print(`🫖 Skipping JavaScriptKit build since it is been compiled in past`, LogLevel.Detailed)
        return
    }
    if (!packageWasCompiled || !doesPackageModulesPresent()) {
        print(`🫖 Building JavaScriptKit for the first time`, LogLevel.Detailed)
    } else if (packageWasModified) {
        print(`🫖 Rebuilding JavaScriptKit since it's been updated`, LogLevel.Detailed)
    } else {
        print(`🫖 Building JavaScriptKit`, LogLevel.Detailed)
    }
    buildStatus(`Building JavaScriptKit`)
    if (!doesPackageModulesPresent()) {
		print(`Building JavaScriptKit: npm install`, LogLevel.Verbose)
		buildStatus('Building JavaScriptKit: npm install')
		await webber.npmJSKit.install()
		if (!doesPackageModulesPresent())
			throw `JavaScriptKit: npm install failed`
		print(`Building JavaScriptKit: npm run build`, LogLevel.Verbose)
		buildStatus('Building JavaScriptKit: npm run build')
        await webber.npmJSKit.run(['build'])
		if (!doesJavaScriptKitCompiled(jsKitPath)) {
			print(`Building JavaScriptKit: npm run build (2nd attempt)`, LogLevel.Verbose)
			await webber.npmJSKit.run(['build'])
		}
	} else {
		print(`Building JavaScriptKit: checking versions`, LogLevel.Verbose)
		const projectPackageLockPath = `${projectDirectory}/${webSourcesPath}/package-lock.json`
		const jsKitPackagePath = `${jsKitPath}/package.json`
		if (fs.existsSync(projectPackageLockPath)) {
			const versions = readVersions({ projectLock: projectPackageLockPath, jsKitPackage: jsKitPackagePath })
			if (versions.locked != versions.current) {
				print(`Updating JavaScriptKit v${versions.locked} to v${versions.current} via npm install in WebSources folder`, LogLevel.Verbose)
				buildStatus('Updating JavaScriptKit in web sources')
				await webber.npmWeb.install()
                const versionsAfterInstall = readVersions({ projectLock: projectPackageLockPath, jsKitPackage: jsKitPackagePath })
                if (versionsAfterInstall.locked != versionsAfterInstall.current) {
                    print(`JavaScriptKit installed version mismatch: v${versionsAfterInstall.locked} != ${versionsAfterInstall.current}`, LogLevel.Detailed)
                    throw `JavaScriptKit installed version mismatch ${versionsAfterInstall.locked} != ${versionsAfterInstall.current}`
                }
			} else {
                print(`JavaScriptKit v${versions.locked} is up to date in WebSources folder`, LogLevel.Verbose)
            }
		} else {
            print(`Skipping JavaScriptKit versions check since WebSources never been built`, LogLevel.Verbose)
        }
	}
    saveLastModifiedDateForKey(LastModifiedDateType.JavaScriptKitPackage)
    measure.finish()
    print(`🫖 Built JavaScriptKit in ${measure.time}ms`, LogLevel.Detailed)
}
function doesJavaScriptKitCompiled(jsKitPath: string): boolean {
	const value = fs.existsSync(`${jsKitPath}/Runtime/lib/index.d.ts`)
	print(`JavaScriptKit ${value ? 'compiled' : 'not compiled'}`, LogLevel.Unbearable)
	return value
}
function readVersions(options: { projectLock: string, jsKitPackage: string }): { current: string, locked: string } {
    const packageLockContent: string = fs.readFileSync(options.projectLock, 'utf8')
    const jsKitPackageContent: string = fs.readFileSync(options.jsKitPackage, 'utf8')
    const packageLock = JSON.parse(packageLockContent)
    const jsKitPackage = JSON.parse(jsKitPackageContent)
    const lockedPackages: any = packageLock.packages
    const lockedKeys = Object.keys(lockedPackages).filter((x) => x.endsWith('/JavaScriptKit'))
    if (lockedKeys.length != 1)
        throw `JavaScriptKit package not installed in WebSources folder`
    const result = {
        current: jsKitPackage.version,
        locked: lockedPackages[lockedKeys[0]].version
    }
    print(`JavaScriptKit: current v${result.current} locked v${result.locked}`, LogLevel.Unbearable)
    return result
}