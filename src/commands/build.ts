import { sidebarTreeView, webber } from "../extension"
import { appTargetName, buildStatus, clearStatus, isBuilding, LogLevel, print, serviceWorkerTargetName, setBuilding, status, StatusType } from "../webber"
import { window } from 'vscode'
import { isString } from '../helpers/isString'
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { resolveSwiftDependencies } from './build/resolveSwiftDependencies'
import { allSwiftBuildTypes, Index } from '../swift'
import { checkRequiredDependencies } from './build/requiredDependencies'
import { buildExecutableTarget } from './build/buildExecutableTargets'
import { buildJavaScriptKit } from './build/buildJavaScriptKit'
import { buildWebSources } from './build/buildWebSources'
import { proceedServiceWorkerManifest } from './build/proceedServiceWorkerManifest'
import { proceedBundledResources } from "./build/proceedBundledResources"
import { proceedSCSS } from "./build/proceedSCSS"
import { proceedHTML } from "./build/proceedHTML"
import { proceedIndex } from "./build/proceedIndex"

export async function buildCommand() {
	if (!webber) return
	if (isBuilding) return
	setBuilding(true)
	sidebarTreeView?.refresh()
	const measure = new TimeMeasure()
	try {
		print(`🏗️ Started building debug`, LogLevel.Normal, true)
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
				print(`Going to retry debug build command`, LogLevel.Verbose)
				buildCommand()
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
		const buildTypes = allSwiftBuildTypes()
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
				release: false,
				force: true
			})
		}))
		// Phase 8: Retrieve manifest from the Service target
		print('🔳 Phase 8: Retrieve manifest from the Service target', LogLevel.Verbose)
		const manifest = await proceedServiceWorkerManifest({ isPWA: isPWA, release: false })
		// Phase 9: Retrieve index from the App target
		print('🔳 Phase 9: Retrieve index from the App target', LogLevel.Verbose)
		const index = await proceedIndex({ target: appTargetName, release: false })
		// Phase 10: Copy bundled resources from Swift build folder
		print('🔳 Phase 10: Copy bundled resources from Swift build folder', LogLevel.Verbose)
		proceedBundledResources({ release: false })
		// Phase 11: Compile SCSS
		print('🔳 Phase 11: Compile SCSS', LogLevel.Verbose)
		await proceedSCSS({ force: true, release: false })
		// Phase 12: Proceed HTML
		print('🔳 Phase 12: Proceed HTML', LogLevel.Verbose)
		await proceedHTML({ appTargetName: appTargetName, manifest: manifest, index: index, release: false })
		measure.finish()
		status('check', `Build Succeeded in ${measure.time}ms`, StatusType.Success)
		print(`✅ Build Succeeded in ${measure.time}ms`)
		console.log(`Build Succeeded in ${measure.time}ms`)
		setBuilding(false)
		sidebarTreeView?.refresh()
	} catch (error: any) {
		setBuilding(false)
		sidebarTreeView?.refresh()
		var text = ''
		if (isString(error)) {
			text = error
			print(`❌ ${text}`)
		} else {
			text = `Something went wrong during the build`
			print(`❌ ${text}: ${error}`)
			console.error(error)
		}
		status('error', `Something went wrong during the build (${measure.time}ms)`, StatusType.Error)
	}
}