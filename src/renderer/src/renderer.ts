import WaveSurfer from 'wavesurfer.js'

const video = document.getElementById('mainVideo') as HTMLVideoElement
const btnOpen = document.getElementById('btnOpen') as HTMLButtonElement
const btnPlay = document.getElementById('btnPlay') as HTMLButtonElement
const playbackRateSelect = document.getElementById('playbackRate') as HTMLSelectElement
const fileNameSpan = document.getElementById('fileName') as HTMLSpanElement

// 初始化 WaveSurfer 实例
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  media: video, // 绑定视频元素，自动处理同步
  waveColor: '#4a4a4a', // 未播放部分的波形颜色
  progressColor: '#007aff', // 已播放部分的波形颜色 (macOS 蓝)
  cursorColor: '#ffffff', // 进度条指针颜色
  height: 80, // 波形高度
  barWidth: 2, // 波形条宽度（像 Soundcloud 风格）
  barGap: 1,
  normalize: true // 归一化音量，让波形看起来更饱满
})

// 处理打开文件
btnOpen.addEventListener('click', async () => {
  const filePath = await window.electron.ipcRenderer.invoke('dialog:openFile')

  if (filePath) {
    fileNameSpan.innerText = filePath
    loadMedia(filePath)
  }
})

// 处理播放/暂停
btnPlay.addEventListener('click', () => {
  if (video.paused) {
    video.play()
  } else {
    video.pause()
  }
})

// 处理播放速度
playbackRateSelect.addEventListener('change', () => {
  const rate = parseFloat(playbackRateSelect.value)
  video.playbackRate = rate
  wavesurfer.setPlaybackRate(rate)
})

function loadMedia(filePath: string): void {
  // 1. 设置视频源
  // 使用 file:// 协议并进行编码，确保特殊字符被正确处理
  const fileUrl = `file://${filePath}`
  video.src = fileUrl

  // 设置默认播放速度
  const defaultRate = parseFloat(playbackRateSelect.value)
  video.playbackRate = defaultRate
  wavesurfer.setPlaybackRate(defaultRate)

  // 2. 加载波形图
  // 注意：当使用 media 选项时，load 方法只需要 URL 来提取音频数据
  // 这里的 URL 必须与 video.src 一致或者是同一个文件的有效 URL
  wavesurfer.load(fileUrl).catch((err) => {
    console.error('WaveSurfer load error:', err)
  })
}
