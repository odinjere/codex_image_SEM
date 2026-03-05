import type { ContrastParams, HistogramData } from '../types'

export class HistogramPanel {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private data: HistogramData | null = null
  private params: ContrastParams = { min: 0, max: 255, gamma: 1 }
  private dragging: 'min' | 'max' | null = null
  onParamsChange?: (params: ContrastParams) => void

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = container.clientWidth
    this.canvas.height = 80
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.setupDrag()
  }

  update(data: HistogramData, params?: ContrastParams): void {
    this.data = data
    if (params) this.params = { ...params }
    this.draw()
  }

  setGamma(gamma: number): void {
    this.params.gamma = gamma
    this.draw()
    this.onParamsChange?.({ ...this.params })
  }

  reset(): void {
    if (!this.data) return
    this.params = { min: this.data.minValue, max: this.data.maxValue, gamma: 1.0 }
    this.draw()
    this.onParamsChange?.({ ...this.params })
  }

  private draw(): void {
    const w = this.canvas.width
    const h = this.canvas.height
    this.ctx.fillStyle = '#111'
    this.ctx.fillRect(0, 0, w, h)
    if (!this.data) return
    const maxBin = Math.max(...this.data.bins, 1)
    for (let i = 0; i < 256; i += 1) {
      const bh = (this.data.bins[i] / maxBin) * (h - 20)
      this.ctx.fillStyle = i >= this.params.min && i <= this.params.max ? '#4a9eff55' : '#2a2a2a'
      this.ctx.fillRect((i / 256) * w, h - 20 - bh, w / 256, bh)
    }
    this.ctx.fillStyle = '#181818'
    this.ctx.fillRect(0, h - 18, w, 18)
    this.ctx.fillStyle = '#ddd'
    this.ctx.font = '10px monospace'
    this.ctx.fillText(`μ:${this.data.mean.toFixed(2)}  σ:${this.data.stdDev.toFixed(2)}  [${this.params.min.toFixed(0)}-${this.params.max.toFixed(0)}]`, 6, h - 5)

    this.drawHandle(this.params.min, '#00d9ff')
    this.drawHandle(this.params.max, '#ff6b35')
  }

  private drawHandle(value: number, color: string): void {
    const x = (value / 255) * this.canvas.width
    const h = this.canvas.height
    this.ctx.strokeStyle = color
    this.ctx.setLineDash([4, 2])
    this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h - 18); this.ctx.stroke(); this.ctx.setLineDash([])
    this.ctx.fillStyle = color
    this.ctx.beginPath(); this.ctx.moveTo(x - 5, h - 18); this.ctx.lineTo(x + 5, h - 18); this.ctx.lineTo(x, h - 10); this.ctx.closePath(); this.ctx.fill()
  }

  private setupDrag(): void {
    const valFromX = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect()
      const x = Math.min(this.canvas.width, Math.max(0, clientX - rect.left))
      return Math.round((x / this.canvas.width) * 255)
    }

    this.canvas.addEventListener('mousedown', (e) => {
      const val = valFromX(e.clientX)
      this.dragging = Math.abs(val - this.params.min) <= Math.abs(val - this.params.max) ? 'min' : 'max'
    })
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return
      const val = valFromX(e.clientX)
      if (this.dragging === 'min') this.params.min = Math.min(val, this.params.max)
      else this.params.max = Math.max(val, this.params.min)
      this.draw()
      this.onParamsChange?.({ ...this.params })
    })
    window.addEventListener('mouseup', () => { this.dragging = null })
  }
}
