import { webber } from "../extension"
import { appTargetName, buildStatus, clearStatus, LogLevel, print, serviceWorkerTargetName, status, StatusType } from "../webber"
import { window } from 'vscode'
import { isString } from '../helpers/isString'
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { resolveSwiftDependencies } from './build/resolveSwiftDependencies'
import { allSwiftBuildTypes } from '../swift'
import { checkRequiredDependencies } from './build/requiredDependencies'
import { buildExecutableTarget } from './build/buildExecutableTargets'
import { buildJavaScriptKit } from './build/buildJavaScriptKit'
import { buildWebSources } from './build/buildWebSources'
import { proceedServiceWorkerManifest } from './build/proceedServiceWorkerManifest'

export async function buildCommand() {
	if (!webber) return
	try {
		print(`🏗️ Started building debug`, LogLevel.Normal, true)
		print(`force rebuilds everything by its nature`, LogLevel.Detailed)
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
		const targetsDump = await webber.swift.getTargets()
		print(`Retrieved targets: [${targetsDump.executables.join(', ')}]`, LogLevel.Detailed)
		if (targetsDump.executables.length == 0)
			throw `No targets to build`
		const isPWA = targetsDump.serviceWorkers.length > 0
		if (isPWA) {
			print(`It is PWA since ServiceWorker related targets found`, LogLevel.Verbose)
		} else {
			print(`It's not PWA since ServiceWorker related targets not found`, LogLevel.Verbose)
		}
		// Phase 4: Check that App target name present
		if (!targetsDump.executables.includes(appTargetName))
			throw `${appTargetName} is missing in the Package.swift`
		if (isPWA && !targetsDump.serviceWorkers.includes(serviceWorkerTargetName))
			throw `${serviceWorkerTargetName} is missing in the Package.swift`
		// Phase 5: Build executable targets
		for (const target in targetsDump.executables) {
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
		// Phase 6: Build JavaScriptKit TypeScript sources
		print(`🧱 Building JavaScriptKit`)
        buildStatus(`Building JavaScriptKit`)
		await buildJavaScriptKit({
			force: true
        })
		// Phase 7: Build all the web sources
		for (const target in targetsDump.executables) {
			print(`🧱 Building web sources for ${target}`)
			buildStatus(`Building web sources for ${target}`)
			await buildWebSources({
				target: target,
				isServiceWorker: !(target === appTargetName),
				release: false,
				force: true
			})
		}
		// Phase 8: Retrieve manifest from the Service target
		await proceedServiceWorkerManifest({ isPWA: isPWA, release: false })
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