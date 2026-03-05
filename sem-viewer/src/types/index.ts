export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export interface SemMetadata {
  acceleratingVoltage?: number; magnification?: number; workingDistance?: number
  pixelSizeNm?: number; detector?: string; instrument?: string
}
export interface ImageMetadata {
  width: number; height: number; format: string; fileSize: number
  bitDepth: number; channels: number; semMetadata?: SemMetadata
  filePath: string; fileName: string
}
export interface LoadedImage {
  width: number; height: number; channels: number
  bitDepth: number; format: string
  pixels: number[]
}
export interface HistogramData {
  bins: number[]; minValue: number; maxValue: number; mean: number; stdDev: number
}
export interface ContrastParams { min: number; max: number; gamma: number }
export interface CalibrationScale { nmPerPixel: number; source: 'manual'|'scalebar'|'metadata' }

export type MeasurementType = 'distance' | 'area' | 'angle'

interface BaseMeasurement { id: string; type: MeasurementType; createdAt: number; color: string }
export interface DistanceMeasurement extends BaseMeasurement {
  type: 'distance'; p1: Point; p2: Point
  pixelValue: number; value: number; unit: string; calibrationApplied: boolean
}
export interface AreaMeasurement extends BaseMeasurement {
  type: 'area'; points: Point[]
  areaPixels: number; areaNm2?: number
  perimeterPixels: number; perimeterNm?: number
  centroid: Point; boundingBox: Rect
}
export interface AngleMeasurement extends BaseMeasurement {
  type: 'angle'; p1: Point; vertex: Point; p3: Point; angleDeg: number
}
export type Measurement = DistanceMeasurement | AreaMeasurement | AngleMeasurement

export interface Particle {
  id: number; centroidX: number; centroidY: number
  areaPixels: number; perimeterPixels: number; circularity: number; aspectRatio: number
  boundingX: number; boundingY: number; boundingW: number; boundingH: number
  meanIntensity: number
}
export interface ParticleDetectionParams {
  threshold: number; minArea: number; maxArea: number
  minCircularity: number; darkParticles: boolean
}
export interface ParticleResults {
  count: number; particles: Particle[]; totalArea: number
  meanArea: number; meanCircularity: number; mask: number[]
}

export type Tool = 'pan' | 'zoom' | 'measure-distance' | 'measure-area' | 'measure-angle'
export type Panel = 'histogram' | 'measurements' | 'particles' | 'metadata'
export interface ViewTransform { scale: number; offsetX: number; offsetY: number }
export interface AppState {
  currentFile: string|null; metadata: ImageMetadata|null; rawPixels: Uint8Array|null
  viewTransform: ViewTransform; activeTool: Tool; activePanel: Panel
  measurements: Measurement[]; calibration: CalibrationScale|null
  contrastParams: ContrastParams; histogram: HistogramData|null
  particleResults: ParticleResults|null; isLoading: boolean; error: string|null
}
