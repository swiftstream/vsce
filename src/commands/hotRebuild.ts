import { sidebarTreeView, webStream } from "../extension"
import { isHotRebuildEnabled } from "../streams/web/webStream"

export function hotRebuildCommand() {
	webStream?.setHotRebuild(!isHotRebuildEnabled)
	sidebarTreeView?.refresh()
}