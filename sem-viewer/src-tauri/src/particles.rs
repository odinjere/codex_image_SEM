use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Particle {
    pub id: u32,
    pub centroid_x: f64,
    pub centroid_y: f64,
    pub area_pixels: f64,
    pub perimeter_pixels: f64,
    pub circularity: f64,
    pub aspect_ratio: f64,
    pub bounding_x: u32,
    pub bounding_y: u32,
    pub bounding_w: u32,
    pub bounding_h: u32,
    pub mean_intensity: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ParticleDetectionParams {
    pub threshold: u8,
    pub min_area: f64,
    pub max_area: f64,
    pub min_circularity: f64,
    pub dark_particles: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ParticleResults {
    pub count: u32,
    pub particles: Vec<Particle>,
    pub total_area: f64,
    pub mean_area: f64,
    pub mean_circularity: f64,
    pub mask: Vec<u8>,
}

#[tauri::command]
pub fn detect_particles(
    image_data: Vec<u8>,
    width: u32,
    height: u32,
    params: ParticleDetectionParams,
) -> Result<ParticleResults, String> {
    let w = width as usize;
    let h = height as usize;
    let size = w * h;
    if image_data.len() != size {
        return Err("image_data length does not match width*height".to_string());
    }

    let binary: Vec<bool> = image_data
        .iter()
        .map(|&p| if params.dark_particles { p < params.threshold } else { p >= params.threshold })
        .collect();

    let mut labels = vec![0i32; size];
    let mut components: Vec<Vec<usize>> = Vec::new();
    let mut current_label = 1i32;

    for idx in 0..size {
        if !binary[idx] || labels[idx] != 0 {
            continue;
        }
        let mut queue = VecDeque::new();
        let mut component = Vec::new();
        queue.push_back(idx);
        labels[idx] = current_label;

        while let Some(cur) = queue.pop_front() {
            component.push(cur);
            let x = cur % w;
            let y = cur / w;
            let neighbors = [
                (x as isize - 1, y as isize),
                (x as isize + 1, y as isize),
                (x as isize, y as isize - 1),
                (x as isize, y as isize + 1),
            ];

            for (nx, ny) in neighbors {
                if nx < 0 || ny < 0 || nx >= w as isize || ny >= h as isize {
                    continue;
                }
                let nidx = ny as usize * w + nx as usize;
                if binary[nidx] && labels[nidx] == 0 {
                    labels[nidx] = current_label;
                    queue.push_back(nidx);
                }
            }
        }

        components.push(component);
        current_label += 1;
    }

    let mut particles = Vec::new();
    let mut mask = vec![0u8; size];
    let mut total_area = 0.0;
    let mut total_circularity = 0.0;

    for (label_idx, comp) in components.iter().enumerate() {
        let area = comp.len() as f64;
        if area < params.min_area || area > params.max_area {
            continue;
        }

        let mut min_x = usize::MAX;
        let mut min_y = usize::MAX;
        let mut max_x = 0usize;
        let mut max_y = 0usize;
        let mut sx = 0.0;
        let mut sy = 0.0;
        let mut intensity = 0.0;
        let mut perimeter = 0.0;

        for &idx in comp {
            let x = idx % w;
            let y = idx / w;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
            sx += x as f64;
            sy += y as f64;
            intensity += image_data[idx] as f64;

            let neighbors = [
                (x as isize - 1, y as isize),
                (x as isize + 1, y as isize),
                (x as isize, y as isize - 1),
                (x as isize, y as isize + 1),
            ];
            if neighbors.iter().any(|(nx, ny)| {
                *nx < 0
                    || *ny < 0
                    || *nx >= w as isize
                    || *ny >= h as isize
                    || !binary[*ny as usize * w + *nx as usize]
            }) {
                perimeter += 1.0;
            }
        }

        let circularity = if perimeter > 0.0 {
            (4.0 * std::f64::consts::PI * area) / (perimeter * perimeter)
        } else {
            0.0
        };
        if circularity < params.min_circularity {
            continue;
        }

        for &idx in comp {
            mask[idx] = (label_idx % 255 + 1) as u8;
        }

        let bw = (max_x - min_x + 1) as u32;
        let bh = (max_y - min_y + 1) as u32;
        let aspect_ratio = if bh > 0 { bw as f64 / bh as f64 } else { 0.0 };

        let particle = Particle {
            id: (particles.len() + 1) as u32,
            centroid_x: sx / area,
            centroid_y: sy / area,
            area_pixels: area,
            perimeter_pixels: perimeter,
            circularity,
            aspect_ratio,
            bounding_x: min_x as u32,
            bounding_y: min_y as u32,
            bounding_w: bw,
            bounding_h: bh,
            mean_intensity: intensity / area,
        };

        total_area += area;
        total_circularity += circularity;
        particles.push(particle);
    }

    let count = particles.len() as u32;
    Ok(ParticleResults {
        count,
        particles,
        total_area,
        mean_area: if count > 0 { total_area / count as f64 } else { 0.0 },
        mean_circularity: if count > 0 {
            total_circularity / count as f64
        } else {
            0.0
        },
        mask,
    })
}

#[tauri::command]
pub fn count_particles(
    image_data: Vec<u8>,
    width: u32,
    height: u32,
    params: ParticleDetectionParams,
) -> Result<u32, String> {
    Ok(detect_particles(image_data, width, height, params)?.count)
}
