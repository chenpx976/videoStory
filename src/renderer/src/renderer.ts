import WaveSurfer from 'wavesurfer.js'
import Artplayer from 'artplayer'

const btnOpen = document.getElementById('btnOpen') as HTMLButtonElement
const fileNameSpan = document.getElementById('fileName') as HTMLSpanElement

let art: Artplayer | null = null
let wavesurfer: WaveSurfer | null = null

// 初始化 ArtPlayer
function initArtPlayer(url: string): void {
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

  // 初始化 WaveSurfer
  initWaveSurfer(url)

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

function initWaveSurfer(url: string): void {
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

  wavesurfer.load(url).catch((err) => {
    console.error('WaveSurfer load error:', err)
  })
}

// 处理打开文件
btnOpen.addEventListener('click', async () => {
  const filePath = await window.electron.ipcRenderer.invoke('dialog:openFile')

  if (filePath) {
    fileNameSpan.innerText = filePath
    const fileUrl = `file://${filePath}`
    initArtPlayer(fileUrl)
  }
})
