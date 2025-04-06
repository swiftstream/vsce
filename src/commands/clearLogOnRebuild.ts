import { currentStream, sidebarTreeView } from '../extension'
import { isClearLogBeforeBuildEnabled } from '../streams/stream'

export function clearLogOnRebuildCommand() {
    currentStream?.setClearLogBeforeBuild(!isClearLogBeforeBuildEnabled)
    sidebarTreeView?.refresh()
}