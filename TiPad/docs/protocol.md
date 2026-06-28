# TiPad serial protocol

TiPad v1 uses USB serial instead of raw keyboard HID. The board sends plain text events, and the desktop app decides what each event does.

## Handshake

```txt
HELLO TIUDECK model=9K1N fw=0.1
```

Supported model values:

- `9K`: nine keys only
- `9K1N`: nine keys plus one rotary knob
- `CUSTOM`: future custom layouts

The app may send:

```txt
PING
```

The board should answer with `HELLO`.

## Input events

```txt
BTN 1 DOWN
BTN 1 UP
BTN 1 TAP
KNOB CW
KNOB CCW
KNOB PRESS
```

The desktop app maps these to:

- `BTN 1 TAP` -> `key1`
- `BTN 9 TAP` -> `key9`
- `KNOB CW` -> `knob_cw`
- `KNOB CCW` -> `knob_ccw`
- `KNOB PRESS` -> `knob_press`

## Planned output events

These are reserved for a future LED/OLED version:

```txt
SET_LED 1 #00ff00
PROFILE Default
BRIGHTNESS 80
```
