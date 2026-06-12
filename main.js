import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBubblewrapBuild } from './bubblewrap-cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: 'SKSS PWA Builds',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity in this project structure
    }
  });

  // If we are in dev mode with Vite
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, we would load the index.html from dist
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
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

// Handle directory selection
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

// Handle opening folders
ipcMain.handle('open-folder', async (event, dirOrFile) => {
  shell.showItemInFolder(dirOrFile);
});

// Handle the build process
ipcMain.handle('start-build', async (event, options) => {
  try {
    const apkPath = await runBubblewrapBuild(options, (msg) => {
      // Send log messages back to the renderer
      mainWindow.webContents.send('build-log', msg);
    });
    return { success: true, apkPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
