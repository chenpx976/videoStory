import { ElectronAPI } from '@electron-toolkit/preload'

// 波形数据结构
export interface WaveformData {
  peaks: number[]      // 峰值数组，值在 -1 到 1 之间
  duration: number     // 音频时长（秒）
  samples: number      // 采样点数
}

// 波形提取结果
export interface WaveformResult {
  success: boolean
  data?: WaveformData
  error?: string
  fromCache?: boolean
}

// 波形提取选项
export interface WaveformOptions {
  samples?: number     // 波形采样点数，默认 3000
  channels?: number    // 声道数，默认 1
}

// 扩展 ElectronAPI
export interface ExtendedElectronAPI extends ElectronAPI {
  ipcRenderer: ElectronAPI['ipcRenderer'] & {
    invoke(channel: 'audio:extractWaveform', filePath: string, options?: WaveformOptions): Promise<WaveformResult>
    on(channel: 'audio:extractProgress', listener: (event: unknown, data: { currentTime: number }) => void): void
  }
}

declare global {
  interface Window {
    electron: ExtendedElectronAPI
    api: unknown
  }
}
