# ASCIIArt - After Effects Plugin & Live Video Converter

`ASCIIArt` is an Adobe After Effects C++ native plugin (`.aex`) and live interactive web simulator that converts any video into stylized ASCII text art in real time.

---

## 📸 Plugin Interface & Options

The plugin interface matches the After Effects `Effect Controls` panel parameters:

### 1. Resolution Options
* **Block Size**: Sets the grid resolution (pixel sampling size). Lower values increase density/detail; higher values produce a chunkier ASCII look.

### 2. Character Options
* **Character Size**: Adjusts the scale of text characters independently of the block size (0.10 to 5.00).
* **Style Options**: Dropdown to select rendering style (`Pattern 1`, `Pattern 2`, `Binary`, `Blocks`, `Simple`, `GBA Camera`).
* **Reverse text pattern**: Inverts luminance mapping (dark areas mapped to bright characters and vice versa).
* **Letter Size based on brig**: Dynamically scales the font size of each character based on local pixel luminance.

### 3. Color Options
* **Original Color**: Characters inherit original RGB pixel colors from video.
* **Custom Color Start / Custom Color End**: Dual-tone gradient mapping when Original Color is disabled.
* **Background Color**: Solid color fill behind the ASCII characters.
* **Transparent Background**: Renders characters over a transparent alpha channel for easy compositing.

---

## 🛠 Project Structure

```
tunnel anim/
├── native_plugin/           # C++ Native After Effects Plugin Source
│   ├── ASCIIArt.h           # Parameter enums & plugin header
│   ├── ASCIIArt.cpp         # AE SDK setup, render callbacks & rasterizer
│   ├── ASCIIArtPiPL.r       # Plug-in Property List definition
│   ├── ASCIIArt.rc          # Windows resource script
│   └── CMakeLists.txt       # CMake build configuration for Visual Studio
│
├── index.html               # Live Web Simulator (AE Dark Theme UI)
├── style.css                # After Effects UI Styling
├── app.js                   # Canvas video processing engine & ASCII algorithm
└── README.md                # Documentation & compilation guide
```

---

## 🚀 How to Build the Native C++ Plugin (`.aex`)

### Prerequisites
1. **Visual Studio 2022** (with Desktop development with C++).
2. **Adobe After Effects C++ SDK** (Version 2020 or newer). Download from [Adobe I/O Developer Portal](https://developer.adobe.com/after-effects/).

### Building with Visual Studio / CMake:
1. Open Developer Command Prompt for VS 2022.
2. Set your Adobe AE SDK directory:
   ```cmd
   set AESDK_ROOT=C:\path\to\Adobe After Effects SDK
   ```
3. Generate project files with CMake:
   ```cmd
   cd native_plugin
   mkdir build
   cd build
   cmake .. -G "Visual Studio 17 2022" -A x64
   ```
4. Build the plugin:
   ```cmd
   cmake --build . --config Release
   ```
5. Copy the compiled `ASCIIArt.aex` into After Effects plug-in directory:
   ```cmd
   copy Release\ASCIIArt.aex "C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\Plug-ins\"
   ```
6. Launch After Effects! Find the effect under **Effect -> Stylize -> ASCIIArt**.

---

## 🖥️ How to Run as a Standalone Desktop Application

You can run **ASCII Macho** as a native desktop application (without needing any web browser open):

### 1. Run Standalone Desktop App locally:
```bash
npm install
npm start
```
This launches ASCII Macho directly in its own dedicated, hardware-accelerated desktop window with native file dialogs and menus (`File -> Open Video`, `Ctrl+O`).

### 2. Package into a Standalone `.exe` Executable:
```bash
npm run dist
```
This generates a portable Windows `.exe` application under the `dist/` directory that can be run anywhere offline without installing Node.js or a browser.

---

## 🌐 How to Run the Web Simulator

You can also run the web version directly:

1. Open `index.html` directly in any web browser, or host via a local server:
   ```bash
   npm run serve
   ```
2. Click **Upload Video** to select your `.mp4`/`.webm`/`.mov` video, or click **Use Camera** for live webcam ASCII art, or click **Load Motion Demo**!
3. Tweak parameters in the **Effect Controls** panel on the left.
4. Click **Render Video** or **Export Snapshot (PNG)** to save your results.
