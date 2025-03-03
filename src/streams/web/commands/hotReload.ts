import { sidebarTreeView, webStream } from '../../../extension'
import { isHotReloadEnabled } from '../webStream'

export function hotReloadCommand() {
	webStream?.setHotReload(!isHotReloadEnabled)
	sidebarTreeView?.refresh()
}