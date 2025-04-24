//===----------------------------------------------------------------------===//
//
// This source file is part of the Swift Stream open source project
//
// Licensed under MIT License
//
//===----------------------------------------------------------------------===//

// A simple "overlay" to provide nicer APIs in Swift
struct Neopixel {
    private let handle: led_strip_handle_t

    enum Mode {
        case spi, rmt
    }

    init(gpioPin: Int, mode: Mode) {
        var handle = led_strip_handle_t(bitPattern: 0)
        var pixelConfig = led_strip_config_t(
            strip_gpio_num: Int32(gpioPin),
            max_leds: UInt32(1),
            led_pixel_format: LED_PIXEL_FORMAT_GRB,
            led_model: LED_MODEL_WS2812,
            flags: .init(invert_out: 0)
        )
        switch mode {
            case .rmt:
                var rmt_config = led_strip_rmt_config_t(
                    clk_src: RMT_CLK_SRC_DEFAULT,
                    resolution_hz: 10 * 1000 * 1000, // 10MHz
                    mem_block_symbols: 0,
                    flags: .init(with_dma: 1)
                )
                rmt_config.flags.with_dma = 0
                guard led_strip_new_rmt_device(&pixelConfig, &rmt_config, &handle) == ESP_OK
                    else { fatalError("cannot configure rmt device") }
            case .spi:
                var spiConfig = led_strip_spi_config_t(
                    clk_src: SPI_CLK_SRC_DEFAULT,
                    spi_bus: SPI2_HOST, // Because SPI1 is never available
                    flags: .init(with_dma: 1)
                )
                guard led_strip_new_spi_device(&pixelConfig, &spiConfig, &handle) == ESP_OK
                    else { fatalError("cannot configure spi device") }
        }
        guard let handle = handle else { fatalError("handle is nil") }
        self.handle = handle
    }

    struct Color {
        static var white = Color(r: 255, g: 255, b: 255)
        static var lightWhite = Color(r: 16, g: 16, b: 16)
        static var red = Color(r: 80, g: 0, b: 0)
        static var green = Color(r: 0, g: 80, b: 0)
        static var lightRandom: Color {
            Color(
                r: .random(in: 0...16),
                g: .random(in: 0...16),
                b: .random(in: 0...16)
            )
        }
        static var off = Color(r: 0, g: 0, b: 0)

        var r, g, b: UInt8
    }

    func setPixel(color: Color) {
        led_strip_set_pixel(
            handle, UInt32(0), UInt32(color.r), UInt32(color.g), UInt32(color.b)
        )
    }

    func refresh() { led_strip_refresh(handle) }

    func clear() { led_strip_clear(handle) }
}
