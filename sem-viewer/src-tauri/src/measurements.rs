use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CalibrationScale {
    pub nm_per_pixel: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MeasurementResult {
    pub value: f64,
    pub unit: String,
    pub pixel_value: f64,
    pub calibration_applied: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AreaResult {
    pub area_pixels: f64,
    pub area_nm2: Option<f64>,
    pub perimeter_pixels: f64,
    pub perimeter_nm: Option<f64>,
    pub centroid: Point,
    pub bounding_box: BoundingBox,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
pub fn measure_distance(
    p1: Point,
    p2: Point,
    calibration: Option<CalibrationScale>,
) -> Result<MeasurementResult, String> {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let pixel_value = (dx * dx + dy * dy).sqrt();

    if let Some(c) = calibration {
        let nm_value = pixel_value * c.nm_per_pixel;
        let (value, unit) = if nm_value >= 1_000_000.0 {
            (nm_value / 1_000_000.0, "mm")
        } else if nm_value >= 1_000.0 {
            (nm_value / 1_000.0, "μm")
        } else {
            (nm_value, "nm")
        };
        Ok(MeasurementResult {
            value,
            unit: unit.to_string(),
            pixel_value,
            calibration_applied: true,
        })
    } else {
        Ok(MeasurementResult {
            value: pixel_value,
            unit: "px".to_string(),
            pixel_value,
            calibration_applied: false,
        })
    }
}

#[tauri::command]
pub fn measure_area(points: Vec<Point>, calibration: Option<CalibrationScale>) -> Result<AreaResult, String> {
    if points.len() < 3 {
        return Err("Area measurement requires at least 3 points".to_string());
    }

    let n = points.len();
    let mut shoelace = 0.0;
    let mut perimeter = 0.0;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;

    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;

    for i in 0..n {
        let j = (i + 1) % n;
        shoelace += points[i].x * points[j].y - points[j].x * points[i].y;

        let dx = points[j].x - points[i].x;
        let dy = points[j].y - points[i].y;
        perimeter += (dx * dx + dy * dy).sqrt();

        sum_x += points[i].x;
        sum_y += points[i].y;
        min_x = min_x.min(points[i].x);
        min_y = min_y.min(points[i].y);
        max_x = max_x.max(points[i].x);
        max_y = max_y.max(points[i].y);
    }

    let area_pixels = shoelace.abs() / 2.0;
    let centroid = Point {
        x: sum_x / n as f64,
        y: sum_y / n as f64,
    };

    let (area_nm2, perimeter_nm) = if let Some(c) = calibration {
        (
            Some(area_pixels * c.nm_per_pixel * c.nm_per_pixel),
            Some(perimeter * c.nm_per_pixel),
        )
    } else {
        (None, None)
    };

    Ok(AreaResult {
        area_pixels,
        area_nm2,
        perimeter_pixels: perimeter,
        perimeter_nm,
        centroid,
        bounding_box: BoundingBox {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        },
    })
}

#[tauri::command]
pub fn measure_angle(p1: Point, p2: Point, p3: Point) -> Result<f64, String> {
    let v1x = p1.x - p2.x;
    let v1y = p1.y - p2.y;
    let v2x = p3.x - p2.x;
    let v2y = p3.y - p2.y;

    let mag1 = (v1x * v1x + v1y * v1y).sqrt();
    let mag2 = (v2x * v2x + v2y * v2y).sqrt();
    if mag1 == 0.0 || mag2 == 0.0 {
        return Err("Cannot compute angle with zero-length segment".to_string());
    }

    let dot = v1x * v2x + v1y * v2y;
    let cos_angle = (dot / (mag1 * mag2)).clamp(-1.0, 1.0);
    Ok(cos_angle.acos().to_degrees())
}

#[tauri::command]
pub fn export_measurements_csv(
    measurements: Vec<serde_json::Value>,
    output_path: String,
) -> Result<(), String> {
    let mut csv = String::from("id,type,value,unit,pixel_value,calibration_applied\n");

    for m in measurements {
        let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let ty = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let value = m.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let unit = m.get("unit").and_then(|v| v.as_str()).unwrap_or("");
        let pixel_value = m
            .get("pixelValue")
            .or_else(|| m.get("pixel_value"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let calibration_applied = m
            .get("calibrationApplied")
            .or_else(|| m.get("calibration_applied"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        csv.push_str(&format!(
            "{id},{ty},{value},{unit},{pixel_value},{calibration_applied}\n"
        ));
    }

    std::fs::write(output_path, csv).map_err(|e| e.to_string())
}
