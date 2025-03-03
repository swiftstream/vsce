import { currentStream, sidebarTreeView } from '../extension'
import { isHotRebuildEnabled } from '../streams/stream'

export function hotRebuildCommand() {
	currentStream?.setHotRebuild(!isHotRebuildEnabled)
	sidebarTreeView?.refresh()
}