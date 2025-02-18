import { currentStream } from "../../extension";
import { TimeMeasure } from "../../helpers/timeMeasureHelper";
import { Index } from "../../swift";
import { print } from '../../streams/stream';
import { LogLevel } from '../../streams/stream';

export async function proceedIndex(options: { target: string, release: boolean }): Promise<Index | undefined> {
    if (!currentStream) throw `webStream is null`
    const timeMeasure = new TimeMeasure()
    print(`🌎 Getting index`, LogLevel.Detailed)
    var index = await currentStream.swift.grabIndex({ target: options.target })
    timeMeasure.finish()
    if (index)
        print(`Index code present`, LogLevel.Verbose)
    else
        print(`No index, skipping`, LogLevel.Verbose)
    print(`🌎 Got index in ${timeMeasure.time}ms`, LogLevel.Detailed)
    return index
}