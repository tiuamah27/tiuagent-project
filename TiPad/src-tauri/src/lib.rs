use directories::ProjectDirs;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serialport::{SerialPortInfo, SerialPortType};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

static DEVICE: Lazy<Mutex<DeviceRuntime>> = Lazy::new(|| Mutex::new(DeviceRuntime::default()));

#[derive(Debug, Default)]
struct DeviceRuntime {
    stop: Option<Arc<AtomicBool>>,
    thread: Option<JoinHandle<()>>,
    status: DeviceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DeviceStatus {
    connected: bool,
    port_name: Option<String>,
    model: Option<String>,
    firmware: Option<String>,
    last_event: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UiSerialPortInfo {
    port_name: String,
    port_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceEvent {
    raw: String,
    control_id: Option<String>,
    gesture: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TipadAction {
    #[serde(rename = "type")]
    action_type: String,
    label: String,
    value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TipadConfig {
    active_profile_id: String,
    auto_switch: bool,
    auto_start: bool,
    model: String,
    profiles: Vec<Profile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    id: String,
    name: String,
    app_match: String,
    actions: serde_json::Value,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("TiPad");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            list_serial_ports,
            connect_device,
            disconnect_device,
            device_status,
            execute_action,
            set_autostart
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TiPad");
}

#[tauri::command]
fn load_config() -> Result<TipadConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(default_config());
    }

    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_config(config: TipadConfig) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<UiSerialPortInfo>, String> {
    let ports = serialport::available_ports().map_err(|error| error.to_string())?;
    Ok(ports.into_iter().map(map_port).collect())
}

#[tauri::command]
fn connect_device(app: AppHandle, port_name: String, baud_rate: u32) -> Result<DeviceStatus, String> {
    disconnect_device()?;

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_port_name = port_name.clone();
    let app_handle = app.clone();

    let handle = thread::spawn(move || {
        let serial = serialport::new(&thread_port_name, baud_rate)
            .timeout(Duration::from_millis(250))
            .open();

        let Ok(mut port) = serial else {
            update_status(|status| {
                status.connected = false;
                status.last_event = Some(format!("Failed to open {}", thread_port_name));
            });
            return;
        };

        let _ = port.write_all(b"PING\n");
        let mut reader = BufReader::new(port);

        update_status(|status| {
            status.connected = true;
            status.port_name = Some(thread_port_name.clone());
            status.last_event = Some("Connected".to_string());
        });

        while !thread_stop.load(Ordering::Relaxed) {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => thread::sleep(Duration::from_millis(25)),
                Ok(_) => {
                    let raw = line.trim().to_string();
                    if raw.is_empty() {
                        continue;
                    }

                    let event = parse_device_event(&raw);
                    update_status(|status| {
                        status.last_event = Some(raw.clone());
                        if raw.starts_with("HELLO ") {
                            for part in raw.split_whitespace() {
                                if let Some(model) = part.strip_prefix("model=") {
                                    status.model = Some(model.to_string());
                                }
                                if let Some(fw) = part.strip_prefix("fw=") {
                                    status.firmware = Some(fw.to_string());
                                }
                            }
                        }
                    });
                    let _ = app_handle.emit("tipad://device-event", event);
                }
                Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {}
                Err(error) => {
                    update_status(|status| {
                        status.connected = false;
                        status.last_event = Some(format!("Serial error: {}", error));
                    });
                    break;
                }
            }
        }

        update_status(|status| {
            status.connected = false;
            status.last_event = Some("Disconnected".to_string());
        });
    });

    let mut runtime = DEVICE.lock().map_err(|error| error.to_string())?;
    runtime.stop = Some(stop);
    runtime.thread = Some(handle);
    runtime.status = DeviceStatus {
        connected: true,
        port_name: Some(port_name),
        model: None,
        firmware: None,
        last_event: Some("Connecting".to_string()),
    };
    Ok(runtime.status.clone())
}

#[tauri::command]
fn disconnect_device() -> Result<DeviceStatus, String> {
    let handle = {
        let mut runtime = DEVICE.lock().map_err(|error| error.to_string())?;
        if let Some(stop) = &runtime.stop {
            stop.store(true, Ordering::Relaxed);
        }
        runtime.stop = None;
        runtime.thread.take()
    };

    if let Some(handle) = handle {
        let _ = handle.join();
    }

    let mut runtime = DEVICE.lock().map_err(|error| error.to_string())?;
    runtime.status.connected = false;
    runtime.status.port_name = None;
    Ok(runtime.status.clone())
}

#[tauri::command]
fn device_status() -> Result<DeviceStatus, String> {
    DEVICE
        .lock()
        .map(|runtime| runtime.status.clone())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn execute_action(action: TipadAction) -> Result<(), String> {
    match action.action_type.as_str() {
        "none" => Ok(()),
        "open" => open_target(&action.value),
        "shortcut" => execute_shortcut(&action.value),
        "text" => paste_text(&action.value),
        "script" => run_powershell(&action.value).map(|_| ()),
        "screenshot" => capture_screenshot(),
        "volume" => volume_action(&action.value),
        "media" => media_action(&action.value),
        other => Err(format!("Unsupported action type: {}", other)),
    }
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    let startup = startup_path()?;
    let launcher = startup.join("TiPad.cmd");
    if enabled {
        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let content = format!("start \"\" \"{}\"\r\n", exe.display());
        fs::create_dir_all(&startup).map_err(|error| error.to_string())?;
        fs::write(launcher, content).map_err(|error| error.to_string())?;
    } else if launcher.exists() {
        fs::remove_file(launcher).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn map_port(port: SerialPortInfo) -> UiSerialPortInfo {
    let port_type = match port.port_type {
        SerialPortType::UsbPort(info) => format!(
            "USB {:04x}:{:04x} {}",
            info.vid,
            info.pid,
            info.product.unwrap_or_else(|| "device".to_string())
        ),
        SerialPortType::BluetoothPort => "Bluetooth".to_string(),
        SerialPortType::PciPort => "PCI".to_string(),
        SerialPortType::Unknown => "Unknown".to_string(),
    };
    UiSerialPortInfo {
        port_name: port.port_name,
        port_type,
    }
}

fn parse_device_event(raw: &str) -> DeviceEvent {
    let mut control_id = None;
    let mut gesture = None;
    let parts: Vec<&str> = raw.split_whitespace().collect();

    match parts.as_slice() {
        ["BTN", number, action] => {
            control_id = Some(format!("key{}", number));
            gesture = Some((*action).to_string());
        }
        ["BTN", number, action, _] => {
            control_id = Some(format!("key{}", number));
            gesture = Some((*action).to_string());
        }
        ["KNOB", "CW"] => {
            control_id = Some("knob_cw".to_string());
            gesture = Some("TICK".to_string());
        }
        ["KNOB", "CCW"] => {
            control_id = Some("knob_ccw".to_string());
            gesture = Some("TICK".to_string());
        }
        ["KNOB", "PRESS"] => {
            control_id = Some("knob_press".to_string());
            gesture = Some("TAP".to_string());
        }
        _ => {}
    }

    DeviceEvent {
        raw: raw.to_string(),
        control_id,
        gesture,
    }
}

fn update_status(update: impl FnOnce(&mut DeviceStatus)) {
    if let Ok(mut runtime) = DEVICE.lock() {
        update(&mut runtime.status);
    }
}

fn open_target(target: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", target])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn paste_text(text: &str) -> Result<(), String> {
    let escaped = text.replace('\'', "''");
    let script = format!(
        "Set-Clipboard -Value '{}'; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        escaped
    );
    run_powershell(&script).map(|_| ())
}

fn execute_shortcut(value: &str) -> Result<(), String> {
    let normalized = value
        .split('+')
        .map(|part| part.trim().to_uppercase())
        .collect::<Vec<_>>()
        .join("+");

    match normalized.as_str() {
        "WIN+L" | "WINDOWS+L" => Command::new("rundll32.exe")
            .args(["user32.dll,LockWorkStation"])
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string()),
        "WIN+D" | "WINDOWS+D" => run_powershell("(New-Object -ComObject Shell.Application).ToggleDesktop()").map(|_| ()),
        "WIN+SHIFT+S" | "WINDOWS+SHIFT+S" => open_target("ms-screenclip:"),
        "CTRL+SHIFT+ESC" | "CONTROL+SHIFT+ESC" => Command::new("taskmgr.exe")
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string()),
        _ => send_keys(&shortcut_to_sendkeys(value)?),
    }
}

fn send_keys(keys: &str) -> Result<(), String> {
    let escaped = keys.replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{}')",
        escaped
    );
    run_powershell(&script).map(|_| ())
}

fn shortcut_to_sendkeys(value: &str) -> Result<String, String> {
    let tokens: Vec<String> = value
        .split('+')
        .map(|part| part.trim().to_uppercase())
        .filter(|part| !part.is_empty())
        .collect();
    if tokens.is_empty() {
        return Err("Shortcut is empty".to_string());
    }

    let mut prefix = String::new();
    let mut key = String::new();
    for token in tokens {
        match token.as_str() {
            "CTRL" | "CONTROL" => prefix.push('^'),
            "ALT" => prefix.push('%'),
            "SHIFT" => prefix.push('+'),
            "WIN" | "WINDOWS" | "META" => prefix.push('^'),
            "." => key.push('.'),
            "SPACE" => key.push_str(" "),
            "PRINTSCREEN" | "PRTSC" => key.push_str("{PRTSC}"),
            "ESC" | "ESCAPE" => key.push_str("{ESC}"),
            "ENTER" => key.push_str("{ENTER}"),
            "TAB" => key.push_str("{TAB}"),
            "BACKSPACE" => key.push_str("{BACKSPACE}"),
            other if other.starts_with('F') => key.push_str(&format!("{{{}}}", other)),
            other if other.len() == 1 => key.push_str(&other.to_lowercase()),
            other => key.push_str(&format!("{{{}}}", other)),
        }
    }

    Ok(format!("{}{}", prefix, key))
}

fn capture_screenshot() -> Result<(), String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$dir = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'TiPad Screenshots'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$path = Join-Path $dir ('tipad-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
"#;
    run_powershell(script).map(|_| ())
}

fn volume_action(value: &str) -> Result<(), String> {
    match value.trim().to_lowercase().as_str() {
        "up" => send_keys("{VOLUMEUP}"),
        "down" => send_keys("{VOLUMEDOWN}"),
        "mute" => send_keys("{VOLUMEMUTE}"),
        other => Err(format!("Unknown volume action: {}", other)),
    }
}

fn media_action(value: &str) -> Result<(), String> {
    match value.trim().to_lowercase().as_str() {
        "play" | "pause" | "playpause" => send_keys("{MEDIA_PLAY_PAUSE}"),
        "next" => send_keys("{MEDIA_NEXT_TRACK}"),
        "previous" | "prev" => send_keys("{MEDIA_PREV_TRACK}"),
        other => Err(format!("Unknown media action: {}", other)),
    }
}

fn run_powershell(script: &str) -> Result<std::process::Output, String> {
    Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|error| error.to_string())
}

fn config_path() -> Result<PathBuf, String> {
    let dirs = ProjectDirs::from("id", "tiu", "TiPad").ok_or("Could not resolve config directory")?;
    Ok(dirs.config_dir().join("config.json"))
}

fn startup_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|error| error.to_string())?;
    Ok(PathBuf::from(appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup"))
}

fn default_config() -> TipadConfig {
    serde_json::from_str(DEFAULT_CONFIG).expect("default config should be valid")
}

const DEFAULT_CONFIG: &str = r#"{
  "activeProfileId": "default",
  "autoSwitch": true,
  "autoStart": false,
  "model": "9K1N",
  "profiles": [
    {
      "id": "default",
      "name": "Default",
      "appMatch": "",
      "actions": {
        "key1": { "type": "shortcut", "label": "Emoji picker", "value": "WIN+." },
        "key2": { "type": "shortcut", "label": "Show desktop", "value": "WIN+D" },
        "key3": { "type": "shortcut", "label": "Full screen", "value": "F11" },
        "key4": { "type": "shortcut", "label": "Lock Windows", "value": "WIN+L" },
        "key5": { "type": "screenshot", "label": "Full screenshot", "value": "fullscreen" },
        "key6": { "type": "shortcut", "label": "Snipping tool", "value": "WIN+SHIFT+S" },
        "key7": { "type": "shortcut", "label": "Capture window", "value": "ALT+PRINTSCREEN" },
        "key8": { "type": "open", "label": "Open Snipping Tool", "value": "ms-screenclip:" },
        "key9": { "type": "shortcut", "label": "Task manager", "value": "CTRL+SHIFT+ESC" },
        "knob_cw": { "type": "volume", "label": "Volume up", "value": "up" },
        "knob_ccw": { "type": "volume", "label": "Volume down", "value": "down" },
        "knob_press": { "type": "volume", "label": "Mute", "value": "mute" }
      }
    }
  ]
}"#;
