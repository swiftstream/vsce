import * as fs from 'fs'
import { projectDirectory, sidebarTreeView, webber } from "../extension"
import { appTargetName, buildStatus, clearStatus, isAnyHotBuilding, isBuilding, isHotBuildingCSS, isHotBuildingHTML, isHotBuildingJS, isHotBuildingSwift, LogLevel, print, serviceWorkerTargetName, setBuilding, setHotBuildingCSS, setHotBuildingHTML, setHotBuildingJS, setHotBuildingSwift, setRecompilingApp, setRecompilingService, status, StatusType } from "../webber"
import { window } from 'vscode'
import { isString } from '../helpers/isString'
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { resolveSwiftDependencies } from './build/resolveSwiftDependencies'
import { allSwiftBuildTypes, createSymlinkFoldersIfNeeded, Index, SwiftBuildType, SwiftTargets } from '../swift'
import { checkRequiredDependencies } from './build/requiredDependencies'
import { buildExecutableTarget } from './build/buildExecutableTargets'
import { buildJavaScriptKit } from './build/buildJavaScriptKit'
import { buildWebSourcesForAllTargets } from './build/buildWebSources'
import { proceedServiceWorkerManifest } from './build/proceedServiceWorkerManifest'
import { proceedBundledResources } from "./build/proceedBundledResources"
import { proceedCSS } from "./build/proceedCSS"
import { proceedHTML } from "./build/proceedHTML"
import { proceedIndex } from "./build/proceedIndex"
import { proceedWasmFile } from "./build/proceedWasmFile"
import { awaitGzipping, shouldAwaitGzipping } from "./build/awaitGzipping"
import { wsSendBuildError, wsSendBuildProgress, wsSendBuildStarted, wsSendHotReload } from "./webSocketServer"
import { listOfAdditionalJSFiles, proceedAdditionalJS } from "./build/proceedAdditionalJS"

export let cachedSwiftTargets: SwiftTargets | undefined
let cachedIsPWA: boolean | undefined

export async function buildCommand() {
	if (!webber) return
	if (isBuilding || isAnyHotBuilding()) { return }
	setBuilding(true)
	sidebarTreeView?.refresh()
	wsSendBuildStarted(false)
	const measure = new TimeMeasure()
	var gzipFail: any | undefined
	try {
		print(`🏗️ Started building debug`, LogLevel.Normal, true)
		print(`💁‍♂️ it will try to build each phase`, LogLevel.Detailed)
		wsSendBuildProgress(1)
		// Phase 1: Resolve Swift dependencies for each build type
		print('🔳 Phase 1: Resolve Swift dependencies for each build type', LogLevel.Verbose)
		const buildTypes = allSwiftBuildTypes()
		createSymlinkFoldersIfNeeded()
		for (let i = 0; i < buildTypes.length; i++) {
			const type = buildTypes[i]
			await resolveSwiftDependencies({
				type: type,
				force: true,
				substatus: (t) => {
					buildStatus(`Resolving dependencies (${type}): ${t}`)
					print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Verbose)
				}
			})
		}
		wsSendBuildProgress(10)
		// Phase 2: Check if required Swift dependencies present
		print('🔳 Phase 2: Check if required Swift dependencies present', LogLevel.Verbose)
		const requiredDependencies = await checkRequiredDependencies()
		if (requiredDependencies.missing.length > 0) {
			measure.finish()
			setBuilding(false)
			sidebarTreeView?.refresh()
			const text = `Missing ${requiredDependencies.missing.map((x) => `\`${x}\``).join(', ')} package${requiredDependencies.missing.length > 1 ? 's' : ''}`
			const error = `Debug Build Failed: ${text}`
			wsSendBuildError(`${error}`)
			status('error', `${text} (${measure.time}ms)`, StatusType.Error)
			print(`🙆‍♂️ ${text}`)
			const result = await window.showErrorMessage(text, 'Retry', 'Cancel')
			if (result == 'Retry') {
				print(`Going to retry debug build command`, LogLevel.Verbose)
				buildCommand()
			}
			return
		}
		wsSendBuildProgress(15)
		// Phase 3: Retrieve Swift targets
		print('🔳 Phase 3: Retrieve Swift targets', LogLevel.Verbose)
		const targetsDump = await webber.swift.getTargets()
		cachedSwiftTargets = targetsDump
		if (targetsDump.executables.length == 0)
			throw `No targets to build`
		const isPWA = targetsDump.serviceWorkers.length > 0
		cachedIsPWA = isPWA
		if (isPWA) {
			print(`It is PWA since ServiceWorker related targets found`, LogLevel.Verbose)
		} else {
			print(`It's not PWA since ServiceWorker related targets not found`, LogLevel.Verbose)
		}
		wsSendBuildProgress(20)
		// Phase 4: Check that App target name present
		print('🔳 Phase 4: Check that App target name present', LogLevel.Verbose)
		if (!targetsDump.executables.includes(appTargetName))
			throw `${appTargetName} is missing in the Package.swift`
		if (isPWA && !targetsDump.serviceWorkers.includes(serviceWorkerTargetName))
			throw `${serviceWorkerTargetName} is missing in the Package.swift`
		wsSendBuildProgress(25)
		// Phase 5: Build executable targets
		print('🔳 Phase 5: Build executable targets', LogLevel.Verbose)
		let gzippedExecutableTargets: string[] = []
		for (let n = 0; n < buildTypes.length; n++) {
			const type = buildTypes[n]
			for (let i = 0; i < targetsDump.executables.length; i++) {
				const target = targetsDump.executables[i]
				await buildExecutableTarget({
					type: type,
					target: target,
					release: false,
					force: true
				})
				if (type == SwiftBuildType.Wasi) {
					// Phase 5.1: Proceed WASM file
					print('🔳 Phase 5.1: Proceed WASM file', LogLevel.Verbose)
					await proceedWasmFile({ target: target, release: false, gzipSuccess: () => {
						gzippedExecutableTargets.push(target)
					}, gzipFail: (reason) => {
						gzipFail = reason
					}})
				}
			}
		}
		wsSendBuildProgress(50)
		// Phase 6: Build JavaScriptKit TypeScript sources
		print('🔳 Phase 6: Build JavaScriptKit TypeScript sources', LogLevel.Verbose)
		await buildJavaScriptKit({
			force: true
		})
		wsSendBuildProgress(60)
		// Phase 7: Build all the web sources
		print('🔳 Phase 7: Build all the web sources', LogLevel.Verbose)
		await buildWebSourcesForAllTargets({
			targets: targetsDump.executables,
			release: false,
			force: true,
			parallel: false
		})
		wsSendBuildProgress(65)
		// Phase 8: Retrieve manifest from the Service target
		print('🔳 Phase 8: Retrieve manifest from the Service target', LogLevel.Verbose)
		const manifest = await proceedServiceWorkerManifest({ isPWA: isPWA, release: false })
		wsSendBuildProgress(70)
		// Phase 9: Retrieve index from the App target
		print('🔳 Phase 9: Retrieve index from the App target', LogLevel.Verbose)
		const index = await proceedIndex({ target: appTargetName, release: false })
		wsSendBuildProgress(75)
		// Phase 10: Copy bundled resources from Swift build folder
		print('🔳 Phase 10: Copy bundled resources from Swift build folder', LogLevel.Verbose)
		proceedBundledResources({ release: false })
		wsSendBuildProgress(80)
		// Phase 11: Compile SCSS
		print('🔳 Phase 11: Compile SCSS', LogLevel.Verbose)
		await proceedCSS({ force: true, release: false })
		wsSendBuildProgress(85)
		// Phase 12: Proceed HTML
		print('🔳 Phase 12: Proceed HTML', LogLevel.Verbose)
		await proceedHTML({ appTargetName: appTargetName, manifest: manifest, index: index, release: false })
		wsSendBuildProgress(90)
		// Phase 13: Process additional JS
		print('🔳 Phase 13: Process additional JS', LogLevel.Verbose)
		proceedAdditionalJS({ release: false, executableTargets: targetsDump.executables })
		wsSendBuildProgress(95)
		// Phase 14: Await Gzipping
		const awaitGzippingParams = { gzippedTargets: gzippedExecutableTargets, targetsToRebuild: targetsDump.executables, gzipFail: () => gzipFail }
		if (shouldAwaitGzipping(awaitGzippingParams)) {
			print('⏳ Phase 14: Await gzipping', LogLevel.Detailed)
			await awaitGzipping(awaitGzippingParams)
		}
		measure.finish()
		wsSendBuildProgress(100)
		status('check', `Build Succeeded in ${measure.time}ms`, StatusType.Success)
		print(`✅ Build Succeeded in ${measure.time}ms`)
		console.log(`Build Succeeded in ${measure.time}ms`)
		setBuilding(false)
		sidebarTreeView?.refresh()
		wsSendHotReload()
	} catch (error: any) {
		setBuilding(false)
		sidebarTreeView?.refresh()
		const text = `Debug Build Failed`
		if (isString(error)) {
			print(`🧯 ${error}`)
			wsSendBuildError(`${error}`)
		} else {
			const json = JSON.stringify(error)
			const errorText = `${json === '{}' ? error : json}`
			print(`🧯 ${text}: ${errorText}`)
			wsSendBuildError(`${errorText}`)
			console.error(error)
		}
		status('error', `${text} (${measure.time}ms)`, StatusType.Error)
	}
}

// MARK: Hot Reload

interface HotRebuildSwiftParams {
	target?: string
}

let awaitingHotRebuildSwift: HotRebuildSwiftParams[] = []

export async function hotRebuildSwift(params: HotRebuildSwiftParams = {}) {
	if (!webber) return
	if (isBuilding || isHotBuildingHTML || isHotBuildingJS || isHotBuildingSwift) {
		if (!isBuilding) {
			if (awaitingHotRebuildSwift.filter((x) => x.target == params.target).length == 0) {
				print(`👉 Delay Swift hot rebuild call`, LogLevel.Verbose)
				awaitingHotRebuildSwift.push(params)
			}
		}
		return
	}
	setBuilding(true)
	setHotBuildingSwift(true)
	setRecompilingApp(params.target == appTargetName)
	setRecompilingService(params.target == serviceWorkerTargetName)
	sidebarTreeView?.refresh()
	wsSendBuildStarted(true)
	print('🔥 Hot Rebuilding Swift', LogLevel.Detailed)
	const measure = new TimeMeasure()
	var gzipFail: any | undefined
	try {
		// Retrieve Swift targets
		print('🔳 Retrieve Swift targets', LogLevel.Verbose)
		let targetsDump = cachedSwiftTargets
		if (!targetsDump) {
			targetsDump = await webber.swift.getTargets()
			cachedSwiftTargets = targetsDump
		}
		if (targetsDump.executables.length == 0)
			throw `No targets to build`
		const isPWA = targetsDump.serviceWorkers.length > 0
		cachedIsPWA = isPWA
		if (isPWA) {
			print(`It is PWA since ServiceWorker related targets found`, LogLevel.Verbose)
		} else {
			print(`It's not PWA since ServiceWorker related targets not found`, LogLevel.Verbose)
		}
		// Check that App target name present
		print('🔳 Check that App target name present', LogLevel.Verbose)
		if (!targetsDump.executables.includes(appTargetName))
			throw `${appTargetName} is missing in the Package.swift`
		if (isPWA && !targetsDump.serviceWorkers.includes(serviceWorkerTargetName))
			throw `${serviceWorkerTargetName} is missing in the Package.swift`
		// Build executable targets
		print('🔳 Build executable targets', LogLevel.Verbose)
		let gzippedExecutableTargets: string[] = []
		const targetsToRebuild = params.target ? [params.target] : targetsDump.executables
		const buildTypes = allSwiftBuildTypes()
		createSymlinkFoldersIfNeeded()
		// Check that all executable targets have already been built
		for (let n = 0; n < buildTypes.length; n++) {
			const buildType: SwiftBuildType = buildTypes[n]
			for (let i = 0; i < targetsToRebuild.length; i++) {
				const target = targetsToRebuild[i]
				if (buildType == SwiftBuildType.Native) {
					if (!fs.existsSync(`${projectDirectory}/.build/debug/${target}`)) {
						print('🙅‍♂️ Hot rebuilding aborted. Build the whole project at least once first.', LogLevel.Detailed)
						return
					}
				} else if (buildType == SwiftBuildType.Wasi) {
					if (!fs.existsSync(`${projectDirectory}/.build/.${buildType}/debug/${target}.wasm`)) {
						print('🙅‍♂️ Hot rebuilding aborted. Build the whole project at least once first.', LogLevel.Detailed)
						return
					}
				}
			}
		}
		await new Promise<void>((resolve, reject) => {
			let completedBuildTypes: SwiftBuildType[] = []
			for (let n = 0; n < buildTypes.length; n++) {
				const buildType: SwiftBuildType = buildTypes[n];
				(new Promise<SwiftBuildType>(async (resolve, reject) => {
					try {
						for (let i = 0; i < targetsToRebuild.length; i++) {
							const target = targetsToRebuild[i]
							await buildExecutableTarget({
								type: buildType,
								target: target,
								release: false,
								force: true
							})
							if (buildType == SwiftBuildType.Wasi) {
								// Proceed WASM file
								print('🔳 Proceed WASM file', LogLevel.Verbose)
								await proceedWasmFile({ target: target, release: false, gzipSuccess: () => {
									gzippedExecutableTargets.push(target)
								}, gzipFail: (reason) => {
									gzipFail = reason
								}})
							}
						}
						resolve(buildType)
					} catch (error) {
						reject(error)
					}
				})).then((buildType) => {
					completedBuildTypes.push(buildType)
					if (completedBuildTypes.length == buildTypes.length) {
						resolve()
					}
				}).catch(reject)
			}
		})
		// Retrieve manifest from the Service target
		print('🔳 Retrieve manifest from the Service target', LogLevel.Verbose)
		const manifest = await proceedServiceWorkerManifest({ isPWA: isPWA, release: false })
		// Retrieve index from the App target
		print('🔳 Retrieve index from the App target', LogLevel.Verbose)
		const index = await proceedIndex({ target: appTargetName, release: false })
		// Copy bundled resources from Swift build folder
		print('🔳 Copy bundled resources from Swift build folder', LogLevel.Verbose)
		proceedBundledResources({ release: false })
		try {
			await proceedHTML({ appTargetName: appTargetName, manifest: manifest, index: index, release: false })
		} catch (error) {
			print(`😳 Failed building HTML`)
		}
		// Process additional JS
		print('🔳 Process additional JS', LogLevel.Verbose)
		proceedAdditionalJS({ release: false, executableTargets: targetsDump.executables })
		const awaitGzippingParams = { gzippedTargets: gzippedExecutableTargets, targetsToRebuild: targetsToRebuild, gzipFail: () => gzipFail }
		if (shouldAwaitGzipping(awaitGzippingParams)) {
			print('⏳ Await gzipping', LogLevel.Detailed)
			await awaitGzipping(awaitGzippingParams)
		}
		measure.finish()
		status('flame', `Hot Rebuilt Swift in ${measure.time}ms`, StatusType.Success)
		print(`🔥 Hot Rebuilt Swift in ${measure.time}ms`)
		console.log(`Hot Rebuilt Swift in ${measure.time}ms`)
		setBuilding(false)
		setHotBuildingSwift(false)
		sidebarTreeView?.refresh()
		wsSendHotReload()
		const awaitingParams = awaitingHotRebuildSwift.pop()
		if (awaitingParams) {
			print(`👉 Passing to delayed Swift hot rebuild call`, LogLevel.Verbose)
			hotRebuildSwift(awaitingParams)
		}
	} catch (error) {
		awaitingHotRebuildSwift = []
		setBuilding(false)
		setHotBuildingSwift(false)
		sidebarTreeView?.refresh()
		const text = `Hot Rebuild Swift Failed`
		if (isString(error)) {
			print(`🧯 ${error}`)
			wsSendBuildError(`${error}`)
		} else {
			const json = JSON.stringify(error)
			const errorText = `${json === '{}' ? error : json}`
			print(`🧯 ${text}: ${errorText}`)
			wsSendBuildError(`${errorText}`)
			console.error(error)
		}
		status('error', `${text} (${measure.time}ms)`, StatusType.Error)
	}
}

let awaitingHotRebuildCSS = false

export async function hotRebuildCSS() {
	if (!webber) return
	if (isBuilding || isHotBuildingCSS) {
		if (!isBuilding) {
			print(`👉 Delay CSS hot rebuild call`, LogLevel.Verbose)
			awaitingHotRebuildCSS = true
		}
		return
	}
	setBuilding(true)
	setHotBuildingCSS(true)
	sidebarTreeView?.refresh()
	wsSendBuildStarted(true)
	const measure = new TimeMeasure()
	try {
		print('🔥 Hot Rebuilding CSS', LogLevel.Detailed)
		await proceedCSS({ force: true, release: false })
		measure.finish()
		status('flame', `Hot Rebuilt CSS in ${measure.time}ms`, StatusType.Success)
		print(`🔥 Hot Rebuilt CSS in ${measure.time}ms`)
		console.log(`Hot Rebuilt CSS in ${measure.time}ms`)
		setBuilding(false)
		setHotBuildingCSS(false)
		sidebarTreeView?.refresh()
		wsSendHotReload()
		if (awaitingHotRebuildCSS) {
			awaitingHotRebuildCSS = false
			print(`👉 Passing to delayed CSS hot rebuild call`, LogLevel.Verbose)
			hotRebuildCSS()
		}
	} catch (error) {
		awaitingHotRebuildCSS = false
		setBuilding(false)
		setHotBuildingCSS(false)
		sidebarTreeView?.refresh()
		const text = `Hot Rebuild CSS Failed`
		if (isString(error)) {
			print(`🧯 ${error}`)
			wsSendBuildError(`${error}`)
		} else {
			const json = JSON.stringify(error)
			const errorText = `${json === '{}' ? error : json}`
			print(`🧯 ${text}: ${errorText}`)
			wsSendBuildError(`${errorText}`)
			console.error(error)
		}
		status('error', `${text} (${measure.time}ms)`, StatusType.Error)
	}
}

interface HotRebuildJSParams {
	path: string
}

let awaitingHotRebuildJS: HotRebuildJSParams[] = []

export async function hotRebuildJS(params: HotRebuildJSParams) {
	if (!webber) return
	if (isBuilding || isHotBuildingHTML || isHotBuildingSwift || isHotBuildingJS) {
		if (!isBuilding) {
			if (awaitingHotRebuildJS.filter((x) => x.path == params.path).length == 0) {
				print(`👉 Delay JS hot rebuild call`, LogLevel.Verbose)
				awaitingHotRebuildJS.push(params)
			}
		}
		return
	}
	setBuilding(true)
	setHotBuildingJS(true)
	sidebarTreeView?.refresh()
	wsSendBuildStarted(true)
	const measure = new TimeMeasure()
	function finishHotRebuild() {
		measure.finish()
		status('flame', `Hot Rebuilt JS in ${measure.time}ms`, StatusType.Success)
		print(`🔥 Hot Rebuilt JS in ${measure.time}ms`)
		console.log(`Hot Rebuilt JS in ${measure.time}ms`)
		setBuilding(false)
		setHotBuildingJS(false)
		sidebarTreeView?.refresh()
		wsSendHotReload()
		const awaitingParams = awaitingHotRebuildJS.pop()
		if (awaitingParams) {
			print(`👉 Passing to delayed JS hot rebuild call`, LogLevel.Verbose)
			hotRebuildJS(awaitingParams)
		}
	}
	try {
		print('🔥 Hot Rebuilding JS', LogLevel.Detailed)
		let targetsDump = cachedSwiftTargets
		if (!targetsDump) {
			targetsDump = await webber.swift.getTargets()
			cachedSwiftTargets = targetsDump
		}
		if (targetsDump.executables.length == 0)
			throw `No targets to build`
		const additionalFiles = listOfAdditionalJSFiles({ release: false, executableTargets: targetsDump.executables })
		print(`changed file: ${params.path}`)
		print(`additionalFiles: \n${additionalFiles.join('\n')}`)
		if (additionalFiles.includes(params.path)) {
			proceedAdditionalJS({ release: false, executableTargets: targetsDump.executables, exactFile: params.path })
			finishHotRebuild()
			return
		}
		await buildWebSourcesForAllTargets({
			targets: targetsDump.executables,
			release: false,
			force: true,
			parallel: false
		})
		finishHotRebuild()
	} catch (error) {
		awaitingHotRebuildJS = []
		setBuilding(false)
		setHotBuildingJS(false)
		sidebarTreeView?.refresh()
		const text = `Hot Rebuild JS Failed`
		if (isString(error)) {
			print(`🧯 ${error}`)
			wsSendBuildError(`${error}`)
		} else {
			const json = JSON.stringify(error)
			const errorText = `${json === '{}' ? error : json}`
			print(`🧯 ${text}: ${errorText}`)
			wsSendBuildError(`${errorText}`)
			console.error(error)
		}
		status('error', `${text} (${measure.time}ms)`, StatusType.Error)
	}
}

let awaitingHotRebuildHTML = false

export async function hotRebuildHTML() {
	if (!webber) return
	if (isBuilding || isHotBuildingHTML || isHotBuildingJS || isHotBuildingSwift) {
		if (!isBuilding) {
			print(`👉 Delay HTML hot rebuild call`, LogLevel.Verbose)
			awaitingHotRebuildHTML = true
		}
		return
	}
	const measure = new TimeMeasure()
	try {
		let isPWA = cachedIsPWA
		let targetsDump = cachedSwiftTargets
		if (!targetsDump) {
			targetsDump = await webber.swift.getTargets()
			cachedSwiftTargets = targetsDump
		}
		if (targetsDump.executables.length == 0)
			throw `No targets to build`
		if (isPWA === undefined) {
			isPWA = targetsDump.serviceWorkers.length > 0
			cachedIsPWA = isPWA
		}
		setBuilding(true)
		setHotBuildingHTML(true)
		sidebarTreeView?.refresh()
		wsSendBuildStarted(true)
		print('🔥 Hot Rebuilding HTML', LogLevel.Detailed)
		const manifest = await proceedServiceWorkerManifest({ isPWA: isPWA, release: false })
		const index = await proceedIndex({ target: appTargetName, release: false })
		await proceedHTML({ appTargetName: appTargetName, manifest: manifest, index: index, release: false })
		// Process additional JS
		print('🔳 Process additional JS', LogLevel.Verbose)
		proceedAdditionalJS({ release: false, executableTargets: targetsDump.executables })
		measure.finish()
		status('flame', `Hot Rebuilt HTML in ${measure.time}ms`, StatusType.Success)
		print(`🔥 Hot Rebuilt HTML in ${measure.time}ms`)
		console.log(`Hot Rebuilt HTML in ${measure.time}ms`)
		setBuilding(false)
		setHotBuildingHTML(false)
		sidebarTreeView?.refresh()
		wsSendHotReload()
		if (awaitingHotRebuildHTML) {
			awaitingHotRebuildHTML = false
			print(`👉 Passing to delayed HTML hot rebuild call`, LogLevel.Verbose)
			hotRebuildHTML()
		}
	} catch (error) {
		awaitingHotRebuildHTML = false
		setBuilding(false)
		setHotBuildingHTML(false)
		sidebarTreeView?.refresh()
		const text = `Hot Rebuild HTML Failed`
		if (isString(error)) {
			print(`🧯 ${error}`)
			wsSendBuildError(`${error}`)
		} else {
			const json = JSON.stringify(error)
			const errorText = `${json === '{}' ? error : json}`
			print(`🧯 ${text}: ${errorText}`)
			wsSendBuildError(`${errorText}`)
			console.error(error)
		}
		status('error', `${text} (${measure.time}ms)`, StatusType.Error)
	}
}