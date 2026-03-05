#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod formats;
mod image_processing;
mod measurements;
mod particles;

use image_processing::*;
use measurements::*;
use particles::*;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_image,
            get_image_metadata,
            adjust_contrast,
            adjust_brightness,
            apply_histogram_equalization,
            get_histogram,
            measure_distance,
            measure_area,
            measure_angle,
            export_measurements_csv,
            detect_particles,
            count_particles,
            export_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
