import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false, // 为了演示方便开启，生产环境建议关闭并使用 preload
      webSecurity: false // 允许读取本地文件流
    },
    vibrancy: 'under-window', // macOS 独有效果
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset' // 隐藏标题栏，红绿灯内嵌
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // --- 核心功能：处理打开文件请求 ---
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Movies', extensions: ['mp4', 'webm', 'mkv', 'mov', 'mp3', 'wav'] }]
    })

    if (canceled) {
      return null
    } else {
      return filePaths[0] // 返回选中的第一个文件路径
    }
  })

  // --- 音频波形数据提取功能 ---

  // 获取缓存目录
  const getCacheDir = (): string => {
    const cacheDir = join(tmpdir(), 'videostory-waveform-cache')
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }
    return cacheDir
  }

  // 生成文件的 hash 作为缓存键
  const getFileHash = (filePath: string): string => {
    return createHash('md5').update(filePath).digest('hex')
  }

  // 提取音频波形数据
  ipcMain.handle('audio:extractWaveform', async (event, filePath: string, options?: {
    samples?: number  // 波形采样点数，默认 3000
    channels?: number // 声道数，默认 1（单声道）
  }) => {
    const samples = options?.samples || 3000
    const channels = options?.channels || 1

    try {
      // 检查缓存
      const cacheDir = getCacheDir()
      const fileHash = getFileHash(filePath)
      const cacheFile = join(cacheDir, `${fileHash}_${samples}_${channels}.json`)

      if (existsSync(cacheFile)) {
        console.log('使用缓存的波形数据:', cacheFile)
        const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'))
        return { success: true, data: cached, fromCache: true }
      }

      // 使用 FFmpeg 提取音频数据
      return new Promise((resolve, reject) => {
        if (!ffmpegPath) {
          reject(new Error('FFmpeg not found'))
          return
        }

        const args = [
          '-i', filePath,
          '-ac', channels.toString(),  // 设置声道数
          '-ar', '8000',               // 降低采样率以减少数据量
          '-f', 's16le',               // 输出格式：16位小端 PCM
          '-acodec', 'pcm_s16le',
          'pipe:1'
        ]

        const ffmpeg = spawn(ffmpegPath, args)
        const chunks: Buffer[] = []
        let stderr = ''

        ffmpeg.stdout.on('data', (chunk) => {
          chunks.push(chunk)
        })

        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString()
          // 发送进度信息
          const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2})/)
          if (timeMatch) {
            const [, hours, minutes, seconds] = timeMatch
            const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)
            event.sender.send('audio:extractProgress', { currentTime })
          }
        })

        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            console.error('FFmpeg error:', stderr)
            reject(new Error(`FFmpeg exited with code ${code}`))
            return
          }

          try {
            // 合并所有 buffer
            const buffer = Buffer.concat(chunks)

            // 将 buffer 转换为 Int16 数组
            const audioData = new Int16Array(
              buffer.buffer,
              buffer.byteOffset,
              buffer.length / 2
            )

            // 计算降采样比率
            const blockSize = Math.floor(audioData.length / samples)
            const peaks: number[] = []

            // 提取峰值数据
            for (let i = 0; i < samples; i++) {
              const start = i * blockSize
              const end = Math.min(start + blockSize, audioData.length)
              let max = 0

              for (let j = start; j < end; j++) {
                const abs = Math.abs(audioData[j])
                if (abs > max) max = abs
              }

              // 归一化到 -1 到 1 之间
              peaks.push(max / 32768)
            }

            const result = {
              peaks,
              duration: audioData.length / 8000, // 8000 是采样率
              samples: peaks.length
            }

            // 保存到缓存
            try {
              writeFileSync(cacheFile, JSON.stringify(result))
              console.log('波形数据已缓存:', cacheFile)
            } catch (err) {
              console.warn('缓存写入失败:', err)
            }

            resolve({ success: true, data: result, fromCache: false })
          } catch (err) {
            reject(err)
          }
        })

        ffmpeg.on('error', (err) => {
          reject(err)
        })
      })
    } catch (err) {
      console.error('提取波形数据失败:', err)
      return { success: false, error: (err as Error).message }
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
