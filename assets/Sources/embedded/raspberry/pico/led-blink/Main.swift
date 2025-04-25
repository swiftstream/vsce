//===----------------------------------------------------------------------===//
//
// This source file is part of the Swift Stream open source project
//
// Licensed under MIT License
//
//===----------------------------------------------------------------------===//

// Check how it blinks in wokwi simulator,
// after successfull build just click on diagram.json
// Build the project to have Swift syntax highlight and autocomplete
@main
struct Main {
    static func main() {
        var ledValue: Bool = false
        
        // Initialize onboard LED
        let onboardLed = UInt32(PICO_DEFAULT_LED_PIN)
        gpio_init(onboardLed)
        gpio_set_dir(onboardLed, true)

        // Initialize external LED
        let externalLed = UInt32(26) // pin 26
        gpio_init(externalLed)
        gpio_set_dir(externalLed, true)

        while true {
            ledValue.toggle()  // Toggles the boolean value
            gpio_put(onboardLed, ledValue) // Enables/disables LED
            gpio_put(externalLed, !ledValue) // Enables/disables LED, uses inverted ledValue
            sleep_ms(250) // Sleep
        }
    }
}
