import * as fs from 'fs'
import { currentStream, projectDirectory } from '../extension'
import { buildDevFolder } from '../streams/web/webStream'
import { isClearedBuildCache, isClearingBuildCache } from '../streams/stream'
import { print, status, StatusType } from '../streams/stream'
import { isBuildingDebug, LogLevel } from '../streams/stream'
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { createSymlinkFoldersIfNeeded } from '../swift'

export async function clearBuildCacheCommand() {
	if (isBuildingDebug) return
	if (isClearingBuildCache || isClearedBuildCache) return
	currentStream?.setClearingBuildCache(true)
	await new Promise((x) => setTimeout(x, 100))
	const swiftURLCache = `/root/.cache/org.swift.foundation.URLCache`
	const swiftPMCache = `/root/.cache/org.swift.swiftpm`
	const buildCacheFolder = `${projectDirectory}/.build`
	const buildDevFolderPath = `${projectDirectory}/${buildDevFolder}`
	print(`🧹 Clearing Build Cache`, LogLevel.Detailed)
	const measure = new TimeMeasure()
	// if (fs.existsSync(swiftURLCache))
	// 	fs.rmSync(swiftURLCache, { recursive: true, force: true })
	// if (fs.existsSync(swiftPMCache))
	// 	fs.rmSync(swiftPMCache, { recursive: true, force: true })
	if (fs.existsSync(buildCacheFolder))
		fs.rmSync(buildCacheFolder, { recursive: true, force: true })
	if (fs.existsSync(buildDevFolderPath))
		fs.rmSync(buildDevFolderPath, { recursive: true, force: true })
	createSymlinkFoldersIfNeeded()
	measure.finish()
	if (measure.time < 1000) {
		await new Promise((x) => setTimeout(x, 1000))
	}
	currentStream?.setClearingBuildCache(false)
	currentStream?.setClearedBuildCache(true)
	status('check', `Cleared Build Cache in ${measure.time}ms`, StatusType.Success)
	print(`🧹 Cleared Build Cache in ${measure.time}ms`, LogLevel.Detailed)
	await new Promise((x) => setTimeout(x, 1000))
	currentStream?.setClearedBuildCache(false)
}