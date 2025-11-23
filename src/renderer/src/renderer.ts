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
  initWaveSurfer(art.video, url)

  // 监听播放速度变化，同步给 WaveSurfer
  art.on('video:ratechange', () => {
      if (wavesurfer && art) {
          wavesurfer.setPlaybackRate(art.playbackRate)
      }
  })
}

function initWaveSurfer(videoElement: HTMLVideoElement, url: string): void {
  if (wavesurfer) {
    wavesurfer.destroy()
  }

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    media: videoElement, // 绑定视频元素，自动处理同步
    waveColor: '#4a4a4a', // 未播放部分的波形颜色
    progressColor: '#007aff', // 已播放部分的波形颜色 (macOS 蓝)
    cursorColor: '#ffffff', // 进度条指针颜色
    height: 80, // 波形高度
    barWidth: 2, // 波形条宽度（像 Soundcloud 风格）
    barGap: 1,
    normalize: true, // 归一化音量，让波形看起来更饱满
    backend: 'MediaElement' // 使用 MediaElement 后端，避免 Web Audio API 的一些问题
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
