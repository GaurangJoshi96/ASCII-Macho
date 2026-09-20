const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1380,
        height: 880,
        minWidth: 1024,
        minHeight: 700,
        title: "🎬 ASCII Macho — Desktop Video Art Studio",
        backgroundColor: '#161616',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Allows loading local video file URIs smoothly
            backgroundThrottling: false // Prevents background render throttling during video export
        }
    });

    // Load local ASCII Macho.html (or fallback to index.html)
    const entryHtml = fs.existsSync(path.join(__dirname, 'ASCII Macho.html')) ? 'ASCII Macho.html' : 'index.html';
    mainWindow.loadFile(path.join(__dirname, entryHtml));

    // Create custom native application menu (matching AE Pro style)
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Video...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [
                                { name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
                                { name: 'All Files', extensions: ['*'] }
                            ]
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            const filePath = result.filePaths[0];
                            mainWindow.webContents.send('open-video-file', filePath);
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Project Documentation',
                    click: async () => {
                        await shell.openPath(path.join(__dirname, 'README.md'));
                    }
                },
                {
                    label: 'About ASCII Macho',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About ASCII Macho Studio',
                            message: 'ASCII Macho — Standalone Video Art Studio',
                            detail: 'Real-time ASCII Video Processing & After Effects Keyframe Renderer.\nVersion 1.0.0'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
