import * as fs from 'fs'
import JSON5 from 'json5'
import { buildDevFolder, buildProdFolder, LogLevel, print, serviceWorkerTargetName, webSourcesFolder } from "../../webber"
import { projectDirectory, webber } from '../../extension'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function proceedServiceWorkerManifest(options: { isPWA: boolean, release: boolean }): Promise<any> {
    if (!webber) throw `webber is null`
    if (!options.isPWA) {
        print(`💨 Skipping manifest retrieval since it is not PWA app`, LogLevel.Verbose)
        return
    }
    const timeMeasure = new TimeMeasure()
    print(`📜 Getting service worker manifest`, LogLevel.Detailed)
    var generatedManifest = await webber.swift.grabPWAManifest({ serviceWorkerTarget: serviceWorkerTargetName })
    const webManifestFileName = generatedManifest.file_name ?? 'site'
    const staticManifest = getStaticManifest(webManifestFileName)
    if (staticManifest) {
        // override generated manifest data with the static one
        generatedManifest = {...generatedManifest, ...staticManifest}
    }
    const outputDir = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    const pathToSaveManifest = `${outputDir}/${webManifestFileName}.webmanifest`
    if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(pathToSaveManifest, JSON.stringify(generatedManifest, null, '\t'))
    timeMeasure.finish()
    print(`📜 Got manifest in ${timeMeasure.time}ms`, LogLevel.Detailed)
    return generatedManifest
}
function getStaticManifest(fileName: string): any | undefined {
    if (!fs.existsSync(`${projectDirectory}/${webSourcesFolder}/${fileName}.webmanifest`))
        return undefined
    try {
        return JSON5.parse(fs.readFileSync(`${projectDirectory}/${webSourcesFolder}/${fileName}.webmanifest`, 'utf8'))
    } catch (error) {
        console.dir({parseStaticManifestError:error})
        return undefined
    }
}