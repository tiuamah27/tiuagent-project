/*
  TiPad firmware v0.1

  Board target:
  - Arduino Micro / Pro Micro ATmega32u4
  - 9 momentary keys wired to GND
  - Optional EC11-style rotary encoder with push switch

  Serial protocol:
  HELLO TIUDECK model=9K1N fw=0.1
  BTN 1 DOWN
  BTN 1 UP
  BTN 1 TAP
  KNOB CW
  KNOB CCW
  KNOB PRESS
*/

#define TIPAD_HAS_KNOB 1

const char* MODEL_NAME = TIPAD_HAS_KNOB ? "9K1N" : "9K";
const char* FIRMWARE_VERSION = "0.1";

const uint8_t KEY_COUNT = 9;
const uint8_t KEY_PINS[KEY_COUNT] = {2, 3, 4, 5, 6, 7, 8, 9, 10};

const uint8_t ENCODER_A_PIN = 14;
const uint8_t ENCODER_B_PIN = 15;
const uint8_t ENCODER_SW_PIN = 16;

const unsigned long DEBOUNCE_MS = 18;
const unsigned long HELLO_INTERVAL_MS = 2500;

struct ButtonState {
  bool stablePressed;
  bool lastReading;
  unsigned long changedAt;
};

ButtonState keys[KEY_COUNT];
ButtonState knobSwitch;

int lastEncoderState = 0;
unsigned long lastHelloAt = 0;

void setup() {
  Serial.begin(115200);

  for (uint8_t index = 0; index < KEY_COUNT; index++) {
    pinMode(KEY_PINS[index], INPUT_PULLUP);
    keys[index] = {false, false, 0};
  }

#if TIPAD_HAS_KNOB
  pinMode(ENCODER_A_PIN, INPUT_PULLUP);
  pinMode(ENCODER_B_PIN, INPUT_PULLUP);
  pinMode(ENCODER_SW_PIN, INPUT_PULLUP);
  knobSwitch = {false, false, 0};
  lastEncoderState = readEncoderState();
#endif

  sendHello();
}

void loop() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command == "PING") {
      sendHello();
    }
  }

  for (uint8_t index = 0; index < KEY_COUNT; index++) {
    updateButton(keys[index], digitalRead(KEY_PINS[index]) == LOW, index + 1);
  }

#if TIPAD_HAS_KNOB
  updateEncoder();
  updateKnobSwitch();
#endif

  if (millis() - lastHelloAt > HELLO_INTERVAL_MS) {
    sendHello();
  }
}

void sendHello() {
  Serial.print("HELLO TIUDECK model=");
  Serial.print(MODEL_NAME);
  Serial.print(" fw=");
  Serial.println(FIRMWARE_VERSION);
  lastHelloAt = millis();
}

void updateButton(ButtonState& state, bool readingPressed, uint8_t keyNumber) {
  unsigned long now = millis();

  if (readingPressed != state.lastReading) {
    state.lastReading = readingPressed;
    state.changedAt = now;
  }

  if ((now - state.changedAt) < DEBOUNCE_MS) {
    return;
  }

  if (readingPressed == state.stablePressed) {
    return;
  }

  state.stablePressed = readingPressed;

  Serial.print("BTN ");
  Serial.print(keyNumber);
  Serial.print(' ');
  Serial.println(readingPressed ? "DOWN" : "UP");

  if (!readingPressed) {
    Serial.print("BTN ");
    Serial.print(keyNumber);
    Serial.println(" TAP");
  }
}

#if TIPAD_HAS_KNOB
int readEncoderState() {
  return (digitalRead(ENCODER_A_PIN) << 1) | digitalRead(ENCODER_B_PIN);
}

void updateEncoder() {
  int currentState = readEncoderState();
  if (currentState == lastEncoderState) {
    return;
  }

  if ((lastEncoderState == 0b00 && currentState == 0b01) ||
      (lastEncoderState == 0b01 && currentState == 0b11) ||
      (lastEncoderState == 0b11 && currentState == 0b10) ||
      (lastEncoderState == 0b10 && currentState == 0b00)) {
    Serial.println("KNOB CW");
  } else if (
      (lastEncoderState == 0b00 && currentState == 0b10) ||
      (lastEncoderState == 0b10 && currentState == 0b11) ||
      (lastEncoderState == 0b11 && currentState == 0b01) ||
      (lastEncoderState == 0b01 && currentState == 0b00)) {
    Serial.println("KNOB CCW");
  }

  lastEncoderState = currentState;
}

void updateKnobSwitch() {
  bool readingPressed = digitalRead(ENCODER_SW_PIN) == LOW;
  unsigned long now = millis();

  if (readingPressed != knobSwitch.lastReading) {
    knobSwitch.lastReading = readingPressed;
    knobSwitch.changedAt = now;
  }

  if ((now - knobSwitch.changedAt) < DEBOUNCE_MS) {
    return;
  }

  if (readingPressed == knobSwitch.stablePressed) {
    return;
  }

  knobSwitch.stablePressed = readingPressed;
  if (!readingPressed) {
    Serial.println("KNOB PRESS");
  }
}
#endif
