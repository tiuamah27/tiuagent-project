import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  Check,
  FolderOpen,
  Keyboard,
  MonitorDot,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
  Trash2,
  Volume2
} from "lucide-react";
import { api } from "./tauri";
import { controlsForModel, createDefaultConfig, emptyAction } from "./defaultConfig";
import { ActionType, DeviceEvent, DeviceStatus, Profile, SerialPortInfo, TipadAction, TipadConfig } from "./types";

const actionTypes: Array<{ value: ActionType; label: string; hint: string }> = [
  { value: "none", label: "None", hint: "Do nothing" },
  { value: "shortcut", label: "Shortcut", hint: "CTRL+SHIFT+S, WIN+L" },
  { value: "open", label: "Open", hint: "File, folder, app, or URL" },
  { value: "text", label: "Text", hint: "Paste saved text" },
  { value: "script", label: "Script", hint: "PowerShell command" },
  { value: "screenshot", label: "Screenshot", hint: "fullscreen" },
  { value: "volume", label: "Volume", hint: "up, down, mute" },
  { value: "media", label: "Media", hint: "play, next, previous" }
];

const defaultStatus: DeviceStatus = {
  connected: false,
  portName: null,
  model: null,
  firmware: null,
  lastEvent: null
};

export function App() {
  const [config, setConfig] = useState<TipadConfig>(createDefaultConfig());
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [status, setStatus] = useState<DeviceStatus>(defaultStatus);
  const [selectedControlId, setSelectedControlId] = useState("key1");
  const [eventLog, setEventLog] = useState<DeviceEvent[]>([]);
  const [message, setMessage] = useState("Ready");

  const activeProfile = useMemo(
    () => config.profiles.find((profile) => profile.id === config.activeProfileId) ?? config.profiles[0],
    [config.activeProfileId, config.profiles]
  );

  const controls = useMemo(() => controlsForModel(config.model), [config.model]);
  const selectedAction = activeProfile?.actions[selectedControlId] ?? emptyAction();

  useEffect(() => {
    api
      .loadConfig()
      .then((loaded) => setConfig(loaded))
      .catch(() => setConfig(createDefaultConfig()));
    refreshPorts();
    api.status().then(setStatus).catch(() => undefined);
    const unlisten = api.onDeviceEvent((event) => {
      setEventLog((old) => [event, ...old].slice(0, 8));
      if (event.controlId) {
        setSelectedControlId(event.controlId);
        const profile = activeProfileRef.current;
        const action = profile?.actions[event.controlId];
        if (action && event.gesture !== "DOWN") {
          api.executeAction(action).catch((error) => setMessage(String(error)));
        }
      }
      api.status().then(setStatus).catch(() => undefined);
    });
    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, []);

  const activeProfileRef = useLatest(activeProfile);

  const updateConfig = (updater: (draft: TipadConfig) => TipadConfig) => {
    setConfig((current) => updater(structuredClone(current)));
  };

  const persist = async () => {
    await api.saveConfig(config);
    await api.setAutostart(config.autoStart);
    setMessage("Config saved");
  };

  const refreshPorts = async () => {
    const nextPorts = await api.listPorts().catch(() => []);
    setPorts(nextPorts);
    if (!selectedPort && nextPorts.length > 0) setSelectedPort(nextPorts[0].port_name);
  };

  const connect = async () => {
    if (!selectedPort) return;
    const nextStatus = await api.connect(selectedPort);
    setStatus(nextStatus);
    setMessage(`Connected to ${selectedPort}`);
  };

  const disconnect = async () => {
    const nextStatus = await api.disconnect();
    setStatus(nextStatus);
    setMessage("Disconnected");
  };

  const updateSelectedAction = (patch: Partial<TipadAction>) => {
    if (!activeProfile) return;
    updateConfig((draft) => ({
      ...draft,
      profiles: draft.profiles.map((profile) =>
        profile.id === activeProfile.id
          ? {
              ...profile,
              actions: {
                ...profile.actions,
                [selectedControlId]: {
                  ...emptyAction(),
                  ...profile.actions[selectedControlId],
                  ...patch
                }
              }
            }
          : profile
      )
    }));
  };

  const addProfile = () => {
    const id = crypto.randomUUID();
    const profile: Profile = {
      id,
      name: `Profile ${config.profiles.length + 1}`,
      appMatch: "",
      actions: {}
    };
    updateConfig((draft) => ({ ...draft, activeProfileId: id, profiles: [...draft.profiles, profile] }));
  };

  const deleteProfile = () => {
    if (config.profiles.length <= 1 || !activeProfile) return;
    updateConfig((draft) => {
      const profiles = draft.profiles.filter((profile) => profile.id !== activeProfile.id);
      return { ...draft, profiles, activeProfileId: profiles[0].id };
    });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <h1>TiPad</h1>
            <p>Desktop macro pad</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <Cable size={18} />
            <span>Device</span>
          </div>
          <label>
            Port
            <div className="inline-row">
              <select value={selectedPort} onChange={(event) => setSelectedPort(event.target.value)}>
                {ports.length === 0 ? <option>No serial ports</option> : null}
                {ports.map((port) => (
                  <option key={port.port_name} value={port.port_name}>
                    {port.port_name}
                  </option>
                ))}
              </select>
              <button className="icon-button" onClick={refreshPorts} title="Refresh ports">
                <RefreshCw size={17} />
              </button>
            </div>
          </label>
          <button className={status.connected ? "secondary" : "primary"} onClick={status.connected ? disconnect : connect}>
            <Power size={17} />
            {status.connected ? "Disconnect" : "Connect"}
          </button>
          <div className="status-card">
            <span className={status.connected ? "dot live" : "dot"} />
            <span>{status.connected ? status.portName : "Not connected"}</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <MonitorDot size={18} />
            <span>Profiles</span>
          </div>
          <select
            value={config.activeProfileId}
            onChange={(event) => updateConfig((draft) => ({ ...draft, activeProfileId: event.target.value }))}
          >
            {config.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <div className="inline-row">
            <button className="secondary" onClick={addProfile}>
              <Plus size={16} />
              Add
            </button>
            <button className="ghost" onClick={deleteProfile}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </section>

        <button className="save-button" onClick={persist}>
          <Save size={18} />
          Save config
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Windows companion app</p>
            <h2>{activeProfile?.name ?? "Profile"}</h2>
          </div>
          <div className="topbar-actions">
            <label className="switch">
              <input
                type="checkbox"
                checked={config.autoSwitch}
                onChange={(event) => updateConfig((draft) => ({ ...draft, autoSwitch: event.target.checked }))}
              />
              Auto switch
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={config.autoStart}
                onChange={(event) => updateConfig((draft) => ({ ...draft, autoStart: event.target.checked }))}
              />
              Auto start
            </label>
          </div>
        </header>

        <div className="content-grid">
          <section className="device-board">
            <div className="board-toolbar">
              <div>
                <h3>Controls</h3>
                <p>{status.lastEvent ?? message}</p>
              </div>
              <select
                value={config.model}
                onChange={(event) => updateConfig((draft) => ({ ...draft, model: event.target.value as TipadConfig["model"] }))}
              >
                <option value="9K1N">9 keys + knob</option>
                <option value="9K">9 keys only</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="pad-frame">
              <div className="key-grid">
                {controls
                  .filter((control) => control.kind === "key")
                  .map((control) => (
                    <button
                      key={control.id}
                      className={`pad-key ${selectedControlId === control.id ? "selected" : ""}`}
                      onClick={() => setSelectedControlId(control.id)}
                    >
                      <span>{control.label}</span>
                      <small>{activeProfile?.actions[control.id]?.label ?? "No action"}</small>
                    </button>
                  ))}
              </div>
              {config.model !== "9K" ? (
                <div className="knob-zone">
                  <button
                    className={`knob ${selectedControlId === "knob_press" ? "selected" : ""}`}
                    onClick={() => setSelectedControlId("knob_press")}
                  >
                    <Volume2 size={22} />
                  </button>
                  <div className="knob-buttons">
                    <button onClick={() => setSelectedControlId("knob_ccw")}>-</button>
                    <button onClick={() => setSelectedControlId("knob_cw")}>+</button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="editor">
            <div className="panel-title">
              <SlidersHorizontal size={18} />
              <span>Action editor</span>
            </div>
            <label>
              Display name
              <input value={selectedAction.label} onChange={(event) => updateSelectedAction({ label: event.target.value })} />
            </label>
            <label>
              Action type
              <select
                value={selectedAction.type}
                onChange={(event) => updateSelectedAction({ type: event.target.value as ActionType })}
              >
                {actionTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <textarea
                rows={4}
                placeholder={actionTypes.find((type) => type.value === selectedAction.type)?.hint}
                value={selectedAction.value}
                onChange={(event) => updateSelectedAction({ value: event.target.value })}
              />
            </label>
            <div className="inline-row">
              <button className="primary" onClick={() => api.executeAction(selectedAction)}>
                <Play size={17} />
                Test
              </button>
              <button className="secondary" onClick={() => updateSelectedAction(emptyAction())}>
                <Trash2 size={17} />
                Clear
              </button>
            </div>

            <div className="profile-settings">
              <div className="panel-title">
                <Settings size={18} />
                <span>Profile settings</span>
              </div>
              <label>
                Profile name
                <input
                  value={activeProfile?.name ?? ""}
                  onChange={(event) =>
                    updateConfig((draft) => ({
                      ...draft,
                      profiles: draft.profiles.map((profile) =>
                        profile.id === activeProfile?.id ? { ...profile, name: event.target.value } : profile
                      )
                    }))
                  }
                />
              </label>
              <label>
                App match
                <input
                  placeholder="obs64.exe, chrome.exe"
                  value={activeProfile?.appMatch ?? ""}
                  onChange={(event) =>
                    updateConfig((draft) => ({
                      ...draft,
                      profiles: draft.profiles.map((profile) =>
                        profile.id === activeProfile?.id ? { ...profile, appMatch: event.target.value } : profile
                      )
                    }))
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <section className="event-strip">
          <div className="panel-title">
            <Keyboard size={18} />
            <span>Latest events</span>
          </div>
          <div className="events">
            {eventLog.length === 0 ? <span>No hardware events yet</span> : null}
            {eventLog.map((event, index) => (
              <code key={`${event.raw}-${index}`}>{event.raw}</code>
            ))}
          </div>
          <div className="path-hint">
            <FolderOpen size={16} />
            Config is stored in the Windows app data folder.
            <Check size={16} />
          </div>
        </section>
      </section>
    </main>
  );
}

function useLatest<T>(value: T) {
  const [box] = useState({ current: value });
  box.current = value;
  return box;
}
