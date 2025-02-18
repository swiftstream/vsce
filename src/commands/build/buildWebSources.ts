import * as fs from 'fs'
import { projectDirectory, webStream } from '../../extension'
import { getLastModifiedDate, LastModifiedDateType, wasFileModified, wasPathModified } from '../../helpers/filesHelper'
import { appTargetName, buildDevFolder, buildProdFolder, webSourcesFolder } from '../../streams/web/webStream'
import { buildStatus, print } from '../../streams/stream'
import { LogLevel } from '../../streams/stream'
import { WebpackMode } from '../../webpack'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function buildWebSourcesForAllTargets(options: { targets: string[], release: boolean, force: boolean, parallel: boolean }) {
    if (!options.parallel) {
        print('Building web sources one by one', LogLevel.Verbose)
        for (let i = 0; i < options.targets.length; i++) {
            const target = options.targets[i]
            await buildWebSources({
                target: target,
                isServiceWorker: !(target === appTargetName),
                release: options.release,
                force: options.force
            })
        }
    } else {
        print('Building web sources in parallel', LogLevel.Verbose)
        await Promise.all(options.targets.map(async (target) => {
            await buildWebSources({
                target: target,
                isServiceWorker: !(target === appTargetName),
                release: options.release,
                force: options.force
            })
        }))
    }
}
async function buildWebSources(options: { target: string, isServiceWorker: boolean, release: boolean, force: boolean }) {
    if (!webStream) throw `webStream is null`
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
        await webStream.npmWeb.install()
    }
    buildStatus(`Building ${options.target} web target sources`)
    const bundlePath = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    await webStream.webpack.build(options.release ? WebpackMode.Production : WebpackMode.Development, options.target.toLowerCase(), options.isServiceWorker, bundlePath)
    if (!doesBundlePresent({ target: options.target, bundlePath: bundlePath })) {
        print(`🌳 Second attempt for \`${options.target}\` web target`, LogLevel.Detailed)
        buildStatus(`Building ${options.target} web target sources (2nd attempt)`)
        await webStream.webpack.build(options.release ? WebpackMode.Production : WebpackMode.Development, options.target.toLowerCase(), options.isServiceWorker, bundlePath)
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