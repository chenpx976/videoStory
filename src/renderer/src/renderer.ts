import WaveSurfer from 'wavesurfer.js'
import Artplayer from 'artplayer'
import type { WaveformData } from '../../preload/index.d'

const btnOpen = document.getElementById('btnOpen') as HTMLButtonElement
const fileNameSpan = document.getElementById('fileName') as HTMLSpanElement
const waveformLoadingDiv = document.getElementById('waveform-loading') as HTMLDivElement
const loadingProgressDiv = document.getElementById('loading-progress') as HTMLDivElement

let art: Artplayer | null = null
let wavesurfer: WaveSurfer | null = null

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

// 使用预提取的波形数据初始化 WaveSurfer
function initWaveSurferWithPeaks(waveformData: WaveformData): void {
  if (wavesurfer) {
    wavesurfer.destroy()
  }

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#4a4a4a',
    progressColor: '#007aff',
    cursorColor: '#ffffff',
    height: 80,
    barWidth: 2,
    barGap: 1,
    normalize: true,
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
}

// 初始化 ArtPlayer
async function initArtPlayer(filePath: string, url: string): Promise<void> {
  if (art) {
    art.destroy(false)
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
