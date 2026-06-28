import { ControlDefinition, Profile, TipadConfig, TipadAction } from "./types";

export const controls9K: ControlDefinition[] = Array.from({ length: 9 }, (_, index) => ({
  id: `key${index + 1}`,
  label: `${index + 1}`,
  kind: "key"
}));

export const controls9K1N: ControlDefinition[] = [
  ...controls9K,
  { id: "knob_cw", label: "Knob +", kind: "knob" },
  { id: "knob_ccw", label: "Knob -", kind: "knob" },
  { id: "knob_press", label: "Knob", kind: "knob" }
];

export const emptyAction = (label = "No action"): TipadAction => ({
  type: "none",
  label,
  value: ""
});

const defaultActions: Record<string, TipadAction> = {
  key1: { type: "shortcut", label: "Emoji picker", value: "WIN+." },
  key2: { type: "shortcut", label: "Show desktop", value: "WIN+D" },
  key3: { type: "shortcut", label: "Full screen", value: "F11" },
  key4: { type: "shortcut", label: "Lock Windows", value: "WIN+L" },
  key5: { type: "screenshot", label: "Full screenshot", value: "fullscreen" },
  key6: { type: "shortcut", label: "Snipping tool", value: "WIN+SHIFT+S" },
  key7: { type: "shortcut", label: "Capture window", value: "ALT+PRINTSCREEN" },
  key8: { type: "open", label: "Open Snipping Tool", value: "ms-screenclip:" },
  key9: { type: "shortcut", label: "Task manager", value: "CTRL+SHIFT+ESC" },
  knob_cw: { type: "volume", label: "Volume up", value: "up" },
  knob_ccw: { type: "volume", label: "Volume down", value: "down" },
  knob_press: { type: "volume", label: "Mute", value: "mute" }
};

export const createDefaultProfile = (): Profile => ({
  id: "default",
  name: "Default",
  appMatch: "",
  actions: defaultActions
});

export const createDefaultConfig = (): TipadConfig => ({
  activeProfileId: "default",
  autoSwitch: true,
  autoStart: false,
  model: "9K1N",
  profiles: [createDefaultProfile()]
});

export const controlsForModel = (model: TipadConfig["model"]) => {
  if (model === "9K") return controls9K;
  return controls9K1N;
};
