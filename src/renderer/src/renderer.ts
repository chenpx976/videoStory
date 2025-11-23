import WaveSurfer from 'wavesurfer.js'

const video = document.getElementById('mainVideo') as HTMLVideoElement
const btnOpen = document.getElementById('btnOpen') as HTMLButtonElement
const fileNameSpan = document.getElementById('fileName') as HTMLSpanElement

// 初始化 WaveSurfer 实例
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
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

function loadMedia(filePath: string): void {
  // 1. 设置视频源
  video.src = filePath

  // 2. 加载波形图 (Wavesurfer 可以直接读取视频文件中的音频流)
  wavesurfer.load(filePath)

  // 3. 视频元数据加载完成后
  video.onloadedmetadata = (): void => {
    // 重置状态
    wavesurfer.seekTo(0)
  }
}

// --- 同步逻辑：视频 <-> 波形图 ---

// 1. 当用户点击/拖拽波形图时 -> 跳转视频
wavesurfer.on('interaction', (newTime) => {
  video.currentTime = newTime
})

// 2. 当用户点击波形图播放/暂停时
wavesurfer.on('play', () => video.play())
wavesurfer.on('pause', () => video.pause())

// 3. 视频播放时 -> 更新波形图光标
// 注意：不要在 timeupdate 里频繁调用 wavesurfer.seekTo，会卡顿
// 我们只需要处理视频的播放状态，让 wavesurfer 自己跑，只在需要校准时校准

video.addEventListener('play', () => {
  wavesurfer.play()
})

video.addEventListener('pause', () => {
  wavesurfer.pause()
})

// 4. 防止声音重叠 (Echo Cancellation)
// Wavesurfer 默认会播放声音。Video 也会播放声音。
// 方案：把 Wavesurfer 静音，只把它当作“进度条控制器”和“视觉展示”。
wavesurfer.setVolume(0)

// 5. 强行校准 (防止长时间播放后音画不同步)
video.addEventListener('seeking', () => {
  if (video.duration) {
    const progress = video.currentTime / video.duration
    wavesurfer.seekTo(progress)
  }
})
