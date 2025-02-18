import { sidebarTreeView, webStream } from "../extension"
import { isHotReloadEnabled } from "../streams/web/webStream"

export function hotReloadCommand() {
	webStream?.setHotReload(!isHotReloadEnabled)
	sidebarTreeView?.refresh()
}