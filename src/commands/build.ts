import * as fs from 'fs'
import { projectDirectory, webber } from "../extension"
import { buildDevPath, buildProdPath, clearStatus, LogLevel, print, status, StatusType, webSourcesPath } from "../webber"
import { window } from 'vscode'
import { WebpackMode } from '../webpack'
import { isString } from '../helpers/isString'
import { TimeMeasure } from '../helpers/timeMeasureHelper'

export async function buildCommand() {
	if (!webber) return
	function buildStatus(text: string) {
		status('sync~spin', text, StatusType.Default)
	}
	try {
		print(`Started building debug`, LogLevel.Detailed)
		const measure = new TimeMeasure()
		
		// STEP 1: check if .build/.wasi exists
		if (!buildStepIfBuildWasiExists()) {
			print(`Swift dependencies never been resolved, let's do it`, LogLevel.Detailed)
			print(`🔦 Resolving Swift dependencies`)
			buildStatus(`Resolving Swift dependencies`)
			await buildStepResolveSwiftPackages()
		}
		if (!buildStepIfJavaScriptKitCheckedout() || !buildStepIfWebCheckedout()) {
			print(`JavaScriptKit and/or web packages not found in checkouts, let's try to resolve one more time`, LogLevel.Detailed)
			print(`🔦 Resolving Swift packages (2nd attempt)`)
			buildStatus(`Resolving Swift packages (2nd attempt)`)
			await buildStepResolveSwiftPackages()
		}
		let existsJS = buildStepIfJavaScriptKitCheckedout()
		let existsWeb = buildStepIfWebCheckedout()
		if (!existsJS || !existsWeb) {
			clearStatus()
			var text = `Unable to fetch swift packages`
			if (existsJS || existsWeb) {
				if (existsJS) {
					text = 'Missing `web` package'
				} else {
					text = 'Missing `JavaScriptKit` package'
					print(`🙆‍♂️ ${text}`)
					await window.showErrorMessage(text, 'Retry', 'Cancel')
				}
			} else {
				const result = await window.showErrorMessage(text, 'Retry', 'Cancel')
				if (result == 'Retry') {
					print(`Going to retry debug build command`, LogLevel.Detailed)
					buildCommand()
				}
			}
			return
		}
		print(`Going to retrieve swift targets`, LogLevel.Detailed)
		const targets = await buildStepRetrieveExecutableTargets()
		print(`Retrieved targets: [${targets.join(', ')}]`, LogLevel.Detailed)
		if (targets.length == 0)
			throw `No targets to build`
		for (let i = 0; i < targets.length; i++) {
			const targetName = targets[i]
			print(`🧱 Building Swift target: ${targetName}`)
			await buildStepBuildSwiftTarget({ targetName: targetName, release: false })
			// STEP: copy .wasm file
			// STEP: copy resources
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

function buildStepIfBuildWasiExists(): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.wasi`)
	print(`./.build/.wasi ${value ? 'exists' : 'not exists'}`, LogLevel.Verbose)
	return value
}
async function buildStepResolveSwiftPackages() {
	if (!webber) { throw `webber is null` }
	await webber.swift.packageResolve()
}
function buildStepIfJavaScriptKitCheckedout(): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.wasi/checkouts/JavaScriptKit/Package.swift`)
	print(`./.build/.wasi/checkouts/JavaScriptKit ${value ? 'exists' : 'not exists'}`, LogLevel.Verbose)
	return value
}
function buildStepIfWebCheckedout(): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.wasi/checkouts/web/Package.swift`)
	print(`./.build/.wasi/checkouts/web ${value ? 'exists' : 'not exists'}`, LogLevel.Verbose)
	return value
}
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
async function buildStepRetrieveExecutableTargets(): Promise<string[]> {
	if (!webber) { throw `webber is null` }
	return await webber.swift.getExecutableTargets()
}
async function buildStepBuildSwiftTarget(options: { targetName: string, release: boolean }) {
	if (!webber) { throw `webber is null` }
	const dateStart = new Date()
	print(`started building \`${options.targetName}\` target in \`${options.release ? 'release' : 'debug'}\` mode`, LogLevel.Verbose)
	await webber.swift.build({
		targetName: options.targetName,
		release: options.release,
		tripleWasm: true
	})
	const dateEnd = new Date()
	const time = dateEnd.getTime() - dateStart.getTime()
	print(`finished building \`${options.targetName}\` target in ${time}ms`, LogLevel.Verbose)
}