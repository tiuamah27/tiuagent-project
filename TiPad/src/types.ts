export type DeviceModel = "9K" | "9K1N" | "CUSTOM";

export type ActionType =
  | "none"
  | "shortcut"
  | "open"
  | "text"
  | "script"
  | "screenshot"
  | "volume"
  | "media";

export type ControlKind = "key" | "knob";

export interface ControlDefinition {
  id: string;
  label: string;
  kind: ControlKind;
}

export interface TipadAction {
  type: ActionType;
  label: string;
  value: string;
}

export interface Profile {
  id: string;
  name: string;
  appMatch: string;
  actions: Record<string, TipadAction>;
}

export interface TipadConfig {
  activeProfileId: string;
  autoSwitch: boolean;
  autoStart: boolean;
  model: DeviceModel;
  profiles: Profile[];
}

export interface SerialPortInfo {
  port_name: string;
  port_type: string;
}

export interface DeviceStatus {
  connected: boolean;
  portName: string | null;
  model: DeviceModel | null;
  firmware: string | null;
  lastEvent: string | null;
}

export interface DeviceEvent {
  raw: string;
  controlId: string | null;
  gesture: string | null;
}
