import WaveSurfer from 'wavesurfer.js'
import Artplayer from 'artplayer'
import type { WaveformData } from '../../preload/index.d'

const btnOpen = document.getElementById('btnOpen') as HTMLButtonElement
const fileNameSpan = document.getElementById('fileName') as HTMLSpanElement
const waveformLoadingDiv = document.getElementById('waveform-loading') as HTMLDivElement
const loadingProgressDiv = document.getElementById('loading-progress') as HTMLDivElement
const zoomInBtn = document.getElementById('zoomIn') as HTMLButtonElement
const zoomOutBtn = document.getElementById('zoomOut') as HTMLButtonElement
const zoomResetBtn = document.getElementById('zoomReset') as HTMLButtonElement
const zoomLevelSpan = document.getElementById('zoomLevel') as HTMLSpanElement

let art: Artplayer | null = null
let wavesurfer: WaveSurfer | null = null
let currentZoom = 1 // 当前缩放级别，1 = 100%, 2 = 200%, 等等

// 提取音频波形数据
async function extractWaveformData(filePath: string): Promise<WaveformData | null> {
  try {
    // 显示加载提示
    waveformLoadingDiv.style.display = 'block'
    loadingProgressDiv.textContent = '正在提取音频数据...'

    // 监听进度更新
    window.electron.ipcRenderer.on('audio:extractProgress', (_event, data) => {
      const minutes = Math.floor(data.currentTime / 60)
      const seconds = Math.floor(data.currentTime % 60)
      loadingProgressDiv.textContent = `处理进度: ${minutes}:${seconds.toString().padStart(2, '0')}`
    })

    // 调用主进程提取波形数据
    const result = await window.electron.ipcRenderer.invoke('audio:extractWaveform', filePath, {
      samples: 3000,  // 3000 个采样点，足够绘制平滑的波形
      channels: 1     // 单声道
    })

    // 隐藏加载提示
    waveformLoadingDiv.style.display = 'none'

    if (!result.success) {
      console.error('波形数据提取失败:', result.error)
      return null
    }

    if (result.fromCache) {
      console.log('使用缓存的波形数据')
    } else {
      console.log('已生成新的波形数据')
    }

    return result.data || null
  } catch (err) {
    console.error('提取波形数据时出错:', err)
    waveformLoadingDiv.style.display = 'none'
    return null
  }
}

// 更新缩放级别显示
function updateZoomDisplay(): void {
  const zoomPercentage = Math.round(currentZoom * 100)
  zoomLevelSpan.textContent = `${zoomPercentage}%`
}

// 设置缩放级别
function setZoom(zoom: number): void {
  if (!wavesurfer) return

  // 限制缩放范围：50% 到 2000%
  currentZoom = Math.max(0.5, Math.min(20, zoom))

  // 获取容器宽度和波形总时长
  const container = document.querySelector('#waveform') as HTMLElement
  if (!container) return

  const containerWidth = container.clientWidth
  const duration = wavesurfer.getDuration()

  if (duration === 0) return

  // 计算基准 pxPerSec：让波形正好填充容器
  const basePxPerSec = containerWidth / duration

  // 应用缩放倍数
  const minPxPerSec = basePxPerSec * currentZoom

  // 获取当前播放位置
  const currentTime = wavesurfer.getCurrentTime()

  // 应用缩放
  wavesurfer.zoom(minPxPerSec)

  // 恢复播放位置（缩放后可能会偏移）
  setTimeout(() => {
    if (wavesurfer) {
      wavesurfer.setTime(currentTime)
    }
  }, 10)

  updateZoomDisplay()
}

// 放大
function zoomIn(): void {
  setZoom(currentZoom * 1.2)
}

// 缩小
function zoomOut(): void {
  setZoom(currentZoom / 1.2)
}

// 重置缩放
function zoomReset(): void {
  setZoom(1)
}

// 使用预提取的波形数据初始化 WaveSurfer
function initWaveSurferWithPeaks(waveformData: WaveformData): void {
  if (wavesurfer) {
    wavesurfer.destroy()
  }

  // 重置缩放级别
  currentZoom = 1

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#4a4a4a',
    progressColor: '#007aff',
    cursorColor: '#ffffff',
    height: 80,
    barWidth: 2,
    barGap: 1,
    normalize: true,
    // 不设置 minPxPerSec，让波形默认填充整个容器
  })

  // 纯粹绘制波形，不输出音频
  wavesurfer.setVolume(0)

  // 点击波形图跳转视频进度
  wavesurfer.on('interaction', (newTime) => {
    if (art) {
      art.seek = newTime
    }
  })

  // 使用预提取的峰值数据加载波形
  // 创建一个虚拟的音频上下文来设置持续时间
  wavesurfer.load('', [waveformData.peaks], waveformData.duration)

  // 设置缩放按钮事件
  zoomInBtn.onclick = zoomIn
  zoomOutBtn.onclick = zoomOut
  zoomResetBtn.onclick = zoomReset

  // 添加滚轮缩放支持
  const waveformContainer = document.querySelector('#waveform') as HTMLElement
  if (waveformContainer) {
    waveformContainer.addEventListener('wheel', (e: WheelEvent) => {
      // 只有在按住 Ctrl 或 Command 键时才缩放
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()

        if (e.deltaY < 0) {
          // 滚轮向上 = 放大
          zoomIn()
        } else {
          // 滚轮向下 = 缩小
          zoomOut()
        }
      }
    }, { passive: false })
  }

  // 初始化缩放显示
  updateZoomDisplay()
}

// 初始化 ArtPlayer
async function initArtPlayer(filePath: string, url: string): Promise<void> {
  // 先销毁旧的播放器和波形图
  if (art) {
    art.destroy(false)
  }

  if (wavesurfer) {
    wavesurfer.destroy()
    wavesurfer = null
  }

  art = new Artplayer({
    container: '#artplayer-app',
    url: url,
    volume: 0.5,
    isLive: false,
    muted: false,
    autoplay: false,
    pip: true,
    autoSize: true,
    autoMini: true,
    screenshot: true,
    setting: true,
    loop: true,
    flip: true,
    playbackRate: true,
    aspectRatio: true,
    fullscreen: true,
    fullscreenWeb: true,
    subtitleOffset: true,
    miniProgressBar: true,
    mutex: true,
    backdrop: true,
    playsInline: true,
    autoPlayback: true,
    airplay: true,
    theme: '#23ade5',
    lang: 'zh-cn',
    moreVideoAttr: {
      crossOrigin: 'anonymous',
    },
  })

  // 设置默认播放速度为 1.5
  art.playbackRate = 1.5

  // 提取波形数据并初始化 WaveSurfer
  const waveformData = await extractWaveformData(filePath)
  if (waveformData) {
    initWaveSurferWithPeaks(waveformData)

    // --- 绑定 ArtPlayer 和 WaveSurfer 的联动 ---

    // 1. 播放/暂停同步
    art.on('play', () => wavesurfer?.play())
    art.on('pause', () => wavesurfer?.pause())

    // 2. 进度同步 (防止漂移)
    art.on('video:timeupdate', () => {
      if (!wavesurfer) return
      // 如果误差超过 0.1 秒，则强制同步
      if (Math.abs(wavesurfer.getCurrentTime() - art!.currentTime) > 0.1) {
        wavesurfer.setTime(art!.currentTime)
      }
    })

    // 3. 拖拽/跳转同步
    art.on('seek', (time) => {
      wavesurfer?.setTime(time)
    })

    // 4. 倍速同步
    art.on('video:ratechange', () => {
      if (wavesurfer && art) {
        wavesurfer.setPlaybackRate(art.playbackRate)
      }
    })
  }
}

// 处理打开文件
btnOpen.addEventListener('click', async () => {
  const filePath = await window.electron.ipcRenderer.invoke('dialog:openFile')

  if (filePath) {
    fileNameSpan.innerText = filePath
    const fileUrl = `file://${filePath}`
    await initArtPlayer(filePath, fileUrl)
  }
})
