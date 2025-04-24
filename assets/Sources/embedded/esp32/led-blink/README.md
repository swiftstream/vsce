# Swift Stream ESP32-C6 Led Blink

This example demonstrates how to integrate with the ESP-IDF SDK via CMake and how to use the standard GPIO library to control LED from Swift. 

This example is specifically made for the RISC-V MCUs from ESP32 (**the Xtensa MCUs are not currently supported by Swift**).

# Requirements

Everything you need to build the firmware is already pre-installed in this container including `ESP-IDF`.

# Building the firmware

**Build it simply via `Build` button.**

Otherwise manually:
```
idf.py set-target esp32c6
idf.py build
```

# Running on Wokwi Simulator

Click on `diagram.json` and hit `Play` button.

> Click the Pause button to freeze simulation and display states of GPIOs

# Running on Real Hardware

## Step 1: Connect Your Board

Connect the **ESP32** board to your host machine using a USB cable.

## Step 2: Make sure you have Python on host machine

> ❗️ On your host machine, not in the container

```
python3 --version
pip3 --version
```

If Python or pip are missing, install them first!

### Installation

**Linux**

```
sudo apt update && apt install -y python3 python3-pip
```

**macOS**

```
brew install python3
```

**Windows**

```
winget install --id Python.Python.3 --source winget
```

## Step 3: Check `esptool` on your host machine

To run the firmware on **ESP32** board, you will need to install `esptool` on your **host machine** (outside the container).

```
python3 -m esptool version
```
Should be version 4.1+

If `esptool` is missing, install it first!

### Installation

**Linux**

```
pip3 install --upgrade --user esptool
```

**macOS, Windows**

```
pip install --upgrade esptool
```

## Step 4: Flash the firmware

**❗️ Make sure you are in the project folder**

```
python3 -m esptool --chip esp32c6 -b 460800 \
  --before default_reset --after hard_reset \
  write_flash --flash_mode dio --flash_size 2MB --flash_freq 80m \
  0x0 build/bootloader/bootloader.bin \
  0x8000 build/partition_table/partition-table.bin \
  0x10000 build/main.bin
```

The LED should be blinking now.
