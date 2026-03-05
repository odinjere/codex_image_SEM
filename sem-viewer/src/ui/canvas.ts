import type { Measurement, Particle, Point, ViewTransform } from '../types'

export class CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private imageData: ImageData | null = null
  private rawPixels: Uint8ClampedArray | null = null
  private imageWidth = 0
  private imageHeight = 0
  private transform: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 }
  private isPanning = false
  private lastPanPoint: Point | null = null
  private measurements: Measurement[] = []
  private particles: Particle[] = []
  private hoverPoint: Point | null = null
  private activePoints: Point[] = []

  onTransformChange?: (transform: ViewTransform) => void
  onCanvasClick?: (imgPt: Point) => void
  onCanvasMove?: (imgPt: Point) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.setupListeners()
    this.setupResize()
  }

  loadGrayscale(pixels: Uint8Array, w: number, h: number): void {
    this.imageWidth = w
    this.imageHeight = h
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < pixels.length; i += 1) {
      rgba[i * 4] = pixels[i]
      rgba[i * 4 + 1] = pixels[i]
      rgba[i * 4 + 2] = pixels[i]
      rgba[i * 4 + 3] = 255
    }
    this.rawPixels = rgba
    this.imageData = new ImageData(rgba, w, h)
    this.fitToScreen()
    this.render()
  }

  updatePixels(pixels: Uint8Array): void {
    if (!this.imageWidth || !this.imageHeight) return
    const rgba = new Uint8ClampedArray(this.imageWidth * this.imageHeight * 4)
    for (let i = 0; i < pixels.length; i += 1) {
      rgba[i * 4] = pixels[i]
      rgba[i * 4 + 1] = pixels[i]
      rgba[i * 4 + 2] = pixels[i]
      rgba[i * 4 + 3] = 255
    }
    this.rawPixels = rgba
    this.imageData = new ImageData(rgba, this.imageWidth, this.imageHeight)
    this.render()
  }

  fitToScreen(): void {
    if (!this.imageData) return
    const scale = Math.min(this.canvas.width / this.imageWidth, this.canvas.height / this.imageHeight) * 0.95
    this.transform = {
      scale,
      offsetX: (this.canvas.width - this.imageWidth * scale) / 2,
      offsetY: (this.canvas.height - this.imageHeight * scale) / 2,
    }
    this.onTransformChange?.(this.transform)
  }

  zoom(factor: number, center?: Point): void {
    const oldScale = this.transform.scale
    const newScale = Math.max(0.05, Math.min(50, oldScale * factor))
    const cx = center?.x ?? this.canvas.width / 2
    const cy = center?.y ?? this.canvas.height / 2
    this.transform.offsetX = cx - (cx - this.transform.offsetX) * (newScale / oldScale)
    this.transform.offsetY = cy - (cy - this.transform.offsetY) * (newScale / oldScale)
    this.transform.scale = newScale
    this.onTransformChange?.(this.transform)
    this.render()
  }

  canvasToImage(p: Point): Point {
    return { x: (p.x - this.transform.offsetX) / this.transform.scale, y: (p.y - this.transform.offsetY) / this.transform.scale }
  }

  imageToCanvas(p: Point): Point {
    return { x: p.x * this.transform.scale + this.transform.offsetX, y: p.y * this.transform.scale + this.transform.offsetY }
  }

  render(measurements?: Measurement[], particles?: Particle[], hoverPoint?: Point | null, activePoints?: Point[]): void {
    if (measurements) this.measurements = measurements
    if (particles) this.particles = particles
    if (hoverPoint !== undefined) this.hoverPoint = hoverPoint
    if (activePoints) this.activePoints = activePoints

    this.ctx.fillStyle = '#0d0d0d'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    if (this.imageData) {
      const offscreen = new OffscreenCanvas(this.imageWidth, this.imageHeight)
      const offCtx = offscreen.getContext('2d')!
      offCtx.putImageData(this.imageData, 0, 0)
      this.ctx.save()
      this.ctx.translate(this.transform.offsetX, this.transform.offsetY)
      this.ctx.scale(this.transform.scale, this.transform.scale)
      this.ctx.drawImage(offscreen, 0, 0)
      this.ctx.restore()
    }

    this.drawMeasurements()
    this.drawActivePoints()
    this.drawParticles()
    this.drawCrosshair()
  }

  getPixelValue(p: Point): number | null {
    if (!this.rawPixels) return null
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    if (x < 0 || y < 0 || x >= this.imageWidth || y >= this.imageHeight) return null
    return this.rawPixels[(y * this.imageWidth + x) * 4]
  }

  private drawMeasurements(): void {
    for (const m of this.measurements) {
      this.ctx.strokeStyle = m.color
      this.ctx.fillStyle = m.color
      this.ctx.lineWidth = 2
      if (m.type === 'distance') {
        const a = this.imageToCanvas(m.p1)
        const b = this.imageToCanvas(m.p2)
        this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke()
      } else if (m.type === 'area') {
        this.ctx.beginPath()
        m.points.forEach((pt, i) => {
          const p = this.imageToCanvas(pt)
          if (i === 0) this.ctx.moveTo(p.x, p.y)
          else this.ctx.lineTo(p.x, p.y)
        })
        this.ctx.closePath()
        this.ctx.fillStyle = `${m.color}22`
        this.ctx.fill()
        this.ctx.strokeStyle = m.color
        this.ctx.stroke()
      } else {
        const a = this.imageToCanvas(m.p1)
        const v = this.imageToCanvas(m.vertex)
        const b = this.imageToCanvas(m.p3)
        this.ctx.beginPath(); this.ctx.moveTo(v.x, v.y); this.ctx.lineTo(a.x, a.y); this.ctx.moveTo(v.x, v.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke()
      }
    }
  }

  private drawActivePoints(): void {
    if (this.activePoints.length === 0) return
    this.ctx.save()
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.setLineDash([4, 3])
    this.ctx.beginPath()
    this.activePoints.forEach((p, i) => {
      const c = this.imageToCanvas(p)
      if (i === 0) this.ctx.moveTo(c.x, c.y)
      else this.ctx.lineTo(c.x, c.y)
    })
    if (this.hoverPoint) {
      const h = this.imageToCanvas(this.hoverPoint)
      this.ctx.lineTo(h.x, h.y)
    }
    this.ctx.stroke()
    this.ctx.restore()
  }

  private drawParticles(): void {
    this.ctx.strokeStyle = '#ffaa00'
    for (const p of this.particles) {
      const tl = this.imageToCanvas({ x: p.boundingX, y: p.boundingY })
      this.ctx.strokeRect(tl.x, tl.y, p.boundingW * this.transform.scale, p.boundingH * this.transform.scale)
    }
  }

  private drawCrosshair(): void {
    if (!this.hoverPoint) return
    const p = this.imageToCanvas(this.hoverPoint)
    this.ctx.save()
    this.ctx.strokeStyle = 'rgba(255,255,255,.2)'
    this.ctx.setLineDash([4, 3])
    this.ctx.beginPath(); this.ctx.moveTo(0, p.y); this.ctx.lineTo(this.canvas.width, p.y); this.ctx.moveTo(p.x, 0); this.ctx.lineTo(p.x, this.canvas.height); this.ctx.stroke()
    this.ctx.restore()
  }

  private setupListeners(): void {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const point = { x: e.offsetX, y: e.offsetY }
      this.zoom(e.deltaY < 0 ? 1.1 : 0.9, point)
    }, { passive: false })

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this.isPanning = true
        this.lastPanPoint = { x: e.clientX, y: e.clientY }
      } else if (e.button === 0) {
        this.onCanvasClick?.(this.canvasToImage({ x: e.offsetX, y: e.offsetY }))
      }
    })

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isPanning && this.lastPanPoint) {
        this.transform.offsetX += e.clientX - this.lastPanPoint.x
        this.transform.offsetY += e.clientY - this.lastPanPoint.y
        this.lastPanPoint = { x: e.clientX, y: e.clientY }
      }
      const img = this.canvasToImage({ x: e.offsetX, y: e.offsetY })
      this.hoverPoint = img
      this.onCanvasMove?.(img)
      this.render()
    })

    this.canvas.addEventListener('mouseup', () => { this.isPanning = false; this.lastPanPoint = null })
    this.canvas.addEventListener('mouseleave', () => { this.isPanning = false; this.lastPanPoint = null })
  }

  private setupResize(): void {
    const ro = new ResizeObserver(() => {
      const parent = this.canvas.parentElement
      if (!parent) return
      this.canvas.width = parent.clientWidth
      this.canvas.height = parent.clientHeight
      this.render()
    })
    if (this.canvas.parentElement) ro.observe(this.canvas.parentElement)
  }
}
