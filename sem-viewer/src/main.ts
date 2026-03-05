import './styles.css'
import * as Bridge from './core/tauri-bridge'
import { CanvasRenderer } from './ui/canvas'
import { HistogramPanel } from './ui/histogram'
import type { AppState, AreaMeasurement, CalibrationScale, ContrastParams, DistanceMeasurement, HistogramData, ImageMetadata, Measurement, Particle, ParticleDetectionParams, ParticleResults, Point, Tool } from './types'

const COLORS = ['#00d9ff', '#ff6b35', '#7fff6e', '#ff4eb8', '#ffd700', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#f87171']

const state: AppState = {
  currentFile: null, metadata: null, rawPixels: null,
  viewTransform: { scale: 1, offsetX: 0, offsetY: 0 },
  activeTool: 'pan', activePanel: 'histogram',
  measurements: [], calibration: null,
  contrastParams: { min: 0, max: 255, gamma: 1.0 },
  histogram: null, particleResults: null, isLoading: false, error: null,
}
let pendingPoints: Point[] = []

const $ = (id: string) => document.getElementById(id)!
const canvas = $('main-canvas') as HTMLCanvasElement
const renderer = new CanvasRenderer(canvas)
const histogram = new HistogramPanel($('histogram-container'))

const normalizeMetadata = (m: Record<string, unknown>): ImageMetadata => ({
  width: Number(m.width), height: Number(m.height), format: String(m.format), fileSize: Number(m.file_size),
  bitDepth: Number(m.bit_depth), channels: Number(m.channels),
  semMetadata: m.sem_metadata ? {
    acceleratingVoltage: Number((m.sem_metadata as Record<string, unknown>).accelerating_voltage ?? 0) || undefined,
    magnification: Number((m.sem_metadata as Record<string, unknown>).magnification ?? 0) || undefined,
    workingDistance: Number((m.sem_metadata as Record<string, unknown>).working_distance ?? 0) || undefined,
    pixelSizeNm: Number((m.sem_metadata as Record<string, unknown>).pixel_size_nm ?? 0) || undefined,
    detector: ((m.sem_metadata as Record<string, unknown>).detector as string | undefined),
    instrument: ((m.sem_metadata as Record<string, unknown>).instrument as string | undefined),
  } : undefined,
  filePath: String(m.file_path), fileName: String(m.file_name),
})

const normalizeHistogram = (h: Record<string, unknown>): HistogramData => ({
  bins: h.bins as number[], minValue: Number(h.min_value), maxValue: Number(h.max_value), mean: Number(h.mean), stdDev: Number(h.std_dev),
})

const normalizeParticles = (r: Record<string, unknown>): ParticleResults => ({
  count: Number(r.count),
  particles: ((r.particles as Record<string, unknown>[]) ?? []).map((p) => ({
    id: Number(p.id), centroidX: Number(p.centroid_x), centroidY: Number(p.centroid_y), areaPixels: Number(p.area_pixels),
    perimeterPixels: Number(p.perimeter_pixels), circularity: Number(p.circularity), aspectRatio: Number(p.aspect_ratio),
    boundingX: Number(p.bounding_x), boundingY: Number(p.bounding_y), boundingW: Number(p.bounding_w), boundingH: Number(p.bounding_h),
    meanIntensity: Number(p.mean_intensity),
  })),
  totalArea: Number(r.total_area), meanArea: Number(r.mean_area), meanCircularity: Number(r.mean_circularity), mask: r.mask as number[],
})

function setLoading(v: boolean): void { state.isLoading = v; $('loading-overlay').classList.toggle('hidden', !v) }
function setStatus(text: string): void { $('status-bar').textContent = text }

async function openFile(): Promise<void> {
  const path = await Bridge.openFileDialog(); if (!path) return
  setLoading(true)
  try {
    const [metaRaw, loaded] = await Promise.all([Bridge.getImageMetadata(path), Bridge.loadImage(path)])
    const metadata = normalizeMetadata(metaRaw)
    const pixels = new Uint8Array(loaded.pixels)
    state.currentFile = path
    state.metadata = metadata
    state.rawPixels = pixels
    renderer.loadGrayscale(pixels, loaded.width, loaded.height)
    $('drop-zone').classList.add('has-image')
    const hist = normalizeHistogram(await Bridge.getHistogram(pixels))
    state.histogram = hist
    state.contrastParams = { min: hist.minValue, max: hist.maxValue, gamma: 1 }
    histogram.update(hist, state.contrastParams)
    $('titlebar-file').textContent = metadata.fileName
    $('metadata-content').innerHTML = `<div>${metadata.width}×${metadata.height}</div><div>${metadata.format.toUpperCase()}</div>`
    setStatus(`Loaded ${metadata.fileName}`)
  } finally { setLoading(false) }
}

async function completeMeasurement(): Promise<void> {
  if (!state.rawPixels) return
  if (!state.calibration && state.metadata?.semMetadata?.pixelSizeNm) {
    state.calibration = { nmPerPixel: state.metadata.semMetadata.pixelSizeNm, source: 'metadata' }
  }
  const color = COLORS[state.measurements.length % COLORS.length]
  const base = { id: crypto.randomUUID(), createdAt: Date.now(), color }

  let m: Measurement | null = null
  if (state.activeTool === 'measure-distance' && pendingPoints.length === 2) {
    const r = await Bridge.measureDistance(pendingPoints[0], pendingPoints[1], state.calibration ?? undefined)
    m = { ...base, type: 'distance', p1: pendingPoints[0], p2: pendingPoints[1], value: r.value, unit: r.unit, pixelValue: r.pixel_value, calibrationApplied: r.calibration_applied } as DistanceMeasurement
  } else if (state.activeTool === 'measure-angle' && pendingPoints.length === 3) {
    const deg = await Bridge.measureAngle(pendingPoints[0], pendingPoints[1], pendingPoints[2])
    m = { ...base, type: 'angle', p1: pendingPoints[0], vertex: pendingPoints[1], p3: pendingPoints[2], angleDeg: deg }
  } else if (state.activeTool === 'measure-area' && pendingPoints.length >= 3) {
    const r = await Bridge.measureArea(pendingPoints, state.calibration ?? undefined)
    m = {
      ...base,
      type: 'area',
      points: [...pendingPoints],
      areaPixels: r.area_pixels,
      areaNm2: r.area_nm2,
      perimeterPixels: r.perimeter_pixels,
      perimeterNm: r.perimeter_nm,
      centroid: r.centroid,
      boundingBox: r.bounding_box,
    } as AreaMeasurement
  }
  if (m) {
    state.measurements = [...state.measurements, m]
    updateMeasurementsList()
    renderer.render(state.measurements, state.particleResults?.particles ?? [], null, [])
    setPanel('measurements')
  }
  pendingPoints = []
}

function handleClick(imgPt: Point): void {
  if (state.activeTool === 'pan') return
  pendingPoints.push(imgPt)
  renderer.render(state.measurements, state.particleResults?.particles ?? [], null, pendingPoints)
  if (state.activeTool === 'measure-distance' && pendingPoints.length === 2) void completeMeasurement()
  if (state.activeTool === 'measure-angle' && pendingPoints.length === 3) void completeMeasurement()
}

function handleMove(imgPt: Point): void {
  const val = renderer.getPixelValue(imgPt)
  const s = `x:${imgPt.x.toFixed(1)} y:${imgPt.y.toFixed(1)} val:${val ?? '-'}`
  setStatus(state.calibration ? `${s} (${(imgPt.x * state.calibration.nmPerPixel).toFixed(1)}nm, ${(imgPt.y * state.calibration.nmPerPixel).toFixed(1)}nm)` : s)
}

function setTool(tool: Tool): void {
  state.activeTool = tool
  pendingPoints = []
  document.querySelectorAll('[data-tool]').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.tool === tool))
  canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair'
  renderer.render(state.measurements, state.particleResults?.particles ?? [], null, [])
}

function setPanel(panel: AppState['activePanel']): void {
  state.activePanel = panel
  document.querySelectorAll('[data-panel-content]').forEach((el) => el.classList.toggle('hidden', (el as HTMLElement).dataset.panelContent !== panel))
  document.querySelectorAll('[data-panel]').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.panel === panel))
}

function updateMeasurementsList(): void {
  $('measurements-list').innerHTML = state.measurements.map((m) => `<div>${m.type}</div>`).join('')
}

async function runParticleDetection(): Promise<void> {
  if (!state.rawPixels || !state.metadata) return
  const params: ParticleDetectionParams = {
    threshold: Number(($('particle-threshold') as HTMLInputElement).value),
    minArea: Number(($('particle-min-area') as HTMLInputElement).value),
    maxArea: Number.MAX_SAFE_INTEGER,
    minCircularity: 0,
    darkParticles: ($('dark-particles') as HTMLInputElement).checked,
  }
  const raw = await Bridge.detectParticles(state.rawPixels, state.metadata.width, state.metadata.height, params)
  state.particleResults = normalizeParticles(raw)
  $('particles-list').textContent = `Count: ${state.particleResults.count}`
  renderer.render(state.measurements, state.particleResults.particles)
}

renderer.onCanvasClick = handleClick
renderer.onCanvasMove = handleMove
histogram.onParamsChange = async (params: ContrastParams) => {
  state.contrastParams = params
  if (!state.rawPixels) return
  const adjusted = await Bridge.adjustContrast(state.rawPixels, params)
  renderer.updatePixels(new Uint8Array(adjusted))
}

$('btn-open').addEventListener('click', () => { void openFile() })
$('btn-fit').addEventListener('click', () => renderer.fitToScreen())
$('btn-zoom-in').addEventListener('click', () => renderer.zoom(1.1))
$('btn-zoom-out').addEventListener('click', () => renderer.zoom(0.9))
$('btn-clear-measurements').addEventListener('click', () => { state.measurements = []; updateMeasurementsList(); renderer.render([], state.particleResults?.particles ?? []) })
$('btn-detect-particles').addEventListener('click', () => { void runParticleDetection() })
$('btn-hist-eq').addEventListener('click', async () => {
  if (!state.rawPixels) return
  const result = await Bridge.applyHistogramEqualization(state.rawPixels)
  renderer.updatePixels(new Uint8Array(result))
})
$('btn-contrast-reset').addEventListener('click', () => histogram.reset())
$('gamma-slider').addEventListener('input', (e) => {
  const g = Number((e.target as HTMLInputElement).value)
  $('gamma-value').textContent = g.toFixed(2)
  histogram.setGamma(g)
})

document.querySelectorAll('[data-tool]').forEach((el) => el.addEventListener('click', () => setTool((el as HTMLElement).dataset.tool as Tool)))
document.querySelectorAll('[data-panel]').forEach((el) => el.addEventListener('click', () => setPanel((el as HTMLElement).dataset.panel as AppState['activePanel'])))
canvas.addEventListener('dblclick', () => { if (state.activeTool === 'measure-area' && pendingPoints.length >= 3) void completeMeasurement() })
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p') setTool('pan')
  if (e.key.toLowerCase() === 'd') setTool('measure-distance')
  if (e.key.toLowerCase() === 'a') setTool('measure-area')
  if (e.key.toLowerCase() === 'g') setTool('measure-angle')
  if (e.key === 'Escape') { pendingPoints = []; renderer.render(state.measurements, state.particleResults?.particles ?? [], null, []) }
  if (e.key === 'Delete' || e.key === 'Backspace') { state.measurements.pop(); updateMeasurementsList(); renderer.render(state.measurements, state.particleResults?.particles ?? []) }
})

setTool('pan')
setPanel('histogram')
