# stm32-blink

This example shows a simple baremetal firmware for an STM32 board that blinks an LED repeatedly. The example does not use any vendor SDKs or external toolchains, the entire firmware is only built from code in this example directory.

<img src="https://github.com/apple/swift-embedded-examples/assets/1186214/739e98fd-a438-4a64-a7aa-9dddee25034b">

## Requirements

Everything you need to build the firmware is already pre-installed in this container.

> 💡 **Note:** Flashing the board via `stlink` is **not supported in the container**.

## Building the firmware as ELF

**Build it simply via `Build` button.**

Otherwise manually:
```console
export STM_BOARD=NUCLEO_F103RB   # or STM32F746G_DISCOVERY
./build-elf.sh
```

## Running on Wokwi Simulator

> It works only for `STM_BOARD=NUCLEO_F103RB`

Click on `diagram.json` and hit `Play` button.

## Running on Real Hardware

To run the firmware on STM32 board, you will need to install `stlink` on your **host machine** (outside the container).

> Container also includes `stlink` but there is no easy way to bridge usb devices into container yet.

### Step 1: Connect Your Board

Connect the **STM32** board to your host machine using a USB cable.

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
st-flash --format ihex --reset write .build/blink.hex
```

> Make sure you're running this from the project directory on your host machine.

- The green LED next to the RESET button should now be blinking in a pattern.

## Binary size

The resulting size of the compiled and linked binary is very small (which shouldn't be surprising given that this toy example only blinks an LED), and demonstrates how the Embedded Swift compilation mode doesn't include unnecessary code or data in the resulting program:

> The following commands works only on macOS and linux

```console
size -m .build/blink

Segment __TEXT: 656
  Section __text: 142
  total 142
Segment __VECTORS: 456
  Section __text: 456
  total 456
Segment __LINKEDIT: 188
total 1300
```

The binary contains only 142 bytes of code! Additionally, the vector table needed by the CPU is actually dominating the size of the final firmware. Note that the `__LINKEDIT` segment is discarded when forming the final `.bin` file, which is 1168 bytes in size:

```console
cat .build/blink.bin | wc -c

    1168
```
