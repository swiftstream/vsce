import * as fs from 'fs'
import JSON5 from 'json5'
import { buildDevPath, buildProdPath, LogLevel, print, serviceWorkerTargetName, webSourcesPath } from "../../webber"
import { projectDirectory, webber } from '../../extension'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

const webManifestFile = 'site.webmanifest'

export async function proceedServiceWorkerManifest(options: { isPWA: boolean, release: boolean }) {
    if (!webber) throw `webber is null`
    if (!options.isPWA) {
        print(`Skipping manifest retrieval since it is not PWA app`, LogLevel.Verbose)
        return
    }
    const timeMeasure = new TimeMeasure()
    var generatedManifest = await webber.swift.grabPWAManifest({ serviceWorkerTarget: serviceWorkerTargetName })
    const staticManifest = getStaticManifest()
    if (staticManifest) {
        // override generated manifest data with the static one
        generatedManifest = {...generatedManifest, ...staticManifest}
    }
    const outputDir = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    const pathToSaveManifest = `${outputDir}/${webManifestFile}`
    if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(pathToSaveManifest, JSON.stringify(generatedManifest, null, '\t'))
    timeMeasure.finish()
    print(`Service worker manifest coking finished in ${timeMeasure.time}ms`, LogLevel.Verbose)
}
function getStaticManifest(): any | undefined {
    if (!fs.existsSync(`${projectDirectory}/${webSourcesPath}/${webManifestFile}`))
        return undefined
    try {
        return JSON5.parse(fs.readFileSync(`${projectDirectory}/${webSourcesPath}/${webManifestFile}`, 'utf8'))
    } catch (error) {
        console.dir({parseStaticManifestError:error})
        return undefined
    }
}