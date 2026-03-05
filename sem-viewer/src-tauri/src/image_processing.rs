use image::{DynamicImage, GrayImage, ImageFormat, ImageReader};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct LoadedImage {
    pub width: u32,
    pub height: u32,
    pub channels: u8,
    pub bit_depth: u8,
    pub format: String,
    pub pixels: Vec<u8>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub file_size: u64,
    pub bit_depth: u8,
    pub channels: u8,
    pub sem_metadata: Option<SemMetadata>,
    pub file_path: String,
    pub file_name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SemMetadata {
    pub accelerating_voltage: Option<f64>,
    pub magnification: Option<f64>,
    pub working_distance: Option<f64>,
    pub pixel_size_nm: Option<f64>,
    pub detector: Option<String>,
    pub instrument: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HistogramData {
    pub bins: Vec<u32>,
    pub min_value: f32,
    pub max_value: f32,
    pub mean: f32,
    pub std_dev: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ContrastParams {
    pub min: f32,
    pub max: f32,
    pub gamma: f32,
}

#[tauri::command]
pub fn load_image(path: String) -> Result<LoadedImage, String> {
    let p = Path::new(&path);
    let img = ImageReader::open(p)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let gray8 = match img {
        DynamicImage::ImageLuma16(img16) => {
            let min = img16.pixels().map(|px| px.0[0]).min().unwrap_or(0);
            let max = img16.pixels().map(|px| px.0[0]).max().unwrap_or(65535);
            let range = (max.saturating_sub(min)).max(1) as f32;
            let mut out = GrayImage::new(img16.width(), img16.height());
            for (x, y, pixel) in img16.enumerate_pixels() {
                let v = (((pixel.0[0].saturating_sub(min)) as f32 / range) * 255.0).round() as u8;
                out.put_pixel(x, y, image::Luma([v]));
            }
            out
        }
        _ => img.to_luma8(),
    };

    let (w, h) = gray8.dimensions();
    let format = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    Ok(LoadedImage {
        width: w,
        height: h,
        channels: 1,
        bit_depth: 8,
        format,
        pixels: gray8.into_raw(),
    })
}

#[tauri::command]
pub fn get_image_metadata(path: String) -> Result<ImageMetadata, String> {
    let p = Path::new(&path);
    let file_size = std::fs::metadata(p).map_err(|e| e.to_string())?.len();
    let reader = ImageReader::open(p)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let format = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_lowercase();
    let (width, height) = reader.into_dimensions().map_err(|e| e.to_string())?;

    Ok(ImageMetadata {
        width,
        height,
        format,
        file_size,
        bit_depth: 8,
        channels: 1,
        sem_metadata: None,
        file_path: path.clone(),
        file_name: p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string(),
    })
}

#[tauri::command]
pub fn adjust_contrast(pixels: Vec<u8>, params: ContrastParams) -> Result<Vec<u8>, String> {
    let range = (params.max - params.min).max(0.01);
    let gamma_inv = 1.0 / params.gamma.max(0.01);
    Ok(pixels
        .par_iter()
        .map(|p| ((((*p as f32 - params.min) / range).clamp(0.0, 1.0)).powf(gamma_inv) * 255.0) as u8)
        .collect())
}

#[tauri::command]
pub fn adjust_brightness(pixels: Vec<u8>, offset: i32) -> Result<Vec<u8>, String> {
    Ok(pixels
        .into_iter()
        .map(|p| (p as i32 + offset).clamp(0, 255) as u8)
        .collect())
}

#[tauri::command]
pub fn apply_histogram_equalization(pixels: Vec<u8>) -> Result<Vec<u8>, String> {
    if pixels.is_empty() {
        return Ok(pixels);
    }
    let mut hist = vec![0u32; 256];
    for &p in &pixels {
        hist[p as usize] += 1;
    }

    let total = pixels.len() as f32;
    let mut cdf = vec![0f32; 256];
    let mut cum = 0f32;
    for (i, &h) in hist.iter().enumerate() {
        cum += h as f32;
        cdf[i] = cum / total;
    }
    let cdf_min = cdf.iter().copied().find(|v| *v > 0.0).unwrap_or(0.0);
    let lut: Vec<u8> = cdf
        .iter()
        .map(|&v| (((v - cdf_min) / (1.0 - cdf_min).max(1e-6)).clamp(0.0, 1.0) * 255.0) as u8)
        .collect();

    Ok(pixels.into_iter().map(|p| lut[p as usize]).collect())
}

#[tauri::command]
pub fn get_histogram(pixels: Vec<u8>) -> Result<HistogramData, String> {
    if pixels.is_empty() {
        return Err("Pixel buffer is empty".to_string());
    }
    let mut bins = vec![0u32; 256];
    let mut sum = 0f32;
    let mut min_v = u8::MAX;
    let mut max_v = u8::MIN;
    for &p in &pixels {
        bins[p as usize] += 1;
        sum += p as f32;
        min_v = min_v.min(p);
        max_v = max_v.max(p);
    }

    let n = pixels.len() as f32;
    let mean = sum / n;
    let variance = pixels
        .iter()
        .map(|&p| {
            let d = p as f32 - mean;
            d * d
        })
        .sum::<f32>()
        / n;

    Ok(HistogramData {
        bins,
        min_value: min_v as f32,
        max_value: max_v as f32,
        mean,
        std_dev: variance.sqrt(),
    })
}

#[tauri::command]
pub fn export_image(
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    output_path: String,
    format: String,
) -> Result<(), String> {
    let img = GrayImage::from_raw(width, height, pixels)
        .ok_or_else(|| "Invalid image dimensions/pixel buffer".to_string())?;

    let fmt = match format.to_lowercase().as_str() {
        "tiff" | "tif" => ImageFormat::Tiff,
        "jpeg" | "jpg" => ImageFormat::Jpeg,
        _ => ImageFormat::Png,
    };

    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), fmt)
        .map_err(|e| e.to_string())?;
    std::fs::write(output_path, buf).map_err(|e| e.to_string())
}
