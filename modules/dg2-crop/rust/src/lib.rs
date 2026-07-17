use base64::{engine::general_purpose, Engine as _};
use image::{imageops, DynamicImage, ImageFormat, Rgba, RgbaImage};
use std::collections::VecDeque;
use std::ffi::{c_char, CStr, CString};
use std::io::Cursor;

#[cfg(target_os = "android")]
use jni::{
    objects::{JClass, JString},
    sys::jstring,
    JNIEnv,
};

fn is_whiteish(px: Rgba<u8>, tol: u8) -> bool {
    let [r, g, b, a] = px.0;

    // Treat fully transparent as border/background (common with PNGs)
    if a == 0 {
        return true;
    }

    // Per-channel tolerance from 255 (L∞ metric)
    // Using saturating_sub avoids underflow issues.
    (255u8.saturating_sub(r) <= tol)
        && (255u8.saturating_sub(g) <= tol)
        && (255u8.saturating_sub(b) <= tol)
}

/// Flood-fill from edges across white-ish pixels to mark border/background,
/// then crop to the bounding box of remaining pixels.
fn trim_white_border(img: &RgbaImage, tol: u8) -> Option<RgbaImage> {
    let w = img.width() as usize;
    let h = img.height() as usize;

    if w == 0 || h == 0 {
        return None;
    }

    let mut visited = vec![false; w * h];
    let mut q = VecDeque::<(u32, u32)>::new();

    // Helper to check and push white-ish pixels
    let check_and_push = |visited: &mut [bool], q: &mut VecDeque<(u32, u32)>, x: u32, y: u32| {
        let idx = (y as usize) * w + (x as usize);
        if !visited[idx] && is_whiteish(*img.get_pixel(x, y), tol) {
            visited[idx] = true;
            q.push_back((x, y));
        }
    };

    // Seed queue with white-ish pixels along all four edges
    let w_u32 = img.width();
    let h_u32 = img.height();

    for x in 0..w_u32 {
        check_and_push(&mut visited, &mut q, x, 0);
        if h_u32 > 1 {
            check_and_push(&mut visited, &mut q, x, h_u32 - 1);
        }
    }
    for y in 0..h_u32 {
        check_and_push(&mut visited, &mut q, 0, y);
        if w_u32 > 1 {
            check_and_push(&mut visited, &mut q, w_u32 - 1, y);
        }
    }

    // BFS flood fill (4-connected)
    while let Some((x, y)) = q.pop_front() {
        if x > 0 {
            check_and_push(&mut visited, &mut q, x - 1, y);
        }
        if x + 1 < w_u32 {
            check_and_push(&mut visited, &mut q, x + 1, y);
        }
        if y > 0 {
            check_and_push(&mut visited, &mut q, x, y - 1);
        }
        if y + 1 < h_u32 {
            check_and_push(&mut visited, &mut q, x, y + 1);
        }
    }

    // Find bounding box of non-border pixels (not visited)
    let mut found = false;
    let mut min_x = w_u32;
    let mut min_y = h_u32;
    let mut max_x = 0u32;
    let mut max_y = 0u32;

    for y in 0..h_u32 {
        for x in 0..w_u32 {
            let idx = (y as usize) * w + (x as usize);
            if !visited[idx] {
                found = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if !found {
        return None;
    }

    let crop_w = max_x - min_x + 1;
    let crop_h = max_y - min_y + 1;

    Some(imageops::crop_imm(img, min_x, min_y, crop_w, crop_h).to_image())
}

/// Process a base64-encoded image: decode, trim white borders, and re-encode to base64.
/// The output is always encoded as PNG to preserve quality and transparency.
/// Supports JPEG2000 format as a fallback if standard image loading fails.
pub fn trim_white_border_base64(
    base64_input: &str,
    tol: u8,
) -> Result<String, Box<dyn std::error::Error>> {
    // Decode base64 to bytes
    let img_bytes = general_purpose::STANDARD.decode(base64_input)?;

    // Try to load image from bytes
    // First try standard image formats, then fall back to JPEG2000 if that fails
    let dyn_img: DynamicImage = match image::load_from_memory(&img_bytes) {
        Ok(img) => img,
        Err(_) => {
            // Try loading as JPEG2000
            let jp2_image = jpeg2k::Image::from_bytes(&img_bytes)?;
            (&jp2_image).try_into()?
        }
    };

    let rgba = dyn_img.to_rgba8();

    // Trim white borders
    let out = trim_white_border(&rgba, tol).unwrap_or(rgba);

    // Encode result to PNG bytes
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    out.write_to(&mut cursor, ImageFormat::Png)?;

    // Encode PNG bytes to base64
    let base64_output = general_purpose::STANDARD.encode(&png_bytes);

    Ok(base64_output)
}

// iOS FFI binding
#[unsafe(no_mangle)]
pub extern "C" fn trim_dg2_base64(base64_ptr: *const c_char, tolerance: u8) -> *mut c_char {
    if base64_ptr.is_null() {
        return cstring("{\"error\":\"null_input\"}");
    }

    let base64_input = match unsafe { CStr::from_ptr(base64_ptr) }.to_str() {
        Ok(s) => s,
        Err(_) => return cstring("{\"error\":\"invalid_utf8\"}"),
    };

    match trim_white_border_base64(base64_input, tolerance) {
        Ok(result) => {
            // Return JSON with the base64 result
            let json = format!("{{\"result\":\"{}\"}}", result);
            cstring(&json)
        }
        Err(err) => {
            eprintln!("trim_dg2_base64 error: {}", err);
            let json = format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string()));
            cstring(&json)
        }
    }
}

// Android JNI binding
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
pub extern "system" fn Java_expo_modules_dg2crop_Dg2CropJNI_trimWhiteBorderBase64(
    mut env: JNIEnv,
    _class: JClass,
    base64_input: JString,
    tolerance: i32,
) -> jstring {
    let result = match trim_white_border_base64_jni(&mut env, base64_input, tolerance as u8) {
        Ok(base64_output) => format!("{{\"result\":\"{}\"}}", base64_output),
        Err(err) => format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string())),
    };

    env.new_string(result)
        .expect("Couldn't create java string!")
        .into_raw()
}

#[cfg(target_os = "android")]
fn trim_white_border_base64_jni(
    env: &mut JNIEnv,
    base64_input: JString,
    tolerance: u8,
) -> Result<String, Box<dyn std::error::Error>> {
    let base64_str: String = env.get_string(&base64_input)?.into();
    trim_white_border_base64(&base64_str, tolerance)
}

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn cstring(s: &str) -> *mut c_char {
    CString::new(s).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_string_free(s: *mut c_char) {
    if s.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(s);
    }
}
