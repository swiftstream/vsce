import { sidebarTreeView, webber } from "../extension"
import { appTargetName, buildStatus, clearStatus, isBuildingRelease, LogLevel, print, serviceWorkerTargetName, setBuildingRelease, status, StatusType } from "../webber"
import { window } from 'vscode'
import { isString } from '../helpers/isString'
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { resolveSwiftDependencies } from './build/resolveSwiftDependencies'
import { allSwiftBuildTypes, SwiftBuildType, SwiftTargets } from '../swift'
import { checkRequiredDependencies } from './build/requiredDependencies'
import { buildExecutableTarget } from './build/buildExecutableTargets'
import { buildJavaScriptKit } from './build/buildJavaScriptKit'
import { buildWebSources } from './build/buildWebSources'
import { proceedServiceWorkerManifest } from './build/proceedServiceWorkerManifest'
import { proceedBundledResources } from "./build/proceedBundledResources"
import { proceedSCSS } from "./build/proceedSCSS"
import { proceedHTML } from "./build/proceedHTML"
import { proceedIndex } from "./build/proceedIndex"
import { proceedWasmFile } from "./build/proceedWasmFile"

export async function buildReleaseCommand() {
	if (!webber) return
	if (isBuildingRelease) return
	setBuildingRelease(true)
	sidebarTreeView?.refresh()
	const measure = new TimeMeasure()
	try {
		print(`🏗️ Started building release`, LogLevel.Normal, true)
		print(`💁‍♂️ it will try to build each phase`, LogLevel.Detailed)
		// Phase 1: Resolve Swift dependencies for each build type
		print('🔳 Phase 1: Resolve Swift dependencies for each build type', LogLevel.Verbose)
		const types = allSwiftBuildTypes()
		for (let i = 0; i < types.length; i++) {
			const type = types[i]
			await resolveSwiftDependencies({
				type: type,
				force: true,
				substatus: (t) => {
					buildStatus(`Resolving dependencies (${type}): ${t}`)
					print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Verbose)
				}
			})
		}
		// Phase 2: Check if required Swift dependencies present
		print('🔳 Phase 2: Check if required Swift dependencies present', LogLevel.Verbose)
		const requiredDependencies = await checkRequiredDependencies()
		if (requiredDependencies.missing.length > 0) {
			clearStatus()
			const text = `Missing ${requiredDependencies.missing.map((x) => `\`${x}\``).join(', ')} package${requiredDependencies.missing.length > 1 ? 's' : ''}`
			print(`🙆‍♂️ ${text}`)
			const result = await window.showErrorMessage(text, 'Retry', 'Cancel')
			if (result == 'Retry') {
				print(`Going to retry release build command`, LogLevel.Verbose)
				buildReleaseCommand()
			}
			return
		}
		// Phase 3: Retrieve executable Swift targets
		print('🔳 Phase 3: Retrieve executable Swift targets', LogLevel.Verbose)
		const targetsDump = await webber.swift.getTargets()
		if (targetsDump.executables.length == 0)
			throw `No targets to build`
		const isPWA = targetsDump.serviceWorkers.length > 0
		if (isPWA) {
			print(`It is PWA since ServiceWorker related targets found`, LogLevel.Verbose)
		} else {
			print(`It's not PWA since ServiceWorker related targets not found`, LogLevel.Verbose)
		}
		// Phase 4: Check that App target name present
		print('🔳 Phase 4: Check that App target name present', LogLevel.Verbose)
		if (!targetsDump.executables.includes(appTargetName))
			throw `${appTargetName} is missing in the Package.swift`
		if (isPWA && !targetsDump.serviceWorkers.includes(serviceWorkerTargetName))
			throw `${serviceWorkerTargetName} is missing in the Package.swift`
		// Phase 5: Build executable targets
		print('🔳 Phase 5: Build executable targets', LogLevel.Verbose)
		let gzippedExecutableTargets: string[] = []
		const buildTypes = allSwiftBuildTypes()
		for (let n = 0; n < buildTypes.length; n++) {
			const type = buildTypes[n]
			for (let i = 0; i < targetsDump.executables.length; i++) {
				const target = targetsDump.executables[i]
				await buildExecutableTarget({
					type: type,
					target: target,
					release: type != SwiftBuildType.Wasi,
					force: true
				})
				if (type != SwiftBuildType.Wasi) {
					// Phase 5.1: Proceed WASM file
					print('🔳 Phase 5.1: Proceed WASM file', LogLevel.Verbose)
					await proceedWasmFile({ target: target, release: true, gzipCallback: () => {
						gzippedExecutableTargets.push(target)
					}})
				}
			}
		}
		// Phase 6: Build JavaScriptKit TypeScript sources
		print('🔳 Phase 6: Build JavaScriptKit TypeScript sources', LogLevel.Verbose)
		await buildJavaScriptKit({
			force: true
		})
		// Phase 7: Build all the web sources
		print('🔳 Phase 7: Build all the web sources', LogLevel.Verbose)
		await Promise.all(targetsDump.executables.map(async (target) => {
			await buildWebSources({
				target: target,
				isServiceWorker: !(target === appTargetName),
				release: true,
				force: true
			})
		}))
		// Phase 8: Retrieve manifest from the Service target
		print('🔳 Phase 8: Retrieve manifest from the Service target', LogLevel.Verbose)
		const manifest = await proceedServiceWorkerManifest({ isPWA: isPWA, release: true })
		// Phase 9: Retrieve index from the App target
		print('🔳 Phase 9: Retrieve index from the App target', LogLevel.Verbose)
		const index = await proceedIndex({ target: appTargetName, release: true })
		// Phase 10: Copy bundled resources from Swift build folder
		print('🔳 Phase 10: Copy bundled resources from Swift build folder', LogLevel.Verbose)
		proceedBundledResources({ release: true })
		// Phase 11: Compile SCSS
		print('🔳 Phase 11: Compile SCSS', LogLevel.Verbose)
		await proceedSCSS({ force: true, release: true })
		// Phase 12: Proceed HTML
		print('🔳 Phase 12: Proceed HTML', LogLevel.Verbose)
		await proceedHTML({ appTargetName: appTargetName, manifest: manifest, index: index, release: true })
		if (gzippedExecutableTargets.length != targetsDump.executables.length) {
			print('🔳 Phase 13: Await gzipping', LogLevel.Detailed)
			while (gzippedExecutableTargets.length != targetsDump.executables.length) {}
		}
		measure.finish()
		status('check', `Release Build Succeeded in ${measure.time}ms`, StatusType.Success)
		print(`✅ Release Build Succeeded in ${measure.time}ms`)
		console.log(`Release Build Succeeded in ${measure.time}ms`)
		setBuildingRelease(false)
		sidebarTreeView?.refresh()
	} catch (error: any) {
		setBuildingRelease(false)
		sidebarTreeView?.refresh()
		var text = ''
		if (isString(error)) {
			text = error
			print(`❌ ${text}`)
		} else {
			text = `Something went wrong during the release build`
			print(`❌ ${text}: ${JSON.stringify(error)}`)
			console.error(error)
		}
		status('error', `Something went wrong during the release build (${measure.time}ms)`, StatusType.Error)
	}
}