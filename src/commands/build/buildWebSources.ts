import * as fs from 'fs'
import { projectDirectory, webber } from "../../extension"
import { getLastModifiedDate, LastModifiedDateType, wasFileModified, wasPathModified } from "../../helpers/filesHelper"
import { buildDevFolder, buildProdFolder, buildStatus, LogLevel, print, webSourcesFolder } from "../../webber"
import { WebpackMode } from '../../webpack'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function buildWebSources(options: { target: string, isServiceWorker: boolean, release: boolean, force: boolean }) {
    if (!webber) throw `webber is null`
    if (!options.force && doesDependenciesPresent() && !doesModifiedAnyJSTSFile(options.target)) {
        print(`buildWebSources skipping for ${options.target} target because force == false and nothing was modified`, LogLevel.Verbose)
        return
    }
    const measure = new TimeMeasure()
    print(`🌳 Building \`${options.target}\` web target`, LogLevel.Detailed)
    buildStatus(`Building ${options.target} web target`)
    if (!doesDependenciesPresent()) {
        options.force = true
        print(`Web sources: initial npm install`, LogLevel.Verbose)
        buildStatus(`Building ${options.target} web target dependencies`)
        await webber.npmWeb.install()
    }
    buildStatus(`Building ${options.target} web target sources`)
    const bundlePath = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    await webber.webpack.build(WebpackMode.Development, options.target.toLowerCase(), options.isServiceWorker, bundlePath)
    if (!doesBundlePresent({ target: options.target, bundlePath: bundlePath })) {
        print(`🌳 Second attempt for \`${options.target}\` web target`, LogLevel.Detailed)
        buildStatus(`Building ${options.target} web target sources (2nd attempt)`)
        await webber.webpack.build(WebpackMode.Development, options.target.toLowerCase(), options.isServiceWorker, bundlePath)
    }
    if (!doesBundlePresent({ target: options.target, bundlePath: bundlePath }))
        throw `${options.target} web target build failed`
    measure.finish()
    print(`🌳 Built \`${options.target}\` web target in ${measure.time}ms`, LogLevel.Detailed)
}
function doesDependenciesPresent(): boolean {
	const value = fs.existsSync(`${projectDirectory}/${webSourcesFolder}/node_modules`)
	print(`Web sources: node_modules ${value ? 'present' : 'not present'}`, LogLevel.Unbearable)
	return value
}
function doesBundlePresent(options: { target: string, bundlePath: string }): boolean {
	const value = fs.existsSync(`${options.bundlePath}/${options.target.toLowerCase()}.js`)
	print(`${options.target} web target bundle ${value ? 'present' : 'not present'}`, LogLevel.Unbearable)
	return value
}
function doesModifiedAnyJSTSFile(target: string): boolean {
    if (wasFileModified({
        path: `${projectDirectory}/${webSourcesFolder}/package.json`,
        lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.WebSources, target)
    })) return true
    if (wasPathModified({
        path: `${projectDirectory}/${webSourcesFolder}`,
        recursive: true,
        specificExtensions: ['js', 'ts'],
        lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.WebSources, target)
    })) return true
    return false
}