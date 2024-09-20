import { sidebarTreeView, webber } from "../extension"
import { isHotReloadEnabled } from "../webber"

export function hotReloadCommand() {
	webber?.setHotReload(!isHotReloadEnabled)
	sidebarTreeView?.refresh()
}