import * as fs from 'fs'
import { projectDirectory, webber } from "../extension"
import { buildDevPath, buildProdPath, clearStatus, LogLevel, print, status, StatusType, webSourcesPath } from "../webber"
import { window } from 'vscode'
import { WebpackMode } from '../webpack'
import { isString } from '../helpers/isString'
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { resolveSwiftDependencies } from './build/resolveSwiftDependencies'
import { allSwiftBuildTypes } from '../swift'
import { checkRequiredDependencies } from './build/requiredDependencies'
import { retrieveExecutableTargets } from './build/helpers'
import { buildExecutableTarget } from './build/buildExecutableTargets'

export async function buildCommand() {
	if (!webber) return
	function buildStatus(text: string) {
		status('sync~spin', text, StatusType.Default)
	}
	try {
		print(`Started building debug`, LogLevel.Detailed)
		const measure = new TimeMeasure()
		// Phase 1: Resolve Swift dependencies for each build type
		for (const type of allSwiftBuildTypes()) {
			print(`🔦 Resolving Swift dependencies`)
			buildStatus(`Resolving dependencies`)
			await resolveSwiftDependencies({
				type: type,
				force: true,
				substatus: (t) => {
					buildStatus(`Resolving dependencies (${type}): ${t}`)
					print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Detailed)
				}
			})
		}
		// Phase 2: Check if required Swift dependencies present
		const requiredDependencies = await checkRequiredDependencies()
		if (requiredDependencies.missing.length > 0) {
			clearStatus()
			const text = `Missing ${requiredDependencies.missing.map((x) => `\`${x}\``).join(', ')} package${requiredDependencies.missing.length > 1 ? 's' : ''}`
			print(`🙆‍♂️ ${text}`)
			const result = await window.showErrorMessage(text, 'Retry', 'Cancel')
			if (result == 'Retry') {
				print(`Going to retry debug build command`, LogLevel.Detailed)
				buildCommand()
			}
			return
		}
		// Phase 3: Retrieve executable Swift targets
		print(`Going to retrieve swift targets`, LogLevel.Detailed)
		const targets = await retrieveExecutableTargets()
		print(`Retrieved targets: [${targets.join(', ')}]`, LogLevel.Detailed)
		if (targets.length == 0)
			throw `No targets to build`
		// Phase 4: Build executable targets
		for (const target in targets) {
			for (const type of allSwiftBuildTypes()) {
				print(`🧱 Building \`${target}\` Swift target`)
				buildStatus(`\`${target}\` Swift target: building`)
				await buildExecutableTarget({
					type: type,
					target: target,
					release: false,
					force: true,
					substatus: (t) => {
						buildStatus(`\`${target}\` Swift target: ${t}`)
					}
				})	
			}
		}
		if (!buildStepIfJavaScriptKitTSCompiled()) {
			print(`🧱 Building JavaScriptKit`)
			buildStatus(`Building js-kit`)
			await buildStepJavaScriptKitCompileTS({
				substatus: (t) => { buildStatus(`Building js-kit: (${t})`) },
				release: false
			})
		}
		if (!buildStepIfWebSourcesCompiled()) {
			print(`${webSourcesPath}: initial npm install`, LogLevel.Verbose)
			buildStatus('websrc: npm install')
			await webber.npmWeb.install()
		}
		for (let i = 0; i < targets.length; i++) {
			const targetName = targets[i]
			print(`🧱 Building ${targetName} web target`)
			buildStatus(`Building web sources`)
			await webber.webpack.build(WebpackMode.Development, targetName, false, `../${buildDevPath}`)
			if (!buildStepIfWebSourcesBundleCompiled({ target: targetName, release: false })) {
				print(`🧱 Building ${targetName} web target (2nd attempt)`)
				buildStatus(`Building web sources (2nd attempt)`)
				await webber.webpack.build(WebpackMode.Development, targetName, false, `../${buildDevPath}`)
			}
			if (!buildStepIfWebSourcesBundleCompiled({ target: targetName, release: false }))
				throw `${targetName} web target build failed`
		}
		// STEP: compile SCSS (or maybe with webpack instead of sass)
		measure.finish()
		status('check', `Build Succeeded in ${measure.time}ms`, StatusType.Default)
		setTimeout(() => {
			clearStatus()
		}, 4000)
		print(`✅ Build Succeeded in ${measure.time}ms`)
		console.log(`Build Succeeded in ${measure.time}ms`)
	} catch (error: any) {
		var text = ''
		if (isString(error)) {
			text = error
			print(`❌ ${text}`)
		} else {
			text = `Something went wrong during the build`
			print(`❌ ${text}: ${error}`)
			console.error(error)
		}
		status('error', text, StatusType.Error)
		setTimeout(() => {
			clearStatus()
		}, 5000)
	}
}

// MARK: Helpers

function buildStepIfJavaScriptKitTSCompiled(): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.wasi/checkouts/JavaScriptKit/Runtime/lib/index.d.ts`)
	print(`java-script-kit ${value ? 'compiled' : 'not compiled'}`, LogLevel.Verbose)
	return value
}
function buildStepIfWebSourcesCompiled(): boolean {
	const value = fs.existsSync(`${projectDirectory}/${webSourcesPath}/node_modules`)
	print(`${webSourcesPath}: node_modules ${value ? 'installed' : 'not installed'}`, LogLevel.Verbose)
	return value
}
function buildStepIfWebSourcesBundleCompiled(options: { target: string, release: boolean }): boolean {
	const value = fs.existsSync(`${projectDirectory}/${options.release ? buildProdPath : buildDevPath}/${options.target.toLowerCase()}.js`)
	print(`${options.target} target bundle ${value ? 'compiled' : 'not compiled'}`, LogLevel.Verbose)
	return value
}
async function buildStepJavaScriptKitCompileTS(options: { substatus: (text: string) => void, release: boolean }) {
	if (!webber) { throw `webber is null` }
	const jsKitPath = `${projectDirectory}/.build/.wasi/checkouts/JavaScriptKit`
	const jsKitNodeModulesPath = `${jsKitPath}/node_modules`
	if (!fs.existsSync(jsKitNodeModulesPath)) {
		print(`java-script-kit: npm install`, LogLevel.Verbose)
		options.substatus('js-kit: npm install')
		await webber.npmJSKit.install()
		if (!fs.existsSync(jsKitNodeModulesPath))
			throw `js-kit: npm install failed`
		print(`java-script-kit: npm run build`, LogLevel.Verbose)
		options.substatus('js-kit: npm run build')
		await webber.npmJSKit.run(['build'])
		if (!buildStepIfJavaScriptKitTSCompiled()) {
			print(`java-script-kit: npm run build (2nd attempt)`, LogLevel.Verbose)
			await webber.npmJSKit.run(['build'])
		}
	} else {
		print(`java-script-kit: checking versions`, LogLevel.Verbose)
		const packageLockPath = `${projectDirectory}/${webSourcesPath}/package-lock.json`
		const jsKitPackagePath = `${jsKitPath}/package.json`
		function readVersions(): { current: string, locked: string } {
			const packageLockContent: string = fs.readFileSync(packageLockPath, 'utf8')
			const jsKitPackageContent: string = fs.readFileSync(jsKitPackagePath, 'utf8')
			const packageLock = JSON.parse(packageLockContent)
			const jsKitPackage = JSON.parse(jsKitPackageContent)
			const lockedPackages: any = packageLock.packages
			const lockedKeys = Object.keys(lockedPackages).filter((x) => x.endsWith('/JavaScriptKit'))
			if (lockedKeys.length != 1)
				throw `js-kit: package not installed`
			const result = {
				current: jsKitPackage.version,
				locked: lockedPackages[lockedKeys[0]].version
			}
			print(`java-script-kit: current v${result.current} locked v${result.locked}`, LogLevel.Verbose)
			return result
		}
		if (fs.existsSync(packageLockPath)) {
			const versions = readVersions()
			if (versions.locked != versions.current) {
				print(`${webSourcesPath}: updating v${versions.locked} to v${versions.current} via npm install`, LogLevel.Verbose)
				options.substatus('websrc: npm install')
				await webber.npmWeb.install()
			}
		} else {
			if (!buildStepIfWebSourcesCompiled()) {
				print(`${webSourcesPath}: initial npm install`, LogLevel.Verbose)
				options.substatus('websrc: npm install')
				await webber.npmWeb.install()
			}
		}
		const versionsAfterInstall = readVersions()
		if (versionsAfterInstall.locked != versionsAfterInstall.current)
			throw `js-kit versions mismatch ${versionsAfterInstall.locked} != ${versionsAfterInstall.current}`
	}
}