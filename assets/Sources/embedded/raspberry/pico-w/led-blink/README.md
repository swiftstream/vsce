# pico-w-blink

This example demonstrates how to integrate with the Pico SDK which is using CMake as its build system -- the simplest way to integrate with it is to also use CMake to build a Swift firmware application on top of the SDK and the libraries from it.

<img src="https://github.com/apple/swift-embedded-examples/assets/26223064/a4949a2e-1887-4325-8f5f-a681963c93d7">

## Requirements

Everything you need to build the firmware is already pre-installed in this container including `pico-sdk`.

## Building the firmware as UF2

**Build it simply via `Build` button.**

Otherwise manually:
```console
export PICO_BOARD=pico_w
cmake -B build -G Ninja . -DCMAKE_EXPORT_COMPILE_COMMANDS=On
cmake --build build
```

## Running on Real Hardware

### Step 1: Connect Your Board

Connect the **Pico-W** board to your host machine using a USB cable.

Make sure it's in the USB Mass Storage firmware upload mode (either hold the BOOTSEL button while plugging the board, or make sure your Flash memory doesn't contain any valid firmware).

### Step 2: Copy the Firmware

Copy the `build/swift-blinky.uf2` file to the root of the Mass Storage device to trigger flashing the program into memory (after which the device will reboot and run the firmware).

The green LED should now be blinking in a pattern.
