# nrfx-blink

This example demonstrates how to integrate with the Zephyr SDK via CMake and how to build a Swift firmware application on top of the SDK and its libraries. The example was tested on an nRF52840-DK board but should also work on other Zephyr-supported boards.

<img src="https://github.com/apple/swift-embedded-examples/assets/1186214/ae3ff153-dd33-4460-8a08-4eac442bf7b0">

## Requirements

Everything you need to build the firmware is already pre-installed in this container:

- CMake, Ninja, and other build tools
- The West build system
- Python
- Zephyr SDK/toolchain

> 💡 **Note:** Flashing the board via `nrfjprog` and Segger J-Link is **not supported in the container**.
> We recommend handling all board programming tasks on the **host machine**, where full USB and J-Link support is available.

Python is used **without a virtual environment** to allow build commands to be launched directly from the VS Code extension.

This approach is fine in a containerized environment, but it breaks `west packages pip --install`.

If you ever need to install or update required Python packages manually, run:
```bash
find . -type f -name 'requirements.txt' -print0 | xargs -0 -n1 -I{} pip3 install --break-system-packages -r "{}"

## Building

**Build it simply via `Build` button.**

Otherwise manually:
``` console
rm -rf build
cmake -B build -G Ninja -DBOARD=nrf52840dk/nrf52840 -DUSE_CCACHE=0 .
cmake --build build
```

## Running on Real Hardware

To run the firmware on an nRF52840-DK board, you will need to install Nordic's flashing tools on your **host machine** (outside the container). The container does not include J-Link or `nrfjprog`.

### Step 1: Connect Your Board

Connect the **nRF52840-DK** board to your host machine using a USB cable via the **J-Link connector**.

### Step 2: Install `nrfjprog` and J-Link Tools on Host

#### Debian/Ubuntu

```
# x86_64 version
wget https://nsscprodmedia.blob.core.windows.net/prod/software-and-other-downloads/desktop-software/nrf-command-line-tools/sw/versions-10-x-x/10-24-2/nrf-command-line-tools_10.24.2_amd64.deb -O nrf-tools.deb
# ARM64 version
# https://nsscprodmedia.blob.core.windows.net/prod/software-and-other-downloads/desktop-software/nrf-command-line-tools/sw/versions-10-x-x/10-24-2/nrf-command-line-tools_10.24.2_arm64.deb -O nrf-tools.deb
sudo apt update
sudo apt install -y ./nrf-tools.deb
rm nrf-tools.deb
nrfjprog --version
```

#### macOS

```
brew tap ArmMbed/homebrew-formulae
brew install --cask nordic-nrf-command-line-tools
nrfjprog --version
```

#### Windows

Open PowerShell

> Press Win + X, then choose Windows PowerShell (Admin)

```
$version = "10.24.2"
$arch = "x64" # use "x86" for 32-bit systems (very rare)
$url = "https://nsscprodmedia.blob.core.windows.net/prod/software-and-other-downloads/desktop-software/nrf-command-line-tools/sw/versions-10-x-x/$version/nRF-Command-Line-Tools_${version}_Windows_${arch}.exe"
$installer = "$env:TEMP\nrf-tools.exe"

Invoke-WebRequest -Uri $url -OutFile $installer

Start-Process -FilePath $installer -ArgumentList "/S" -Wait

Remove-Item $installer

nrfjprog --version
```

### Step 3: Flash the Firmware

Once installed, use the following commands from your host terminal to flash the firmware:
```
nrfjprog --recover --program build/zephyr/zephyr.hex --verify
nrfjprog --run
```

> Make sure you're running this from the project directory on your host machine. You may need to copy the zephyr.hex file out of the container if it's not in a shared volume.

If successful, the green LED on the board should start blinking in a pattern.