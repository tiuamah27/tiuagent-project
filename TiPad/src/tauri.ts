import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DeviceEvent, DeviceStatus, SerialPortInfo, TipadAction, TipadConfig } from "./types";
import { createDefaultConfig } from "./defaultConfig";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
  }
}

const isTauri = typeof window.__TAURI_INTERNALS__?.invoke === "function";
const mockStatus: DeviceStatus = {
  connected: false,
  portName: null,
  model: null,
  firmware: null,
  lastEvent: "Preview mode"
};

const mockConfig = {
  load: () => {
    const text = localStorage.getItem("tipad.preview.config");
    return text ? (JSON.parse(text) as TipadConfig) : createDefaultConfig();
  },
  save: (config: TipadConfig) => localStorage.setItem("tipad.preview.config", JSON.stringify(config))
};

export const api = {
  loadConfig: () => (isTauri ? invoke<TipadConfig>("load_config") : Promise.resolve(mockConfig.load())),
  saveConfig: (config: TipadConfig) =>
    isTauri ? invoke<void>("save_config", { config }) : Promise.resolve(mockConfig.save(config)),
  listPorts: () =>
    isTauri
      ? invoke<SerialPortInfo[]>("list_serial_ports")
      : Promise.resolve([{ port_name: "COM_PREVIEW", port_type: "Browser preview" }]),
  connect: (portName: string, baudRate = 115200) =>
    isTauri ? invoke<DeviceStatus>("connect_device", { portName, baudRate }) : Promise.resolve({ ...mockStatus, portName }),
  disconnect: () => (isTauri ? invoke<DeviceStatus>("disconnect_device") : Promise.resolve(mockStatus)),
  status: () => (isTauri ? invoke<DeviceStatus>("device_status") : Promise.resolve(mockStatus)),
  executeAction: (action: TipadAction) => (isTauri ? invoke<void>("execute_action", { action }) : Promise.resolve()),
  setAutostart: (enabled: boolean) => (isTauri ? invoke<void>("set_autostart", { enabled }) : Promise.resolve()),
  onDeviceEvent: (handler: (event: DeviceEvent) => void) =>
    isTauri ? listen<DeviceEvent>("tipad://device-event", (event) => handler(event.payload)) : Promise.resolve(() => undefined)
};
