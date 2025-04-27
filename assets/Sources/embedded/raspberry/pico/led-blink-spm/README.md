# pico-blink

<img src="https://github.com/apple/swift-embedded-examples/assets/1186214/f2c45c18-f9a4-48b4-a941-1298ecc942cb">


❗️ This example was originally designed to build into a Mach-O binary on macOS.  
❗️ As a result, it does not currently build properly inside an Ubuntu container.  
❗️ To support Linux, it needs to be built as an ELF file instead.  
🙏 The Swift Stream community welcomes your help in making this example work on Linux.  
🎯 Specifically, the `Makefile` should be updated to produce an ELF binary.

## Requirements

Everything you need to build the firmware is already pre-installed in this container including `pico-sdk`.

## Building the firmware

**Build it simply via `Build` button.**

Otherwise manually:
```console
./build.sh
```

> This will currently fail because the `build.sh` is still targeting Mach-O.

## Running on Real Hardware

### Step 1: Connect Your Board

Connect the **Pico** board to your host machine using a USB cable.

Make sure it's in the USB Mass Storage firmware upload mode (either hold the BOOTSEL button while plugging the board, or make sure your Flash memory doesn't contain any valid firmware).

### Step 2: Copy the Firmware

Copy the `build/blinky.uf2` file to the root of the Mass Storage device to trigger flashing the program into memory (after which the device will reboot and run the firmware).

The green LED should now be blinking in a pattern.