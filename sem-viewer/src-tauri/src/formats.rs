use crate::image_processing::SemMetadata;

#[derive(Debug, Clone)]
pub struct FormatInfo {
    pub format: String,
    pub extension: String,
}

pub fn detect_format(data: &[u8]) -> FormatInfo {
    if data.len() >= 4 && (&data[0..4] == b"II\x2A\x00" || &data[0..4] == b"MM\x00\x2A") {
        return FormatInfo {
            format: "TIFF".to_string(),
            extension: "tiff".to_string(),
        };
    }
    if data.len() >= 8 && &data[0..8] == b"\x89PNG\r\n\x1a\n" {
        return FormatInfo {
            format: "PNG".to_string(),
            extension: "png".to_string(),
        };
    }
    if data.len() >= 3 && &data[0..3] == b"\xFF\xD8\xFF" {
        return FormatInfo {
            format: "JPEG".to_string(),
            extension: "jpg".to_string(),
        };
    }
    if data.len() >= 4 {
        let magic = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
        if magic == 3 {
            return FormatInfo {
                format: "DM3".to_string(),
                extension: "dm3".to_string(),
            };
        }
        if magic == 4 {
            return FormatInfo {
                format: "DM4".to_string(),
                extension: "dm4".to_string(),
            };
        }
    }

    FormatInfo {
        format: "UNKNOWN".to_string(),
        extension: "bin".to_string(),
    }
}

pub fn parse_dm3_metadata(_data: &[u8]) -> Option<SemMetadata> {
    None
}
