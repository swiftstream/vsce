import * as fs from 'fs'
import { projectDirectory, sidebarTreeView } from '../../../extension'
import { appTargetName, buildProdFolder, currentProdPort, serviceWorkerTargetName, WebStream } from '../../../streams/web/webStream'
import { isBuildingRelease, buildStatus, clearStatus, print, status, StatusType } from '../../../streams/stream'
import { LogLevel } from '../../../streams/stream'
import { window } from 'vscode'
import { isString } from '../../../helpers/isString'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { resolveSwiftDependencies } from '../../../commands/build/resolveSwiftDependencies'
import { allSwiftBuildTypes, createSymlinkFoldersIfNeeded, SwiftBuildType } from '../../../swift'
import { checkRequiredDependencies } from './build/requiredDependencies'
import { buildExecutableTarget } from './build/buildExecutableTargets'
import { buildJavaScriptKit } from './build/buildJavaScriptKit'
import { buildWebSourcesForAllTargets } from './build/buildWebSources'
import { proceedServiceWorkerManifest } from './build/proceedServiceWorkerManifest'
import { proceedBundledResources } from './build/proceedBundledResources'
import { proceedCSS } from './build/proceedCSS'
import { proceedHTML } from './build/proceedHTML'
import { proceedIndex } from './build/proceedIndex'
import { proceedWasmFile } from './build/proceedWasmFile'
import { awaitGzipping, shouldAwaitGzipping } from './build/awaitGzipping'
import { proceedAdditionalJS } from './build/proceedAdditionalJS'
import { awaitBrotling, shouldAwaitBrotling } from './build/awaitBrotling'
import { AbortHandler } from '../../../bash'

export async function buildReleaseCommand(webStream: WebStream, successCallback?: any) {
	if (isBuildingRelease) return
	const abortHandler = webStream.setAbortBuildingReleaseHandler(() => {
		measure.finish()
        status('circle-slash', `Aborted Build after ${measure.time}ms`, StatusType.Default)
        print(`🚫 Aborted Build after ${measure.time}ms`)
        console.log(`Aborted Build after ${measure.time}ms`)
        webStream.setBuildingRelease(false)
        sidebarTreeView?.refresh()
	})
	webStream.setBuildingRelease(true)
	sidebarTreeView?.refresh()
	const measure = new TimeMeasure()
	var gzipFail: any | undefined
	var brotliFail: any | undefined
	sidebarTreeView?.cleanupErrors()
    sidebarTreeView?.refresh()
	try {
		print(`🏗️ Started building release`, LogLevel.Normal, true)
		print(`💁‍♂️ it will try to build each phase`, LogLevel.Detailed)
		// Phase 0: Remove DistPublic folder
		print('🔳 Phase 0: Remove DistPublic folder', LogLevel.Verbose)
		const destPath = `${projectDirectory}/${buildProdFolder}`
		fs.rmSync(destPath, { recursive: true, force: true })
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
				},
				abortHandler: abortHandler
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
				buildReleaseCommand(webStream, successCallback)
			}
			return
		}
		// Phase 3: Retrieve executable Swift targets
		print('🔳 Phase 3: Retrieve executable Swift targets', LogLevel.Verbose)
		const targetsDump = await webStream.swift.getWebTargets({ abortHandler: abortHandler })
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
		let brotledExecutableTargets: string[] = []
		for (let n = 0; n < buildTypes.length; n++) {
			const type = buildTypes[n]
			for (let i = 0; i < targetsDump.executables.length; i++) {
				const target = targetsDump.executables[i]
				await buildExecutableTarget({
					type: type,
					target: target,
					release: type == SwiftBuildType.Wasi,
					force: true,
					abortHandler: abortHandler
				})
				if (type == SwiftBuildType.Wasi) {
					// Phase 5.1: Proceed WASM file
					print('🔳 Phase 5.1: Proceed WASM file', LogLevel.Verbose)
					await proceedWasmFile({
						target: target,
						release: true,
						abortHandler: abortHandler,
						gzipSuccess: () => {
							gzippedExecutableTargets.push(target)
						}, gzipFail: (reason) => {
							gzipFail = reason
						}, brotliSuccess: () => {
							brotledExecutableTargets.push(target)
						}, brotliFail: (reason) => {
							brotliFail = reason
						}, gzipDisabled: () => {}, brotliDisabled: () => {}
					})
				}
			}
		}
		// Phase 6: Build JavaScriptKit TypeScript sources
		print('🔳 Phase 6: Build JavaScriptKit TypeScript sources', LogLevel.Verbose)
		await buildJavaScriptKit({
			force: true,
			abortHandler: abortHandler
		})
		// Phase 7: Build all the web sources
		print('🔳 Phase 7: Build all the web sources', LogLevel.Verbose)
		await buildWebSourcesForAllTargets({
			targets: targetsDump.executables,
			release: true,
			force: true,
			parallel: false,
			abortHandler: abortHandler
		})
		// Phase 8: Retrieve manifest from the Service target
		print('🔳 Phase 8: Retrieve manifest from the Service target', LogLevel.Verbose)
		const manifest = await proceedServiceWorkerManifest({
			isPWA: isPWA,
			release: true,
			abortHandler: abortHandler
		})
		// Phase 9: Retrieve index from the App target
		print('🔳 Phase 9: Retrieve index from the App target', LogLevel.Verbose)
		const index = await proceedIndex({
			target: appTargetName,
			release: true,
			abortHandler: abortHandler
		})
		// Phase 10: Copy bundled resources from Swift build folder
		print('🔳 Phase 10: Copy bundled resources from Swift build folder', LogLevel.Verbose)
		proceedBundledResources({
			release: true,
			abortHandler: abortHandler
		})
		// Phase 11: Compile SCSS
		print('🔳 Phase 11: Compile SCSS', LogLevel.Verbose)
		await proceedCSS({
			force: true,
			release: true,
			abortHandler: abortHandler
		})
		// Phase 12: Proceed HTML
		print('🔳 Phase 12: Proceed HTML', LogLevel.Verbose)
		await proceedHTML({
			appTargetName: appTargetName,
			manifest: manifest,
			index: index,
			release: true,
			abortHandler: abortHandler
		})
		// Phase 13: Process additional JS
		print('🔳 Phase 13: Process additional JS', LogLevel.Verbose)
		proceedAdditionalJS({
			release: true,
			executableTargets: targetsDump.executables,
			abortHandler: abortHandler
		})
		// Phase 14: Await Gzipping
		const awaitGzippingParams = { release: true, gzippedTargets: gzippedExecutableTargets, targetsToRebuild: targetsDump.executables, gzipFail: () => gzipFail }
		if (shouldAwaitGzipping(awaitGzippingParams)) {
			print('⏳ Phase 14: Await gzipping', LogLevel.Detailed)
			await awaitGzipping(awaitGzippingParams)
		}
		// Phase 15: Await Brotling
		const awaitBrotlingParams = { release: true, brotledTargets: brotledExecutableTargets, targetsToRebuild: targetsDump.executables, brotliFail: () => brotliFail }
		if (shouldAwaitBrotling(awaitBrotlingParams)) {
			print('⏳ Phase 15: Await brotling', LogLevel.Detailed)
			await awaitBrotling(awaitBrotlingParams)
		}
		measure.finish()
		if (abortHandler.isCancelled) return
		status('check', `Release Build Succeeded in ${measure.time}ms`, StatusType.Success)
		print(`✅ Release Build Succeeded in ${measure.time}ms`)
		print(`🌐 Test in browser at https://127.0.0.1:${currentProdPort}`)
		console.log(`Release Build Succeeded in ${measure.time}ms`)
		webStream.setBuildingRelease(false)
		sidebarTreeView?.refresh()
		if (successCallback) successCallback()
	} catch (error: any) {
		webStream.setBuildingRelease(false)
		sidebarTreeView?.refresh()
		const text = `Release Build Failed`
		if (isString(error)) {
			print(`🧯 ${error}`)
		} else {
			const json = JSON.stringify(error)
			print(`🧯 ${text}: ${json === '{}' ? error : json}`)
			console.error(error)
		}
		status('error', `${text} (${measure.time}ms)`, StatusType.Error)
	}
}