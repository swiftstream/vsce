# stm32-uart-echo

This demo is designed to run on an STM32 microcontroller, concretely the STM32F746G Discovery Kit, and implements a simple "echo" service over UART.

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
st-flash --reset write .build/release/Application.bin 0x08000000
```

Open a separate terminal window and run a serial UART monitor program. For example, the macOS built-in `screen` program is able to do that (but there are other popular alternatives, like `minicom`). The ST-LINK device shows up as a "usbmodem" device under `/dev`.
```console
$ screen /dev/cu.usbmodem<...> 115200
```

The other terminal that runs the UART monitoring program should now be showing a "Hello Swift" message and if you type into the terminal, you will see the letter show up (as they are replied back over the UART).
