//===----------------------------------------------------------------------===//
//
// This source file is part of the Swift open source project
//
// Copyright (c) 2023 Apple Inc. and the Swift project authors.
// Licensed under Apache License v2.0 with Runtime Library Exception
//
// See https://swift.org/LICENSE.txt for license information
//
//===----------------------------------------------------------------------===//

// swift-format-ignore-file

extension RP2040Hardware {
    public var resets: Resets {
        Resets(unsafeAddress: 0x4000_c000)
    }

    public struct Resets {
        public struct ResetValue: OptionSet {
            public var rawValue: UInt32

            public init(rawValue: UInt32) {
                self.rawValue = rawValue
            }

            public init() {
                self.init(rawValue: 0x0)
            }

            public static var usbctrl: ResetValue { ResetValue(rawValue: 0x0100_0000) }
            public static var uart1: ResetValue { ResetValue(rawValue: 0x0080_0000) }
            public static var uart0: ResetValue { ResetValue(rawValue: 0x0040_0000) }
            public static var timer: ResetValue { ResetValue(rawValue: 0x0020_0000) }
            public static var tbman: ResetValue { ResetValue(rawValue: 0x0010_0000) }
            public static var sysinfo: ResetValue { ResetValue(rawValue: 0x0008_0000) }
            public static var syscfg: ResetValue { ResetValue(rawValue: 0x0004_0000) }
            public static var spi1: ResetValue { ResetValue(rawValue: 0x0002_0000) }
            public static var spi0: ResetValue { ResetValue(rawValue: 0x0001_0000) }
            public static var rtc: ResetValue { ResetValue(rawValue: 0x0000_8000) }
            public static var pwm: ResetValue { ResetValue(rawValue: 0x0000_4000) }
            public static var pll_usb: ResetValue { ResetValue(rawValue: 0x0000_2000) }
            public static var pll_sys: ResetValue { ResetValue(rawValue: 0x0000_1000) }
            public static var pio1: ResetValue { ResetValue(rawValue: 0x0000_0800) }
            public static var pio0: ResetValue { ResetValue(rawValue: 0x0000_0400) }
            public static var pads_qspi: ResetValue { ResetValue(rawValue: 0x0000_0200) }
            public static var pads_bank0: ResetValue { ResetValue(rawValue: 0x0000_0100) }
            public static var jtag: ResetValue { ResetValue(rawValue: 0x0000_0080) }
            public static var io_qspi: ResetValue { ResetValue(rawValue: 0x0000_0040) }
            public static var io_bank0: ResetValue { ResetValue(rawValue: 0x0000_0020) }
            public static var i2c1: ResetValue { ResetValue(rawValue: 0x0000_0010) }
            public static var i2c0: ResetValue { ResetValue(rawValue: 0x0000_0008) }
            public static var dma: ResetValue { ResetValue(rawValue: 0x0000_0004) }
            public static var busctrl: ResetValue { ResetValue(rawValue: 0x0000_0002) }
            public static var adc: ResetValue { ResetValue(rawValue: 0x0000_0001) }

            public static var all: ResetValue {
                return [
                    .usbctrl,
                    .uart1,
                    .uart0,
                    .timer,
                    .tbman,
                    .sysinfo,
                    .syscfg,
                    .spi1,
                    .spi0,
                    .rtc,
                    .pwm,
                    .pll_usb,
                    .pll_sys,
                    .pio1,
                    .pio0,
                    .pads_qspi,
                    .pads_bank0,
                    .jtag,
                    .io_qspi,
                    .io_bank0,
                    .i2c1,
                    .i2c0,
                    .dma,
                    .busctrl,
                    .adc,
                ]
            }
        }

        let unsafeAddress: UInt

        init(unsafeAddress: UInt) {
            self.unsafeAddress = unsafeAddress
        }

        public var reset: Reset {
            Reset(unsafeAddress: unsafeAddress + 0x0000)
        }

        public var watchdogSelect: WatchdogSelect {
            WatchdogSelect(unsafeAddress: unsafeAddress + 0x0004)
        }

        public var resetDone: ResetDone {
            ResetDone(unsafeAddress: unsafeAddress + 0x0008)
        }

        public struct Reset {
            let unsafeAddress: UInt

            init(unsafeAddress: UInt) {
                self.unsafeAddress = unsafeAddress
            }

            public func set(_ value: ResetValue) {
                RP2040Hardware.write(
                    value.rawValue, to: unsafeAddress | RP2040Hardware.setAliasMask)
            }

            public func clear(_ value: ResetValue) {
                RP2040Hardware.write(
                    value.rawValue, to: unsafeAddress | RP2040Hardware.clearAliasMask)
            }
        }

        public struct WatchdogSelect {
            let unsafeAddress: UInt

            init(unsafeAddress: UInt) {
                self.unsafeAddress = unsafeAddress
            }
        }

        public struct ResetDone {
            let unsafeAddress: UInt

            init(unsafeAddress: UInt) {
                self.unsafeAddress = unsafeAddress
            }

            public var value: ResetValue {
                ResetValue(rawValue: RP2040Hardware.read(UInt32.self, from: unsafeAddress))
            }
        }
    }
}
