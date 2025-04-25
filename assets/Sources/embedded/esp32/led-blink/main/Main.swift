//===----------------------------------------------------------------------===//
//
// This source file is part of the Swift Stream open source project
//
// Licensed under MIT License
//
//===----------------------------------------------------------------------===//

// Check how it blinks in wokwi simulator,
// after successfull build just click on diagram.json.
// Build the project to have Swift syntax highlight and autocomplete.
@_cdecl("app_main")
func main() {
    print("Hello from Swift on ESP32-C6!")

    var ledValue: Bool = false
    
    let blinkDelayMs: UInt32 = 500
    
    // Simple LED (one color)
    let simpleLed = Led(gpioPin: 10)
    
    // Neopixel (multicolor) based on devkit board (on pin 8)
    let onboardNeopixel = Neopixel(gpioPin: 8, mode: .rmt)
    onboardNeopixel.clear()
    
    // Neopixel (multicolor) external, connected to pin 9
    let connectedNeopixel = Neopixel(gpioPin: 9, mode: .rmt)
    connectedNeopixel.clear()
    
    while true {
        ledValue.toggle()  // Toggles the boolean value

        simpleLed.setLed(value: !ledValue) // Enables/disables simple LED
        
        if ledValue {
            print("ON") // Prints into console
            onboardNeopixel.setPixel(color: .green) // Set color of the onboard neopixel
            onboardNeopixel.refresh() // Refresh state of the onboard neopixel
            connectedNeopixel.setPixel(color: .red) // Set color of the external neopixel
            connectedNeopixel.refresh() // Refresh state of the external neopixel
        } else {
            print("OFF")
            onboardNeopixel.clear() // Clear state (disable it) of the onboard neopixel
            connectedNeopixel.clear() // Clear state (disable it) of the external neopixel
        }

        vTaskDelay(blinkDelayMs / (1000 / UInt32(configTICK_RATE_HZ))) // Sleep
    }
}