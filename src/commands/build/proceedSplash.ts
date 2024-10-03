import { webber } from "../../extension";
import { TimeMeasure } from "../../helpers/timeMeasureHelper";
import { LogLevel, print } from "../../webber";

export async function proceedSplash(options: { target: string, release: boolean }): Promise<string | undefined> {
    if (!webber) throw `webber is null`
    const timeMeasure = new TimeMeasure()
    print(`🧱 Getting splash`, LogLevel.Detailed)
    var splash = await webber.swift.grabSplash({ target: options.target })
    timeMeasure.finish()
    if (splash)
        print(`Splash code present`, LogLevel.Verbose)
    else
        print(`No splash, skipping`, LogLevel.Verbose)
    print(`🎉 Finished getting splash in ${timeMeasure.time}ms`, LogLevel.Detailed)
    return splash
}