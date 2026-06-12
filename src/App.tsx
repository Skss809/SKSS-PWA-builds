/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Package, Smartphone, Settings, Play, Image as ImageIcon, ExternalLink, ShieldCheck, Maximize, Code, Download, FolderOpen } from 'lucide-react';

export default function App() {
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    packageName: '',
    versionName: '1.0.0',
    versionCode: '1',
    orientation: 'auto',
    outputDir: './build',
    splashDuration: '2000',
    appIconUrl: '',
    splashIconUrl: '',
    features: {
      jsApis: true,
      httpsOnly: true,
      externalUrls: true,
      fullScreen: true
    }
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPackageNameCustomized, setIsPackageNameCustomized] = useState(false);
  const [appIcon, setAppIcon] = useState<string | null>(null);
  const [splashIcon, setSplashIcon] = useState<string | null>(null);
  const [finalApkPath, setFinalApkPath] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const isElectronEnv = () => {
    // @ts-ignore
    return typeof window !== 'undefined' && window.require && window.require('electron');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'app' | 'splash') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 512, 512);
          // Auto resize and draw
          ctx.drawImage(img, 0, 0, 512, 512);
          const dataUrl = canvas.toDataURL('image/png');
          
          if (type === 'app') {
            setAppIcon(dataUrl);
            setFormData(prev => ({ ...prev, appIconUrl: dataUrl }));
          } else {
            setSplashIcon(dataUrl);
            setFormData(prev => ({ ...prev, splashIconUrl: dataUrl }));
          }
        }
      };
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const generatePackageName = (url: string, title: string) => {
    try {
      if (!url) return '';
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      let hostname = urlObj.hostname.replace(/^www\./, '');
      const parts = hostname.split('.');
      
      let appStr = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '') : 'app';
      if (!appStr) appStr = 'app';

      if (parts.length >= 2) {
        const domain = parts[parts.length - 2];
        const tld = parts[parts.length - 1];
        return `${tld}.${domain}.${appStr}`;
      } else if (parts.length === 1 && parts[0]) {
        return `com.${parts[0]}.${appStr}`;
      }
    } catch (e) {
      // Ignore URL parsing errors while user is typing
    }
    return '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      
      if (name === 'url' || name === 'title') {
        if (!isPackageNameCustomized) {
          const autoPkg = generatePackageName(next.url, next.title);
          if (autoPkg) next.packageName = autoPkg;
        }
      }
      
      return next;
    });

    if (name === 'packageName') {
      setIsPackageNameCustomized(true);
    }
  };

  const handleCheckboxChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      features: { ...prev.features, [name as keyof typeof prev.features]: !prev.features[name as keyof typeof prev.features] }
    }));
  };

  const handleDirectorySelect = async () => {
    // Check if running in Electron
    // @ts-ignore
    if (window.require && window.require('electron')) {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const dirPath = await ipcRenderer.invoke('select-directory');
      if (dirPath) {
        setFormData(prev => ({ ...prev, outputDir: dirPath }));
      }
    } else {
      // Running in browser, manual input fallback since we can't open native folder picker easily
      const dirPath = prompt('Enter output directory path:', formData.outputDir);
      if (dirPath) {
        setFormData(prev => ({ ...prev, outputDir: dirPath }));
      }
    }
  };

  const handleBuild = async () => {
    if (!formData.url || !formData.title || !formData.packageName) {
      alert('URL, Title, and Package Name are required!');
      return;
    }

    setIsBuilding(true);
    setLogs(['[SYSTEM] Initializing SKSS PWA Build Process...']);
    setProgress(10);
    setFinalApkPath(null);

    // Provide some fake progress updates simply for visual feedback before server responds
    const progressTimer = setInterval(() => {
      setProgress(p => Math.min(p + 5, 90));
    }, 1000);

    try {
      // @ts-ignore
      if (window.require && window.require('electron')) {
        // ELECTRON IPC
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        
        // Listen for logs
        ipcRenderer.on('build-log', (_event: any, msg: string) => {
          setLogs(prev => [...prev, msg]);
        });

        const result = await ipcRenderer.invoke('start-build', formData);
        clearInterval(progressTimer);
        ipcRenderer.removeAllListeners('build-log');

        if (result.success) {
          setProgress(100);
          setLogs(prev => [...prev, `[SUCCESS] Build finished! APK saved at ${result.apkPath}`]);
          setFinalApkPath(result.apkPath);
        } else {
          setLogs(prev => [...prev, `[ERROR] Build failed: ${result.error}`]);
        }
      } else {
        // BROWSER (Vite / Express preview)
        const response = await fetch('/api/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            // Only send image data if needed by backend, this avoids huge payloads 
            // if we are just simulating, but since backend handles it, send it all.
          })
        });

        if (!response.ok) {
           throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'log') {
                setLogs(prev => [...prev, data.message]);
              } else if (data.type === 'done') {
                clearInterval(progressTimer);
                setProgress(100);
                setLogs(prev => [...prev, `[SUCCESS] Build finished! APK simulated at ${data.apkPath}`]);
                setFinalApkPath(data.apkPath);
              } else if (data.type === 'error') {
                clearInterval(progressTimer);
                setLogs(prev => [...prev, `[ERROR] Build failed: ${data.error}`]);
              }
            }
          }
        }
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      setLogs(prev => [...prev, `[CRITICAL ERROR] ${err.message}`]);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-purple-200">
      
      {/* Top Branding Bar */}
      <header className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 text-white shadow-lg p-5 flex items-center shrink-0">
        <Package className="w-8 h-8 mr-4 opacity-90" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">SKSS PWA Builds</h1>
          <p className="text-sm font-medium text-blue-100 opacity-90">Transform your PWA into an Android App</p>
        </div>
      </header>

      {!isElectronEnv() && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 px-6 py-3 text-sm flex items-start sm:items-center shadow-inner">
          <ShieldCheck className="w-5 h-5 mr-3 shrink-0 text-amber-600" />
          <p>
            <strong>Browser Preview Mode:</strong> You are currently using the web-based preview. Because real APK compilation requires the Android SDK and Java on your machine, web builds will output a small <strong>simulated (.txt) APK</strong> for testing. 
            To build real Android 15 compatible APKs, please export this project (Settings &gt; Export to ZIP) and run the Desktop App locally.
          </p>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-y-auto">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold flex items-center mb-6 text-slate-800">
              <Settings className="w-5 h-5 mr-2 text-indigo-600" />
              Application Details
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">Website / PWA URL <span className="text-red-500">*</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type="url" name="url" value={formData.url} onChange={handleChange} 
                    placeholder="https://example.com"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">App Title <span className="text-red-500">*</span></label>
                <input 
                  type="text" name="title" value={formData.title} onChange={handleChange}
                  placeholder="My Awesome App"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">Package Name <span className="text-red-500">*</span></label>
                <input 
                  type="text" name="packageName" value={formData.packageName} onChange={handleChange}
                  placeholder="com.example.app"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">Version Name</label>
                <input 
                  type="text" name="versionName" value={formData.versionName} onChange={handleChange}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-700">Version Code</label>
                <input 
                  type="number" name="versionCode" value={formData.versionCode} onChange={handleChange}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-colors"
                />
              </div>
              
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold flex items-center mb-6 text-slate-800">
                <Smartphone className="w-5 h-5 mr-2 text-indigo-600" />
                Display Settings
              </h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-slate-700">Orientation</label>
                  <select 
                    name="orientation" value={formData.orientation} onChange={handleChange}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <option value="auto">Auto (Responsive)</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-slate-700">Splash Duration (ms)</label>
                  <input 
                    type="number" name="splashDuration" value={formData.splashDuration} onChange={handleChange}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 text-slate-700">App Icon</label>
                    <label className="flex items-center justify-center w-full px-2 py-4 border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 text-center h-24 relative overflow-hidden group">
                      {appIcon ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white p-1">
                           <img src={appIcon} alt="App Icon Preview" className="h-full w-full object-contain rounded-lg shadow-sm" />
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <span className="text-white text-xs font-semibold">Change</span>
                           </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                          <span className="text-xs font-medium">512x512 PNG</span>
                        </div>
                      )}
                      <input type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={(e) => handleImageUpload(e, 'app')} />
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 text-slate-700">Splash Icon</label>
                    <label className="flex items-center justify-center w-full px-2 py-4 border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 text-center h-24 relative overflow-hidden group">
                      {splashIcon ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white p-1">
                           <img src={splashIcon} alt="Splash Icon Preview" className="h-full w-full object-contain rounded-lg shadow-sm" />
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <span className="text-white text-xs font-semibold">Change</span>
                           </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                          <span className="text-xs font-medium">512x512 PNG</span>
                        </div>
                      )}
                      <input type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={(e) => handleImageUpload(e, 'splash')} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
              <h2 className="text-lg font-semibold flex items-center mb-6 text-slate-800">
                <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" />
                Feature Toggles
              </h2>
              
              <div className="space-y-4 flex-1">
                <label className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.features.jsApis} onChange={() => handleCheckboxChange('jsApis')} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 focus:ring-offset-1" />
                  <div className="ml-3">
                    <span className="block text-sm font-semibold text-slate-800">JavaScript APIs</span>
                    <span className="block text-xs text-slate-500">Allow camera, microphone, geolocation</span>
                  </div>
                  <Code className="w-4 h-4 ml-auto text-slate-400" />
                </label>

                <label className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.features.httpsOnly} onChange={() => handleCheckboxChange('httpsOnly')} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 focus:ring-offset-1" />
                  <div className="ml-3">
                    <span className="block text-sm font-semibold text-slate-800">Force HTTPS</span>
                    <span className="block text-xs text-slate-500">Require secure connections</span>
                  </div>
                  <ShieldCheck className="w-4 h-4 ml-auto text-slate-400" />
                </label>

                <label className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.features.fullScreen} onChange={() => handleCheckboxChange('fullScreen')} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 focus:ring-offset-1" />
                  <div className="ml-3">
                    <span className="block text-sm font-semibold text-slate-800">Immersive Full Screen</span>
                    <span className="block text-xs text-slate-500">Hide system navigation bars</span>
                  </div>
                  <Maximize className="w-4 h-4 ml-auto text-slate-400" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Target Directory & Terminal Log */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold flex items-center mb-4 text-slate-800">Output Settings</h2>
            
            <label className="block text-sm font-semibold mb-1.5 text-slate-700">Project Output Directory</label>
            <div className="flex space-x-2">
              <input 
                type="text" readOnly value={formData.outputDir}
                className="flex-1 px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 outline-none text-sm font-mono truncate"
              />
              <button 
                onClick={handleDirectorySelect}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 rounded-2xl blur opacity-30"></div>
            <button
              onClick={handleBuild}
              disabled={isBuilding}
              className={`relative w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg flex items-center justify-center transition-all bg-gradient-to-r ${isBuilding ? 'from-slate-500 to-slate-600 cursor-not-allowed opacity-90' : 'from-indigo-600 via-purple-600 to-indigo-600 hover:shadow-xl hover:scale-[1.01] active:scale-[0.98]'}`}
            >
              {isBuilding ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Building APK...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  Generate APK
                </>
              )}
            </button>
          </div>

          {finalApkPath && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in zoom-in duration-300">
              <div className="flex flex-col overflow-hidden mr-3">
                <span className="text-sm font-bold text-emerald-800">Build Successful!</span>
                <span className="text-xs text-emerald-600 truncate max-w-[200px]" title={finalApkPath}>{finalApkPath}</span>
              </div>
              <button
                onClick={() => {
                  if (isElectronEnv()) {
                    // @ts-ignore
                    const { ipcRenderer } = window.require('electron');
                    ipcRenderer.invoke('open-folder', finalApkPath);
                  } else {
                    window.location.href = `/api/download?path=${encodeURIComponent(finalApkPath)}`;
                  }
                }}
                className="flex items-center px-4 py-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm hover:shadow-md h-fit"
              >
                {isElectronEnv() ? (
                  <><FolderOpen className="w-4 h-4 mr-2" /> Open Folder</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Download APK</>
                )}
              </button>
             </div>
          )}

          {/* Terminal / Progress */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-inner flex flex-col flex-1 min-h-[300px] overflow-hidden">
            <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
              <span className="text-xs font-mono font-semibold text-slate-400">Build Console</span>
              {isBuilding && (
                <div className="text-xs font-mono text-emerald-400">{progress}%</div>
              )}
            </div>
            
            {/* Progress Bar */}
            <div className="h-1 bg-slate-800 shrink-0 relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 space-y-1.5 leading-relaxed bg-[#0d1117] selection:bg-indigo-900">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                  <Package className="w-10 h-10 mb-3" />
                  <p>Awaiting build instructions...</p>
                </div>
              ) : (
                logs.map((log, i) => {
                  let color = "text-slate-300";
                  if (log.includes("[ERROR]") || log.includes("[CRITICAL")) color = "text-red-400";
                  else if (log.includes("[SUCCESS]")) color = "text-emerald-400";
                  else if (log.includes("[INFO]")) color = "text-blue-300";

                  return (
                    <div key={i} className={color}>
                      <span className="opacity-50 mr-2 text-[10px]">
                        {new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                      </span>
                      {log}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

