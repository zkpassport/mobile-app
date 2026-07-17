use image::io::Reader as ImageReader;
use serde::{Deserialize, Serialize};
use std::ffi::{c_char, CStr, CString};

#[cfg(target_os = "android")]
use jni::{
    objects::{JByteArray, JClass, JString},
    sys::jstring,
    JNIEnv,
};

#[cfg(not(target_abi = "sim"))]
mod facematch;
#[cfg(not(target_abi = "sim"))]
use facematch::{analyze_detection, analyze_embedding, init_sessions, cleanup_sessions, Timing};

// Re-export for tests
#[cfg(not(target_abi = "sim"))]
pub use facematch::{analyze_detection as analyze_detection_internal, analyze_embedding as analyze_embedding_internal, init_sessions as init_sessions_internal, cleanup_sessions as cleanup_sessions_internal};

mod pose;

#[derive(Serialize, Deserialize)]
pub struct FaceDetectionResponse {
    pub landmarks: [[f32; 2]; 5],
    pub pitch: f32,
    pub yaw: f32,
    pub roll: f32,
    pub gaze_magnitude: f32,
    pub gaze_angle_deg: f32,
    pub bbox: [f32; 4], // x1, y1, x2, y2
    pub score: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_ms: Option<Vec<Timing>>,
}

#[derive(Serialize, Deserialize)]
pub struct FaceEmbeddingResponse {
    pub embedding: Vec<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_ms: Option<Vec<Timing>>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Units {
    Radians,
    Degrees,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GazeDirection2D {
    pub magnitude: f32,
    pub angle_deg: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GazeDirectionOptions {
    pub units: Units,
    pub invert_x: bool,
    pub invert_y: bool,
}

impl Default for GazeDirectionOptions {
    fn default() -> Self {
        Self {
            units: Units::Radians,
            invert_x: false,
            invert_y: true,
        }
    }
}

const EPSILON: f32 = 1e-9;

fn to_radians(value:f32, units: Units ) -> f32 {
    match units {
        Units::Radians => value,
        Units::Degrees => value.to_radians(),
    }
}

pub fn compute_gaze_direction(
    pitch: f32,
    yaw: f32,
    options: GazeDirectionOptions,
) -> GazeDirection2D {

    let pitch_rad = to_radians(pitch, options.units);
    let yaw_rad = to_radians(yaw, options.units);

    // map pitch/yaw to a camera-facing direction to project on screen
    let horizontal = pitch_rad.cos() * yaw_rad.sin();
    let vertical = pitch_rad.sin();

    let mut dx = if options.invert_x { -horizontal } else { horizontal };
    let mut dy = if options.invert_y { -vertical } else { vertical };

    // vector length
    let magnitude = (dx.hypot(dy)) as f32;

    if magnitude > EPSILON {
        dx /= magnitude;
        dy /= magnitude;
    } else {
        dx = 0.0;
        dy = 0.0;
    }

    // angle of 2d vector
    let angle_rad = if magnitude > EPSILON { dy.atan2(dx) } else { 0.0 };
    let angle_deg_unwrapped = angle_rad.to_degrees();
    let angle_deg = ((angle_deg_unwrapped % 360.0) + 360.0) % 360.0;

    GazeDirection2D {
        magnitude,
        angle_deg,
    }
}

#[cfg(all(target_os = "ios", target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn facematch_init_sessions(
    detector_path_ptr: *const c_char,
    recognition_path_ptr: *const c_char,
) -> *mut c_char {
    return cstring("{\"success\":true}");
}

#[cfg(not(target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn facematch_init_sessions(
    detector_path_ptr: *const c_char,
    recognition_path_ptr: *const c_char,
) -> *mut c_char {
    if detector_path_ptr.is_null() || recognition_path_ptr.is_null() {
        return cstring("{\"error\":\"null_path\"}");
    }

    let detector_path = match unsafe { CStr::from_ptr(detector_path_ptr) }.to_str() {
        Ok(s) => s,
        Err(_) => return cstring("{\"error\":\"invalid_detector_path\"}"),
    };
    let recognition_path = match unsafe { CStr::from_ptr(recognition_path_ptr) }.to_str() {
        Ok(s) => s,
        Err(_) => return cstring("{\"error\":\"invalid_recognition_path\"}"),
    };

    match init_sessions(detector_path, recognition_path) {
        Ok(_) => cstring("{\"success\":true}"),
        Err(err) => {
            eprintln!("init_sessions error: {}", err);
            let json = format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string()));
            cstring(&json)
        }
    }
}

#[cfg(all(target_os = "ios", target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn facematch_cleanup_sessions() -> *mut c_char {
    return cstring("{\"success\":true}");
}

#[cfg(not(target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn facematch_cleanup_sessions() -> *mut c_char {
    cleanup_sessions();
    cstring("{\"success\":true}")
}

#[cfg(all(target_os = "ios", target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn analyze_face_detection(
    image_bytes_ptr: *const u8,
    len: usize,
    scrfd_path_ptr: *const c_char,
) -> *mut c_char {
    return cstring("{}");
}

#[cfg(not(target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn analyze_face_detection(
    image_bytes_ptr: *const u8,
    len: usize,
    scrfd_path_ptr: *const c_char,
) -> *mut c_char {
    // Safety: caller guarantees pointer+len is valid for read
    let slice = unsafe { std::slice::from_raw_parts(image_bytes_ptr, len as usize) };

    // Decode image
    let img = match ImageReader::new(std::io::Cursor::new(slice)).with_guessed_format() {
        Ok(reader) => match reader.decode() {
            Ok(img) => img,
            Err(_) => return cstring("{\"error\":\"image_decode_failed\"}"),
        },
        Err(_) => return cstring("{\"error\":\"image_format_guess_failed\"}"),
    };

    // Run SCRFD detection only (using global session)
    match analyze_detection(img) {
        Ok((detection, timings)) => {
            // Compute pose from 5 points
            let pf = pose::pose_from_5pts(detection.landmarks);

            // Compute gaze direction from pitch and yaw
            let gaze_options = GazeDirectionOptions {
                units: Units::Radians,
                invert_x: false,
                invert_y: true,
            };
            let gaze = compute_gaze_direction(pf.pitch, pf.yaw, gaze_options);

            let out = FaceDetectionResponse {
                landmarks: detection.landmarks,
                pitch: pf.pitch,
                yaw: pf.yaw,
                roll: pf.roll_deg,
                gaze_magnitude: gaze.magnitude,
                gaze_angle_deg: gaze.angle_deg,
                bbox: detection.bbox,
                score: detection.score,
                timing_ms: Some(timings),
            };
            let json = serde_json::to_string(&out)
                .unwrap_or_else(|_| "{\"error\":\"json\"}".to_string());
            cstring(&json)
        }
        Err(err) => {
            eprintln!("analyze_detection error: {}", err);
            let json = format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string()));
            cstring(&json)
        }
    }
}

#[cfg(all(target_os = "ios", target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn analyze_face_embedding(
    image_bytes_ptr: *const u8,
    len: usize,
    arcface_path_ptr: *const c_char,
    landmarks_json_ptr: *const c_char,
) -> *mut c_char {
    return cstring("{}");
}

#[cfg(not(target_abi = "sim"))]
#[unsafe(no_mangle)]
pub extern "C" fn analyze_face_embedding(
    image_bytes_ptr: *const u8,
    len: usize,
    arcface_path_ptr: *const c_char,
    landmarks_json_ptr: *const c_char,
) -> *mut c_char {
    // Convert C string pointers
    if landmarks_json_ptr.is_null() {
        return cstring("{\"error\":\"null_parameter\"}");
    }
    let landmarks_json = match unsafe { CStr::from_ptr(landmarks_json_ptr) }.to_str() {
        Ok(s) => s,
        Err(_) => return cstring("{\"error\":\"invalid_landmarks_json\"}"),
    };

    // Parse landmarks from JSON
    let landmarks: [[f32; 2]; 5] = match serde_json::from_str(landmarks_json) {
        Ok(l) => l,
        Err(_) => return cstring("{\"error\":\"landmarks_parse_failed\"}"),
    };

    // Safety: caller guarantees pointer+len is valid for read
    let slice = unsafe { std::slice::from_raw_parts(image_bytes_ptr, len as usize) };

    // Decode image
    let img = match ImageReader::new(std::io::Cursor::new(slice)).with_guessed_format() {
        Ok(reader) => match reader.decode() {
            Ok(img) => img,
            Err(_) => return cstring("{\"error\":\"image_decode_failed\"}"),
        },
        Err(_) => return cstring("{\"error\":\"image_format_guess_failed\"}"),
    };

    // Run ArcFace embedding only (using global session)
    match analyze_embedding(img, landmarks) {
        Ok((embedding, timings)) => {
            let out = FaceEmbeddingResponse {
                embedding,
                timing_ms: Some(timings),
            };
            let json = serde_json::to_string(&out)
                .unwrap_or_else(|_| "{\"error\":\"json\"}".to_string());
            cstring(&json)
        }
        Err(err) => {
            eprintln!("analyze_embedding error: {}", err);
            let json = format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string()));
            cstring(&json)
        }
    }
}

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn cstring(s: &str) -> *mut c_char {
    CString::new(s).unwrap().into_raw()
}

// NEW: Android JNI binding for session initialization
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
pub extern "system" fn Java_expo_modules_facematch_FaceMatchJNI_initSessions(
    mut env: JNIEnv,
    _class: JClass,
    detector_path: JString,
    recognition_path: JString,
) -> jstring {
    let result = match init_sessions_jni(&mut env, detector_path, recognition_path) {
        Ok(msg) => msg,
        Err(err) => format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string())),
    };

    env.new_string(result)
        .expect("Couldn't create java string!")
        .into_raw()
}

#[cfg(target_os = "android")]
fn init_sessions_jni(
    env: &mut JNIEnv,
    detector_path: JString,
    recognition_path: JString,
) -> Result<String, Box<dyn std::error::Error>> {
    let detector_path_str: String = env.get_string(&detector_path)?.into();
    let recognition_path_str: String = env.get_string(&recognition_path)?.into();

    init_sessions(&detector_path_str, &recognition_path_str)?;
    Ok("{\"success\":true}".to_string())
}

// NEW: Android JNI binding for session cleanup
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
pub extern "system" fn Java_expo_modules_facematch_FaceMatchJNI_cleanupSessions(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    cleanup_sessions();
    env.new_string("{\"success\":true}")
        .expect("Couldn't create java string!")
        .into_raw()
}

// NEW: Android JNI binding for detection only
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
pub extern "system" fn Java_expo_modules_facematch_FaceMatchJNI_analyzeFaceDetection(
    mut env: JNIEnv,
    _class: JClass,
    image_bytes: JByteArray,
    scrfd_path: JString,
) -> jstring {
    let result = match analyze_face_detection_jni(&mut env, image_bytes, scrfd_path) {
        Ok(json) => json,
        Err(err) => format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string())),
    };

    env.new_string(result)
        .expect("Couldn't create java string!")
        .into_raw()
}

#[cfg(target_os = "android")]
fn analyze_face_detection_jni(
    env: &mut JNIEnv,
    image_bytes: JByteArray,
    _scrfd_path: JString,
) -> Result<String, Box<dyn std::error::Error>> {
    // Convert Java byte array to Vec<u8>
    let bytes = env.convert_byte_array(image_bytes)?;

    // Decode image
    let img = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()?
        .decode()?;

    // Process with analyze_detection function (using global session)
    match analyze_detection(img) {
        Ok((detection, timings)) => {
            let pf = pose::pose_from_5pts(detection.landmarks);

            // Compute gaze direction from pitch and yaw
            let gaze_options = GazeDirectionOptions {
                units: Units::Radians,
                invert_x: false,
                invert_y: true,
            };
            let gaze = compute_gaze_direction(pf.pitch, pf.yaw, gaze_options);

            let out = FaceDetectionResponse {
                landmarks: detection.landmarks,
                pitch: pf.pitch,
                yaw: pf.yaw,
                roll: pf.roll_deg,
                gaze_magnitude: gaze.magnitude,
                gaze_angle_deg: gaze.angle_deg,
                bbox: detection.bbox,
                score: detection.score,
                timing_ms: Some(timings),
            };
            Ok(serde_json::to_string(&out)?)
        }
        Err(err) => Err(err.into()),
    }
}

// NEW: Android JNI binding for embedding only
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
pub extern "system" fn Java_expo_modules_facematch_FaceMatchJNI_analyzeFaceEmbedding(
    mut env: JNIEnv,
    _class: JClass,
    image_bytes: JByteArray,
    arcface_path: JString,
    landmarks_json: JString,
) -> jstring {
    let result = match analyze_face_embedding_jni(&mut env, image_bytes, arcface_path, landmarks_json) {
        Ok(json) => json,
        Err(err) => format!("{{\"error\":\"{}\"}}", escape_json(&err.to_string())),
    };

    env.new_string(result)
        .expect("Couldn't create java string!")
        .into_raw()
}

#[cfg(target_os = "android")]
fn analyze_face_embedding_jni(
    env: &mut JNIEnv,
    image_bytes: JByteArray,
    _arcface_path: JString,
    landmarks_json: JString,
) -> Result<String, Box<dyn std::error::Error>> {
    // Convert Java byte array to Vec<u8>
    let bytes = env.convert_byte_array(image_bytes)?;

    // Convert landmarks JSON string
    let landmarks_json_str: String = env.get_string(&landmarks_json)?.into();

    // Parse landmarks from JSON
    let landmarks: [[f32; 2]; 5] = serde_json::from_str(&landmarks_json_str)?;

    // Decode image
    let img = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()?
        .decode()?;

    // Process with analyze_embedding function (using global session)
    match analyze_embedding(img, landmarks) {
        Ok((embedding, timings)) => {
            let out = FaceEmbeddingResponse {
                embedding,
                timing_ms: Some(timings),
            };
            Ok(serde_json::to_string(&out)?)
        }
        Err(err) => Err(err.into()),
    }
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
