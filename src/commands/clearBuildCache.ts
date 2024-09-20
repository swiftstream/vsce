import * as fs from 'fs'
import { projectDirectory, sidebarTreeView } from "../extension"
import { isClearedBuildCache, isClearingBuildCache, setClearedBuildCache, setClearingBuildCache } from "../webber"

export function clearBuildCacheCommand() {
	if (isClearingBuildCache || isClearedBuildCache) return
	setClearingBuildCache(true)
	sidebarTreeView?.refresh()
	const buildFolder = `${projectDirectory}/.build`
	const startTime = new Date()
	if (fs.existsSync(buildFolder)) {
		fs.rmdirSync(buildFolder, { recursive: true })
	}
	const endTime = new Date()
	function afterClearing() {
		setClearingBuildCache(false)
		setClearedBuildCache(true)
		sidebarTreeView?.refresh()
		setTimeout(() => {
			setClearedBuildCache(false)
			sidebarTreeView?.refresh()
		}, 1000)
	}
	if (endTime.getTime() - startTime.getTime() < 1000) {
		setTimeout(() => {
			afterClearing()
		}, 1000)
	} else {
		afterClearing()
	}
}