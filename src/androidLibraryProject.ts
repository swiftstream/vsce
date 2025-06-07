import * as fs from 'fs'
import * as path from 'path'
import Handlebars from 'handlebars'
import { copyFile, readFile } from './helpers/filesHelper'
import { projectDirectory } from './extension'
import { LogLevel, print } from './streams/stream'
import { AndroidStream, DroidBuildArch, droidBuildArchToSwiftBuildFolder } from './streams/android/androidStream'
import { AndroidStreamConfig, Scheme, SoMode } from './androidStreamConfig'
import { getToolchainsList } from './toolchain'
import { DevContainerConfig } from './devContainerConfig'

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
        archs: DroidBuildArch[],
        scheme: Scheme,
        streamConfig: AndroidStreamConfig
    }) {
        for (let a = 0; a < options.archs.length; a++) {
            const arch = options.archs[a]
            for (let i = 0; i < options.targets.length; i++) {
                const target = options.targets[i]
                // copy project .so files
                const fromPath = path.join(droidBuildArchToSwiftBuildFolder(arch), options.release ? 'release' : 'debug', `lib${target}.so`)
                const toFolder = path.join(projectDirectory!, 'Library', target.toLowerCase(), 'src', 'main', 'jniLibs', arch)
                const oldEntries = fs.readdirSync(toFolder, { withFileTypes: true })
                // - cleanup old .so files
                for (const entry of oldEntries) {
                    if (entry.isFile()) {
                        const fullPath = path.join(toFolder, entry.name)
                        fs.unlinkSync(fullPath)
                    }
                }
                const toPath = path.join(toFolder, `lib${target}.so`)
                fs.cpSync(fromPath, toPath, { force: true })
                print({
                    verbose: `📑 Copied ${target}/.../${arch}/lib${target}.so`,
                    unbearable: `📑 Copied ${toPath}`,
                })
                // copy swift .so files
                if (options.streamConfig.config.soMode === SoMode.PickedManually) {
                    const version = DevContainerConfig.swiftVersion()
                    const toolchain = getToolchainsList().android.find((x) => x.version.major === version.major && x.version.minor === version.minor && x.version.patch === version.patch)!
                    const androidSDKFolderName1 = toolchain.artifact_url.split('/').pop()!.replace(/\.tar\.gz$/, '')
                    const sdkPath1 = path.join('/swift/sdks', androidSDKFolderName1)
                    const androidSDKFolderName2 = fs.readdirSync(sdkPath1, { withFileTypes: true }).find(x => x.isDirectory() && x.name.startsWith('swift-') && x.name.endsWith('-sdk'))!.name
                    const sdkPath2 = path.join(sdkPath1, androidSDKFolderName2)
                    const androidSDKSysrootFolderName = fs.readdirSync(sdkPath2, { withFileTypes: true }).find(x => x.isDirectory() && x.name.startsWith('android-') && x.name.endsWith('-sysroot'))!.name
                    const archFolder = () => {
                        switch (arch) {
                            case DroidBuildArch.Arm64: return 'aarch64-linux-android'
                            case DroidBuildArch.ArmEabi: return 'arm-linux-androideabi'
                            case DroidBuildArch.x86_64: return 'x86_64-linux-android'
                        }
                    }
                    const soFilesPath = path.join(sdkPath2, androidSDKSysrootFolderName, 'usr', 'lib', archFolder())
                    let soFiles: string[] = []
                    if (Array.isArray(options.scheme.soFiles)) {
                        soFiles = options.scheme.soFiles
                    } else if (typeof options.scheme.soFiles === 'object' && options.scheme.soFiles !== null) {
                        soFiles = options.scheme.soFiles[target]
                    }
                    for (let s = 0; s < soFiles.length; s++) {
                        const soFile = soFiles[s]
                        const fromPath = path.join(soFilesPath, soFile)
                        const toPath = path.join(toFolder, soFile)
                        fs.cpSync(fromPath, toPath, { force: true })
                        print({
                            verbose: `📑 Copied ${target}/.../${arch}/${soFile}`,
                            unbearable: `📑 Copied ${toPath}`,
                        })
                    }
                }
            }
        }
    }

    static proceedTargets(options: {
        targets: string[]
    }) {
        const begin = '// managed by swiftstreamide: includes-begin'
        const end = '// managed by swiftstreamide: includes-end'
        const settingsGradlePath = path.join(projectDirectory!, 'Library', 'settings.gradle.kts')
        const settingsGradleFile = fs.readFileSync(settingsGradlePath, 'utf8')
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
            newContent += `\ninclude(":${target.toLowerCase()}")`
        }
        newContent += '\n' + end
        newContent += after
        fs.writeFileSync(settingsGradlePath, newContent, 'utf8')
    }

    static updateRootProjectName(name: string) {
        const settingsGradlePath = path.join(projectDirectory!, 'Library', 'settings.gradle.kts')
        let settingsGradleFile = fs.readFileSync(settingsGradlePath, 'utf8')
        settingsGradleFile = settingsGradleFile.replace(
            /^rootProject\.name\s*=\s*["'].*["']/m,
            `rootProject.name = "${name}"`
        )
        fs.writeFileSync(settingsGradlePath, settingsGradleFile, 'utf8')
    }

    static updateSubmodule(options: {
        config: AndroidStreamConfig,
        swiftVersion: string,
        target: string
    }) {
        const buildGradlePath = path.join(projectDirectory!, 'Library', options.target.toLowerCase(), 'build.gradle.kts')
        print({
            verbose: `Updating "${options.target.toLowerCase()}" gradle submodule`,
            unbearable: `Updating "${options.target.toLowerCase()}" gradle submodule at ${buildGradlePath}`
        })
        let buildGradleFile = fs.readFileSync(buildGradlePath, 'utf8')
        const newNamespace = `${options.config.config.packageName}.${options.target.toLowerCase()}`
        buildGradleFile = buildGradleFile.replace(
            /^(\s*)namespace\s*=\s*["'][^"']*["']/m,
            `$1namespace = "${newNamespace}"`
        )
        print(`    setting "namespace" to: ${newNamespace}`, LogLevel.Verbose)
        const newCompileSDK = options.config.config.compileSDK
        buildGradleFile = buildGradleFile.replace(
            /^(\s*)compileSdk\s*=\s*\d+/m,
            `$1compileSdk = ${newCompileSDK}`
        )
        print(`    setting "compileSdk" to: ${newCompileSDK}`, LogLevel.Verbose)
        const newMinSDK = options.config.config.minSDK
        buildGradleFile = buildGradleFile.replace(
            /^(\s*)minSdk\s*=\s*\d+/m,
            `$1minSdk = ${newMinSDK}`
        )
        print(`    setting "minSdk" to: ${newMinSDK}`, LogLevel.Verbose)
        const newJavaVersion = options.config.config.javaVersion
        buildGradleFile = buildGradleFile.replace(
            /^(\s*)sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/m,
            `$1sourceCompatibility = JavaVersion.VERSION_${newJavaVersion}`
        )
        buildGradleFile = buildGradleFile.replace(
            /^(\s*)targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/m,
            `$1targetCompatibility = JavaVersion.VERSION_${newJavaVersion}`
        )
        buildGradleFile = buildGradleFile.replace(
            /^(\s*)jvmTarget\s*=\s*["'][^"']*["']/m,
            `$1jvmTarget = "${newJavaVersion}"`
        )
        print(`    setting Java version to: ${newJavaVersion}`, LogLevel.Verbose)
        buildGradleFile = buildGradleFile.replace(
            /(implementation\(["']com\.github\.swifdroid\.runtime-libs:core:)([^"']+)(["']\))/,
            `$1${options.swiftVersion}$3`
        )
        print(`    setting Swift in "core" dependency to: ${options.swiftVersion}`, LogLevel.Verbose)
        fs.writeFileSync(buildGradlePath, buildGradleFile, 'utf8')
    }

    static removeObsoleteSubmodules(targets: string[]) {
        const libraryPath = path.join(projectDirectory!, 'Library')
        const allEntries = fs.readdirSync(libraryPath, { withFileTypes: true })
        const subfolders = allEntries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
        // Determine which folders should be removed
        const foldersToRemove = subfolders.filter(folder => !targets.map(x => x.toLowerCase()).includes(folder))
        if (foldersToRemove.length > 0) {
            print(`🧹 Removing obsolete submodules`)
            // Delete redundant folders
            for (const folder of foldersToRemove) {
                const fullPath = path.join(libraryPath, folder)
                fs.rmSync(fullPath, { recursive: true, force: true })
                print(`    removed "${folder}"`, LogLevel.Detailed)
            }
        }
    }

    static async proceedSoDependencies(stream: AndroidStream, options: {
        targets: string[],
        arch: DroidBuildArch,
        swiftVersion: string,
        streamConfig: AndroidStreamConfig
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
            const buildGradleFile = fs.readFileSync(buildGradlePath, 'utf8')
            if (!buildGradleFile.includes(begin) || !buildGradleFile.includes(end)) {
                print(`⚠️ Skipped setting dependencies for lib${target}.so since special tag is missing`, LogLevel.Detailed)
                continue
            }
            let dependencies: string[] = []
            if (options.streamConfig.config.soMode === SoMode.Packed) {
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
            }
            const before = buildGradleFile.split(begin)[0]
            const after = buildGradleFile.split(end)[1]
            let newContent = before
            newContent += begin
            if (options.streamConfig.config.soMode === SoMode.Packed) {
                for (let d = 0; d < dependencies.length; d++) {
                    const dependency = dependencies[d]
                    newContent += `\n    implementation("com.github.swifdroid.runtime-libs:${dependency}:${options.swiftVersion}")`
                }
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
