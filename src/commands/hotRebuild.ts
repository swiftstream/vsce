import { sidebarTreeView, webber } from "../extension"
import { isHotRebuildEnabled } from "../webber"

export function hotRebuildCommand() {
	webber?.setHotRebuild(!isHotRebuildEnabled)
	sidebarTreeView?.refresh()
}