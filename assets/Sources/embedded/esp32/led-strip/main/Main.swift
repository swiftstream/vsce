//===----------------------------------------------------------------------===//
//
// This source file is part of the Swift Stream open source project
//
// Licensed under MIT License
//
//===----------------------------------------------------------------------===//

// Check how it works in wokwi simulator,
// after successfull build just click on diagram.json.
// Build the project to have Swift syntax highlight and autocomplete.
@_cdecl("app_main")
func main() {
    print("Hello from Swift on ESP32-C6!")

    let n = 8
    let ledStrip = LedStrip(gpioPin: 0, maxLeds: n)
    ledStrip.clear()

    var colors: [LedStrip.Color] = [.green, .red, .green, .red, .green, .red, .green, .red, .green, .red, .green]

    while true {
        colors.removeLast()
        colors.insert(colors.first == .red ? .green : .red, at: 0)

        for index in 0..<n {
            ledStrip.setPixel(index: index, color: colors[index])
        }
        
        ledStrip.refresh()

        let blinkDelayMs: UInt32 = 500

        vTaskDelay(blinkDelayMs / (1000 / UInt32(configTICK_RATE_HZ)))
    }
}
