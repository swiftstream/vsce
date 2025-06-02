import * as fs from 'fs'
import * as path from 'path'
import Handlebars from 'handlebars'
import { copyFile, readFile } from './helpers/filesHelper'
import { projectDirectory } from './extension'
import { LogLevel, print } from './streams/stream'
import { DroidBuildArch, droidBuildArchToSwiftBuildFolder } from './streams/pure/pureStream'
import { AndroidStream } from './streams/android/androidStream'

export class AndroidLibraryProject {
    static generateIfNeeded(options: {
        package: string,
        name: string,
        targets: string[],
        compileSdk: number,
        minSdk: number,
        javaVersion: number,
        swiftVersion: string
    }) {
        const libraryPath = path.join(projectDirectory!, 'Library')
        if (!fs.existsSync(libraryPath)) {
            print(`Created folder at ${libraryPath}`, LogLevel.Unbearable)
            fs.mkdirSync(libraryPath)
        }
        const copySourceFile = async (from: string, to?: string) => {
            await copyFile(path.join('assets', 'Sources', 'android', 'library', from), path.join(libraryPath, to ?? from))
        }
        const buildGradlePath = path.join(libraryPath, 'build.gradle.kts')
        if (!fs.existsSync(buildGradlePath)) {
            copySourceFile('build.gradle.kts')
        }
        const settingsPayload = {
            androidLibraryVersion: '8.3.1',
            kotlinLibraryVersion: '1.9.22',
            name: options.name,
            targets: options.targets.map(x => x.toLowerCase())
        }
        const settingsGradlePath = path.join(libraryPath, 'settings.gradle.kts')
        if (!fs.existsSync(settingsGradlePath)) {
            fs.writeFileSync(
                settingsGradlePath,
                Handlebars.compile(readFile(path.join('assets', 'Sources', 'android', 'library', 'settings.gradle.kts.hbs')))(settingsPayload)
            )
        }
        for (let i = 0; i < options.targets.length; i++) {
            const target = options.targets[i]
            const targetPath = path.join(libraryPath, target.toLowerCase())
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath)
            }
            const consumerRulesPath = path.join(targetPath, 'consumer-rules.pro')
            if (!fs.existsSync(consumerRulesPath)) {
                copySourceFile(path.join('target', 'consumer-rules.pro'), path.join(target, 'consumer-rules.pro'))
            }
            const buildPayload = {
                namespace: `${options.package}.${target.toLowerCase()}`,
                compileSdk: options.compileSdk,
                minSdk: options.minSdk,
                targetName: target,
                javaVersion: options.javaVersion,
                swiftVersion: options.swiftVersion
            }
            const buildGradlePath = path.join(targetPath, 'build.gradle.kts')
            if (!fs.existsSync(buildGradlePath)) {
                fs.writeFileSync(
                    buildGradlePath,
                    Handlebars.compile(readFile(path.join('assets', 'Sources', 'android', 'library', 'target', 'build.gradle.kts.hbs')))(buildPayload)
                )
            }
            const srcPath = path.join(targetPath, 'src')
            if (!fs.existsSync(srcPath)) {
                fs.mkdirSync(srcPath)
            }
            const mainPath = path.join(srcPath, 'main')
            if (!fs.existsSync(mainPath)) {
                fs.mkdirSync(mainPath)
            }
            const jniLibsPath = path.join(mainPath, 'jniLibs')
            if (!fs.existsSync(jniLibsPath)) {
                fs.mkdirSync(jniLibsPath)
            }
            const arm64Path = path.join(jniLibsPath, 'arm64-v8a')
            if (!fs.existsSync(arm64Path)) {
                fs.mkdirSync(arm64Path)
            }
            const armPath = path.join(jniLibsPath, 'armeabi-v7a')
            if (!fs.existsSync(armPath)) {
                fs.mkdirSync(armPath)
            }
            const x86Path = path.join(jniLibsPath, 'x86_64')
            if (!fs.existsSync(x86Path)) {
                fs.mkdirSync(x86Path)
            }
        }
    }

    static copySoFiles(options: {
        release: boolean,
        targets: string[],
        archs: DroidBuildArch[]
    }) {
        for (let a = 0; a < options.archs.length; a++) {
            const arch = options.archs[a]
            for (let i = 0; i < options.targets.length; i++) {
                const target = options.targets[i]
                const fromPath = path.join(droidBuildArchToSwiftBuildFolder(arch), options.release ? 'release' : 'debug', `lib${target}.so`)
                const toPath = path.join(projectDirectory!, 'Library', target.toLowerCase(), 'src', 'main', 'jniLibs', arch, `lib${target}.so`)
                fs.cpSync(fromPath, toPath, { force: true })
                print({
                    verbose: `📑 Copied ${target}/.../${arch}/lib${target}.so`,
                    unbearable: `📑 Copied ${toPath}`,
                })
            }
        }
    }

    static proceedTargets(options: {
        targets: string[]
    }) {
        const begin = '// managed by swiftstreamide: includes-begin'
        const end = '// managed by swiftstreamide: includes-end'
        const settingsGradlePath = path.join(projectDirectory!, 'Library', 'settings.gradle.kts')
        const settingsGradleFile = fs.readFileSync(settingsGradlePath,'utf8')
        if (!settingsGradleFile.includes(begin) || !settingsGradleFile.includes(end)) {
            print(`⚠️ Skipped setting includes in settings.gradle.kts since special tag is missing`, LogLevel.Detailed)
            return
        }
        const before = settingsGradleFile.split(begin)[0]
        const after = settingsGradleFile.split(end)[1]
        let newContent = before
        newContent += begin
        for (let t = 0; t < options.targets.length; t++) {
            const target = options.targets[t]
            newContent += `include(":${target}")`
        }
        newContent += '\n' + end
        newContent += after
        fs.writeFileSync(settingsGradlePath, newContent, 'utf8')
    }

    static async proceedSoDependencies(stream: AndroidStream, options: {
        targets: string[],
        arch: DroidBuildArch,
        swiftVersion: string
    }) {
        for (let i = 0; i < options.targets.length; i++) {
            const target = options.targets[i]
            const soPath = path.join(projectDirectory!, 'Library', target.toLowerCase(), 'src', 'main', 'jniLibs', options.arch, `lib${target}.so`)
            const elfResult = await stream.readelf.neededSoList(soPath)
            if (!elfResult.success) {
                throw elfResult.error ?? new Error(`Unable to extract dependencies from lib${target}.so`)
            }
            const begin = '// managed by swiftstreamide: dependencies-begin'
            const end = '// managed by swiftstreamide: dependencies-end'
            const buildGradlePath = path.join(projectDirectory!, 'Library', target.toLowerCase(), 'build.gradle.kts')
            const buildGradleFile = fs.readFileSync(buildGradlePath,'utf8')
            if (!buildGradleFile.includes(begin) || !buildGradleFile.includes(end)) {
                print(`⚠️ Skipped setting dependencies for lib${target}.so since special tag is missing`, LogLevel.Detailed)
                continue
            }
            let dependencies: string[] = []
            for (let s = 0; s < elfResult.list.length; s++) {
                const so = elfResult.list[s]
                if (AndroidLibraryProject.compression.includes(so) && !dependencies.includes('compression')) {
                    dependencies.push('compression')
                }
                if (AndroidLibraryProject.foundation.includes(so) && !dependencies.includes('foundation')) {
                    dependencies.push('foundation')
                }
                if (AndroidLibraryProject.foundationessentials.includes(so) && !dependencies.includes('foundationessentials')) {
                    dependencies.push('foundationessentials')
                }
                if (AndroidLibraryProject.i18n.includes(so) && !dependencies.includes('i18n')) {
                    dependencies.push('i18n')
                }
                if (AndroidLibraryProject.networking.includes(so) && !dependencies.includes('networking')) {
                    dependencies.push('networking')
                }
                if (AndroidLibraryProject.testing.includes(so) && !dependencies.includes('testing')) {
                    dependencies.push('testing')
                }
                if (AndroidLibraryProject.xml.includes(so) && !dependencies.includes('xml')) {
                    dependencies.push('xml')
                }
            }
            const before = buildGradleFile.split(begin)[0]
            const after = buildGradleFile.split(end)[1]
            let newContent = before
            newContent += begin
            for (let d = 0; d < dependencies.length; d++) {
                const dependency = dependencies[d]
                newContent += `\n    implementation("com.github.swifdroid.runtime-libs:${dependency}:${options.swiftVersion}")`
            }
            newContent += '\n    ' + end
            newContent += after
            fs.writeFileSync(buildGradlePath, newContent, 'utf8')
        }
    }
    static compression: string[] = [
        'liblzma.so',
        'libz.so'
    ]
    static foundation: string[] = [
        'lib_FoundationICU.so',
        'libBlocksRuntime.so',
        'libdispatch.so',
        'libFoundation.so',
        'libiconv.so',
        'libswiftDispatch.so'
    ]
    static foundationessentials: string[] = [
        'libFoundationEssentials.so'
    ]
    static i18n: string[] = [
        'libFoundationInternationalization.so'
    ]
    static networking: string[] = [
        'libcrypto.so',
        'libcurl.so',
        'libFoundationNetworking.so',
        'libnghttp2.so',
        'libnghttp3.so',
        'libssh2.so',
        'libssl.so'
    ]
    static testing: string[] = [
        'libTesting.so',
        'libXCTest.so'
    ]
    static xml: string[] = [
        'libFoundationXML.so',
        'libxml2.so'
    ]
}
