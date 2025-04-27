# stm32-lcd-logo for STM32F746G-DISCO

<img src="https://github.com/apple/swift-embedded-examples/assets/1186214/9e117d81-e808-493e-a20c-7284ea630f37">


❗️ This example was originally designed to build into a Mach-O binary on macOS.  
❗️ As a result, it does not currently build properly inside an Ubuntu container.  
❗️ To support Linux, it needs to be built as an ELF file instead.  
🙏 The Swift Stream community welcomes your help in making this example work on Linux.  
🎯 Specifically, the `Makefile` should be updated to produce an ELF binary.

## Requirements

Everything you need to build the firmware is already pre-installed in this container.

> 💡 **Note:** Flashing the board via `stlink` is **not supported in the container**.

## Building the firmware

**Build it simply via `Build` button.**

Otherwise manually:
```console
make
```

> This will currently fail because the Makefile is still targeting Mach-O.

## Running on Real Hardware

To run the firmware on STM32 board, you will need to install `stlink` on your **host machine** (outside the container).

> Container also includes `stlink` but there is no easy way to bridge usb devices into container yet.

### Step 1: Connect Your Board

Connect the **STM32F746G-DISCO** board to your host machine using a USB cable.

### Step 2: Install `stlink`

#### Debian/Ubuntu

```
sudo apt update
sudo apt install -y stlink-tools
```

#### macOS

```
brew install stlink
```

#### Windows

Open PowerShell

> Press Win + X, then choose Windows PowerShell (Admin)

1. Install Chocolatey (if not already installed)

```
Set-ExecutionPolicy Bypass -Scope Process -Force; `
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; `
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

2. Install ST-Link tools using Chocolatey

Once Chocolatey is installed, just run:
```
choco install stlink -y
```

### Step 3: Flash the Firmware

Once installed, use the following commands from your host terminal to flash the firmware:

```
st-flash --reset write .build/lcd-logo.bin 0x08000000
```

The LCD display on the board should now be showing a bouncing animating Swift logo on a fading background, and the user LED on should be blinking.

Resulting size of the compiled and linked binary follows (3.5 kB of code + 10 kB of pixel data):
```console
size -m .build/lcd-logo

Segment __TEXT: 14376
  Section __text: 3604
  Section __const: 10000
  total 13604
Segment __DATA: 8
  Section __nl_symbol_ptr: 4
  Section __data: 4
  total 8
Segment __VECTORS: 456
  Section __text: 456
  total 456
Segment __LINKEDIT: 1056
total 15896
```
