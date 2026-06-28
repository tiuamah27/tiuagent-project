# TiPad

TiPad is a lightweight Windows companion app for a custom 9-key macro pad, with optional rotary knob support.

## What is included

- Tauri + React desktop app
- Serial USB device detection
- 9-key and 9-key-plus-knob layouts
- Per-key action editor
- Local JSON config
- Basic Windows actions:
  - shortcut
  - open app/file/folder/URL
  - paste text
  - PowerShell script
  - screenshot
  - volume/media commands
- Arduino Micro / Pro Micro firmware example

## Recommended hardware path

Use USB serial first:

```txt
Pro Micro / Arduino Micro -> USB Serial -> TiPad app -> Windows actions
```

This keeps the hardware simple and lets TiPad handle profiles, custom actions, and future integrations.

## Requirements

- Node.js 22+
- Rust toolchain with Cargo
- Microsoft Visual Studio Build Tools with the C++ workload
- Arduino IDE or `arduino-cli` for firmware upload

Rust was not installed on this machine when the project was generated, so the Tauri native build cannot run until Rust is installed.

## Run the desktop app

```bash
cd TiPad
npm install
npm run tauri dev
```

Frontend-only preview:

```bash
cd TiPad
npm run dev
```

## Firmware

Open:

```txt
firmware/tipad_pro_micro/tipad_pro_micro.ino
```

Select an Arduino Micro or Pro Micro compatible board, then upload.

Default wiring:

```txt
Key 1..9: pins 2,3,4,5,6,7,8,9,10 to GND
Encoder A: pin 14
Encoder B: pin 15
Encoder SW: pin 16 to GND
```

Set this to `0` for a 9-key-only build:

```cpp
#define TIPAD_HAS_KNOB 1
```

## Config location

TiPad stores profile config in the Windows app data config directory for `id.tiu.TiPad`.

## Notes

The current app is the first working foundation. Next useful improvements are automatic profile switching by active process, tray menu behavior, LED feedback, and richer action plugins for OBS, Discord, Spotify, and app-specific controls.
