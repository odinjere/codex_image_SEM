import { invoke } from '@tauri-apps/api/tauri'
import { open, save } from '@tauri-apps/api/dialog'
import type {
  CalibrationScale,
  ContrastParams,
  LoadedImage,
  ParticleDetectionParams,
  ParticleResults,
  Point,
} from '../types'

export interface MeasurementResult {
  value: number; unit: string; pixel_value: number; calibration_applied: boolean
}
export interface AreaResult {
  area_pixels: number; area_nm2?: number
  perimeter_pixels: number; perimeter_nm?: number
  centroid: Point
  bounding_box: { x: number; y: number; width: number; height: number }
}

export const openFileDialog = async (): Promise<string | null> => {
  const result = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['tif', 'tiff', 'png', 'jpg', 'jpeg', 'dm3', 'dm4'] }] })
  return typeof result === 'string' ? result : null
}

export const saveCsvDialog = async (): Promise<string | null> => {
  const result = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }] })
  return typeof result === 'string' ? result : null
}

export const saveImageDialog = async (defaultName: string): Promise<string | null> => {
  const result = await save({
    defaultPath: defaultName,
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'TIFF', extensions: ['tiff', 'tif'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
    ],
  })
  return typeof result === 'string' ? result : null
}

export const loadImage = (path: string) => invoke<LoadedImage>('load_image', { path })
export const getImageMetadata = (path: string) => invoke<Record<string, unknown>>('get_image_metadata', { path })
export const getHistogram = (pixels: Uint8Array) => invoke<Record<string, unknown>>('get_histogram', { pixels: Array.from(pixels) })
export const adjustContrast = (pixels: Uint8Array, params: ContrastParams) => invoke<number[]>('adjust_contrast', { pixels: Array.from(pixels), params })
export const adjustBrightness = (pixels: Uint8Array, offset: number) => invoke<number[]>('adjust_brightness', { pixels: Array.from(pixels), offset })
export const applyHistogramEqualization = (pixels: Uint8Array) => invoke<number[]>('apply_histogram_equalization', { pixels: Array.from(pixels) })
export const measureDistance = (p1: Point, p2: Point, calibration?: CalibrationScale) =>
  invoke<MeasurementResult>('measure_distance', { p1, p2, calibration: calibration ? { nm_per_pixel: calibration.nmPerPixel } : null })
export const measureArea = (points: Point[], calibration?: CalibrationScale) =>
  invoke<AreaResult>('measure_area', { points, calibration: calibration ? { nm_per_pixel: calibration.nmPerPixel } : null })
export const measureAngle = (p1: Point, p2: Point, p3: Point) => invoke<number>('measure_angle', { p1, p2, p3 })
export const exportMeasurementsCsv = (measurements: unknown[], outputPath: string) =>
  invoke<void>('export_measurements_csv', { measurements, outputPath })
export const detectParticles = (pixels: Uint8Array, width: number, height: number, params: ParticleDetectionParams) =>
  invoke<Record<string, unknown>>('detect_particles', {
    imageData: Array.from(pixels),
    width,
    height,
    params: {
      threshold: params.threshold,
      min_area: params.minArea,
      max_area: params.maxArea,
      min_circularity: params.minCircularity,
      dark_particles: params.darkParticles,
    },
  })
export const countParticles = (pixels: Uint8Array, width: number, height: number, params: ParticleDetectionParams) =>
  invoke<number>('count_particles', {
    imageData: Array.from(pixels),
    width,
    height,
    params: {
      threshold: params.threshold,
      min_area: params.minArea,
      max_area: params.maxArea,
      min_circularity: params.minCircularity,
      dark_particles: params.darkParticles,
    },
  })
export const exportImage = (pixels: Uint8Array, width: number, height: number, outputPath: string, format: string) =>
  invoke<void>('export_image', { pixels: Array.from(pixels), width, height, outputPath, format })
