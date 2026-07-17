use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use nalgebra as na;
use ndarray::{Array, Array4, Axis, Ix2};
use ort::{session::Session, value::Tensor};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "ios")]
use ort::execution_providers::coreml::{CoreMLComputeUnits, CoreMLExecutionProvider};

// Global sessions for reuse across calls
static mut DETECTION_SESSION: Option<Session> = None;
static mut RECOGNITION_SESSION: Option<Session> = None;

const FACE_DETECTION_THRESHOLD: f32 = 0.3;
const FACE_NMS_THRESHOLD: f32 = 0.45;

const IN_W: usize = 640;
const IN_H: usize = 640;
const ARC_W: usize = 112;
const ARC_H: usize = 112;

// ArcFace reference 5 points
const REF_5PTS: [[f32; 2]; 5] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
];

#[derive(Clone, Debug)]
struct Cand {
    score: f32,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    kps: [[f32; 2]; 5],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Timing {
    pub name: String,
    pub duration_ms: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DetectionResult {
    pub landmarks: [[f32; 2]; 5],
    pub bbox: [f32; 4],
    pub score: f32,
}

#[cfg(target_os = "ios")]
fn make_session(model: &str) -> ort::Result<Session> {
    let ep = CoreMLExecutionProvider::default()
        .with_compute_units(CoreMLComputeUnits::CPUAndNeuralEngine) // try ALL vs CPUAndNE vs CPUOnly
        .with_profile_compute_plan(true) // log per-op HW
        .with_static_input_shapes(true) // require fixed shapes
        .with_subgraphs(false) // usually avoid unless your model needs it
        .build();

    Session::builder()?
        .with_execution_providers([ep])?
        // .with_optimization_level(GraphOptimizationLevel::Level3)? // enable fusions
        .commit_from_file(model)
}

#[cfg(not(target_os = "ios"))]
fn make_session(model: &str) -> Result<Session> {
    let session = Session::builder()?
        .commit_from_file(model)
        .with_context(|| format!("loading model at {}", model))?;
    Ok(session)
}

/// Initialize both detection and recognition sessions.
/// Must be called once before using detection or embedding.
/// Called on mount of the facematch component
pub fn init_sessions(detector_path: &str, recognition_path: &str) -> Result<()> {
  unsafe {
    let det_ptr = std::ptr::addr_of_mut!(DETECTION_SESSION);
    let rec_ptr = std::ptr::addr_of_mut!(RECOGNITION_SESSION);

    if (*det_ptr).is_some() {
      return Err(anyhow::anyhow!("sessions already initialized - call cleanup_sessions first"));
    }
    let det = make_session(detector_path)
      .with_context(|| format!("loading SCRFD detector at {}", detector_path))?;
    let rec = make_session(recognition_path)
      .with_context(|| format!("loading ArcFace recognition at {}", recognition_path))?;

    *det_ptr = Some(det);
    *rec_ptr = Some(rec);

    Ok(())
  }
}

/// Cleanup both sessions and free memory.
/// Called on unmount of the facematch component
pub fn cleanup_sessions() {
  unsafe {
    let det_ptr = std::ptr::addr_of_mut!(DETECTION_SESSION);
    let rec_ptr = std::ptr::addr_of_mut!(RECOGNITION_SESSION);

    *det_ptr = None;
    *rec_ptr = None;
  }
}

/// Runs ArcFace on a preprocessed 112x112 RGB tensor and returns the raw embedding row.
/// TODO: Remove timings
pub fn embed_arcface(sess: &mut Session, x: &Array4<f32>) -> Result<(Vec<f32>, Vec<Timing>)> {
    let mut timings = Vec::new();
    let start = std::time::Instant::now();

    let t = Tensor::from_array(x.clone().into_dyn())?;
    let outs = sess.run(ort::inputs![t])?;
    let view: ndarray::ArrayViewD<'_, f32> = outs[0].try_extract_array()?;
    let row = view
        .into_dimensionality::<Ix2>()?
        .index_axis(Axis(0), 0)
        .to_owned();

    let end = std::time::Instant::now();
    let duration = end.duration_since(start);
    timings.push(Timing { name: "embed_arcface".to_string(), duration_ms: duration.as_secs_f32() * 1000.0 });

    Ok((row.into_raw_vec_and_offset().0, timings))
}

/// SCRFD face detection only
pub fn analyze_detection(
    img: DynamicImage,
) -> Result<(DetectionResult, Vec<Timing>)> {
    let mut timings = Vec::new();

    // Get global SCRFD session
    let start_session = std::time::Instant::now();
    let det_sess = unsafe {
        let det_ptr = std::ptr::addr_of_mut!(DETECTION_SESSION);
        (*det_ptr).as_mut()
            .context("detection session not initialized - call init_sessions first")?
    };
    let duration_ms = start_session.elapsed().as_secs_f32() * 1000.0;
    timings.push(Timing { name: "fetch detection session".to_string(), duration_ms });

    // Letterbox to 640x640 RGB (done once, reused for all runs)
    let start_letterbox = std::time::Instant::now();

    let (tensor, scale, pad_x, pad_y) = letterbox_to_rgb_tensor(&img, IN_W as u32, IN_H as u32)?;
    let duration_ms = start_letterbox.elapsed().as_secs_f32() * 1000.0;
    timings.push(Timing { name: "letterbox_to_rgb_tensor".to_string(), duration_ms });

    let start_inference = std::time::Instant::now();
    // SCRFD inference
    let t = Tensor::from_array(tensor.into_dyn())?;
    let outs = det_sess.run(ort::inputs![t])?;
    let duration_ms = start_inference.elapsed().as_secs_f32() * 1000.0;
    timings.push(Timing { name: "SCRFD inference".to_string(), duration_ms });

    let start_decode = std::time::Instant::now();
    // SCRFD decode (same as analyze())
    let mut cands = Vec::new();
    for (si, &stride) in [8usize, 16, 32].iter().enumerate() {
        let cls_view = outs[0 + si].try_extract_array::<f32>()?;
        let bbox_view = outs[3 + si].try_extract_array::<f32>()?;
        let kps_view = outs[6 + si].try_extract_array::<f32>()?;

        let cls2 = cls_view.into_dimensionality::<Ix2>()?;
        let bbox2 = bbox_view.into_dimensionality::<Ix2>()?;
        let kps2 = kps_view.into_dimensionality::<Ix2>()?;

        let n = cls2.shape()[0];
        let ws = IN_W / stride;
        let hs = IN_H / stride;
        let grid = ws * hs;
        assert!(
            n % grid == 0,
            "SCRFD: N {} not divisible by grid {} for stride {}",
            n,
            grid,
            stride
        );
        let anchors_per_loc = n / grid;

        for p in 0..n {
            let s = cls2[[p, 0]];
            if s < FACE_DETECTION_THRESHOLD {
                continue;
            }

            let q = p / anchors_per_loc;
            let i = q / ws;
            let j = q % ws;

            let cx = (j as f32) * stride as f32;
            let cy = (i as f32) * stride as f32;

            let dl = bbox2[[p, 0]].max(0.0) * stride as f32;
            let dt = bbox2[[p, 1]].max(0.0) * stride as f32;
            let dr = bbox2[[p, 2]].max(0.0) * stride as f32;
            let db = bbox2[[p, 3]].max(0.0) * stride as f32;

            let x1 = cx - dl;
            let y1 = cy - dt;
            let x2 = cx + dr;
            let y2 = cy + db;

            let mut pts = [[0f32; 2]; 5];
            for k in 0..5 {
                let dx = kps2[[p, 2 * k]] * stride as f32;
                let dy = kps2[[p, 2 * k + 1]] * stride as f32;
                pts[k] = [cx + dx, cy + dy];
            }

            let (x1i, y1i, x2i, y2i, ptsi) =
                undo_letterbox(x1, y1, x2, y2, &pts, scale, pad_x, pad_y);
            cands.push(Cand {
                score: s,
                x1: x1i,
                y1: y1i,
                x2: x2i,
                y2: y2i,
                kps: ptsi,
            });
        }
    }
    let duration_ms = start_decode.elapsed().as_secs_f32() * 1000.0;
    timings.push(Timing { name: "SCRFD decode".to_string(), duration_ms });

    // NMS, pick biggest
    let keep = nms(&mut cands, FACE_NMS_THRESHOLD);
    let face = keep
        .into_iter()
        .max_by(|a, b| {
            ((a.x2 - a.x1) * (a.y2 - a.y1))
                .partial_cmp(&((b.x2 - b.x1) * (b.y2 - b.y1)))
                .unwrap()
        })
        .context("no_face_found")?;

    Ok((
        DetectionResult {
            landmarks: face.kps,
            bbox: [face.x1, face.y1, face.x2, face.y2],
            score: face.score,
        },
        timings,
    ))
}

/// ArcFace embedding only
pub fn analyze_embedding(
    img: DynamicImage,
    landmarks: [[f32; 2]; 5],
) -> Result<(Vec<f32>, Vec<Timing>)> {
    let mut timings = Vec::new();

    let start_session = std::time::Instant::now();
    // Get global ArcFace session
    let rec_sess = unsafe {
        let rec_ptr = std::ptr::addr_of_mut!(RECOGNITION_SESSION);
        (*rec_ptr).as_mut()
            .context("recognition session not initialized - call init_sessions first")?
    };
    let duration_ms = start_session.elapsed().as_secs_f32() * 1000.0;
    timings.push(Timing { name: "fetch recognition session".to_string(), duration_ms });

    // Align to 112x112 using provided landmarks
    let aligned = align_to_112(&img, &landmarks)?;

    // Preprocess → ArcFace → embedding
    let x = preprocess_arcface(&aligned);
    let (embedding, mut inference_timings) = embed_arcface(rec_sess, &x)?;

    // Add inference timings
    timings.append(&mut inference_timings);

    Ok((embedding, timings))
}

fn letterbox_to_rgb_tensor(
    img: &DynamicImage,
    out_w: u32,
    out_h: u32,
) -> Result<(Array4<f32>, f32, u32, u32)> {
    // Match InsightFace SCRFD.detect() letterboxing exactly: top-left placement
    let (w, h) = img.dimensions();
    let im_ratio = h as f32 / w as f32;
    let model_ratio = out_h as f32 / out_w as f32;
    let (new_w, new_h) = if im_ratio > model_ratio {
        let nh = out_h; // height fits
        let nw = ((nh as f32) / im_ratio).floor() as u32;
        (nw, nh)
    } else {
        let nw = out_w; // width fits
        let nh = ((nw as f32) * im_ratio).floor() as u32;
        (nw, nh)
    };
    let det_scale = new_h as f32 / h as f32;

    // Use nearest neighbor for faster preprocessing
    let resized = img
        .resize_exact(new_w, new_h, image::imageops::Nearest)
        .to_rgb8();

    let mut canvas = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_pixel(out_w, out_h, Rgb([0, 0, 0]));
    image::imageops::replace(&mut canvas, &resized, 0, 0);

    // Convert to tensor: RGB channels, normalized with (x-127.5)/128.0
    // This matches cv2.dnn.blobFromImage(img, scale=1/128, mean=127.5, swapRB=True)
    // Optimized approach: process raw pixel data directly instead of pixel-by-pixel access
    let canvas_raw = canvas.into_raw();
    let total_pixels = (out_w * out_h) as usize;

    // Pre-allocate tensor with shape [1, 3, height, width] (NCHW format)
    let mut x = Array::zeros((1, 3, out_h as usize, out_w as usize));

    // Get direct access to tensor data for efficient channel-wise filling
    let x_data = x.as_slice_mut().unwrap();
    let channel_size = total_pixels;

    // Split tensor data into separate R, G, B channel slices for direct indexing
    let (r_slice, rest) = x_data.split_at_mut(channel_size);
    let (g_slice, b_slice) = rest.split_at_mut(channel_size);

    // Process pixels in chunks to improve cache locality and reduce overhead
    const CHUNK_SIZE: usize = 1024; // Process 1024 pixels at a time
    let chunks = canvas_raw.chunks_exact(3 * CHUNK_SIZE); // Each pixel = 3 bytes (RGB)
    let remainder = chunks.remainder();

    let mut pixel_idx = 0;

    // Process full chunks (most pixels)
    for chunk in chunks {
        for i in (0..chunk.len()).step_by(3) {
            let r = chunk[i] as f32;
            let g = chunk[i + 1] as f32;
            let b = chunk[i + 2] as f32;

            // Apply normalization: (pixel_value - 127.5) / 128.0
            // This centers values around 0 and scales to approximately [-1, 1]
            r_slice[pixel_idx] = (r - 127.5) / 128.0;
            g_slice[pixel_idx] = (g - 127.5) / 128.0;
            b_slice[pixel_idx] = (b - 127.5) / 128.0;

            pixel_idx += 1;
        }
    }

    // Process remaining pixels (if total pixels not divisible by CHUNK_SIZE)
    for i in (0..remainder.len()).step_by(3) {
        let r = remainder[i] as f32;
        let g = remainder[i + 1] as f32;
        let b = remainder[i + 2] as f32;

        r_slice[pixel_idx] = (r - 127.5) / 128.0;
        g_slice[pixel_idx] = (g - 127.5) / 128.0;
        b_slice[pixel_idx] = (b - 127.5) / 128.0;

        pixel_idx += 1;
    }

    // pad_x, pad_y are zero due to top-left placement
    Ok((x, det_scale, 0, 0))
}

fn undo_letterbox(
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    kps: &[[f32; 2]; 5],
    scale: f32,
    pad_x: u32,
    pad_y: u32,
) -> (f32, f32, f32, f32, [[f32; 2]; 5]) {
    let inv = |x: f32, y: f32| -> (f32, f32) {
        let xi = (x - pad_x as f32) / scale;
        let yi = (y - pad_y as f32) / scale;
        (xi, yi)
    };
    let (x1i, y1i) = inv(x1, y1);
    let (x2i, y2i) = inv(x2, y2);
    let mut out = [[0f32; 2]; 5];
    for i in 0..5 {
        let (xi, yi) = inv(kps[i][0], kps[i][1]);
        out[i] = [xi, yi];
    }
    (x1i, y1i, x2i, y2i, out)
}

fn iou(a: &Cand, b: &Cand) -> f32 {
    let x1 = a.x1.max(b.x1);
    let y1 = a.y1.max(b.y1);
    let x2 = a.x2.min(b.x2);
    let y2 = a.y2.min(b.y2);
    let w = (x2 - x1).max(0.0);
    let h = (y2 - y1).max(0.0);
    let inter = w * h;
    let area_a = (a.x2 - a.x1) * (a.y2 - a.y1);
    let area_b = (b.x2 - b.x1) * (b.y2 - b.y1);
    inter / (area_a + area_b - inter + 1e-6)
}

fn nms(cands: &mut Vec<Cand>, iou_th: f32) -> Vec<Cand> {
    cands.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    let mut keep = Vec::new();
    let mut suppressed = vec![false; cands.len()];
    for i in 0..cands.len() {
        if suppressed[i] {
            continue;
        }
        keep.push(cands[i].clone());
        for j in (i + 1)..cands.len() {
            if suppressed[j] {
                continue;
            }
            if iou(&cands[i], &cands[j]) > iou_th {
                suppressed[j] = true;
            }
        }
    }
    keep
}

// ===== Alignment to 112×112 =====

fn umeyama_similarity(src: &[[f32; 2]; 5], dst: &[[f32; 2]; 5]) -> na::Matrix2x3<f32> {
    let n = 5usize;
    let (mut sx, mut sy, mut dx, mut dy) = (0f32, 0f32, 0f32, 0f32);
    for i in 0..n {
        sx += src[i][0];
        sy += src[i][1];
        dx += dst[i][0];
        dy += dst[i][1];
    }
    let src_mean = na::Vector2::new(sx / n as f32, sy / n as f32);
    let dst_mean = na::Vector2::new(dx / n as f32, dy / n as f32);

    let mut x = na::Matrix2xX::<f32>::zeros(n);
    let mut y = na::Matrix2xX::<f32>::zeros(n);
    for i in 0..n {
        x[(0, i)] = src[i][0] - src_mean.x;
        x[(1, i)] = src[i][1] - src_mean.y;
        y[(0, i)] = dst[i][0] - dst_mean.x;
        y[(1, i)] = dst[i][1] - dst_mean.y;
    }
    let sigma = &y * x.transpose() / n as f32;
    let svd = sigma.svd(true, true);
    let (u, v_t) = (svd.u.unwrap(), svd.v_t.unwrap());
    let mut d = na::Matrix2::<f32>::identity();
    if (u.determinant() * v_t.determinant()) < 0.0 {
        d[(1, 1)] = -1.0;
    }
    let r = &u * d * &v_t;
    let var_x = (x.component_mul(&x)).sum() / n as f32;
    let s = (svd
        .singular_values
        .component_mul(&na::Vector2::new(d[(0, 0)], d[(1, 1)]))
        .sum())
        / var_x;
    let t = dst_mean - s * (r * src_mean);

    let mut m = na::Matrix2x3::<f32>::zeros();
    m[(0, 0)] = s * r[(0, 0)];
    m[(0, 1)] = s * r[(0, 1)];
    m[(0, 2)] = t.x;
    m[(1, 0)] = s * r[(1, 0)];
    m[(1, 1)] = s * r[(1, 1)];
    m[(1, 2)] = t.y;
    m
}

fn align_to_112(img: &DynamicImage, kps: &[[f32; 2]; 5]) -> Result<Vec<u8>> {
    let m = umeyama_similarity(kps, &REF_5PTS);
    // Inverse for sampling
    let a = m[(0, 0)];
    let b = m[(0, 1)];
    let c = m[(0, 2)];
    let d = m[(1, 0)];
    let e = m[(1, 1)];
    let f = m[(1, 2)];
    let det = a * e - b * d;
    let inv_a = e / det;
    let inv_b = -b / det;
    let inv_d = -d / det;
    let inv_e = a / det;
    let inv_c = -(inv_a * c + inv_b * f);
    let inv_f = -(inv_d * c + inv_e * f);

    let rgb = img.to_rgb8();
    let (sw, sh) = (rgb.width() as usize, rgb.height() as usize);
    let mut out = vec![0u8; ARC_W * ARC_H * 3];

    let raw = rgb.into_raw();

    let sample = |x: isize, y: isize, ch: usize| -> u8 {
        if x < 0 || y < 0 || x >= sw as isize || y >= sh as isize {
            return 0;
        }
        let o = (y as usize * sw + x as usize) * 3 + ch;
        raw[o]
    };

    for y in 0..ARC_H {
        for x in 0..ARC_W {
            let sx = inv_a * (x as f32) + inv_b * (y as f32) + inv_c;
            let sy = inv_d * (x as f32) + inv_e * (y as f32) + inv_f;
            let x0 = sx.floor() as isize;
            let y0 = sy.floor() as isize;
            let dx = sx - x0 as f32;
            let dy = sy - y0 as f32;

            for ch in 0..3 {
                let p00 = sample(x0, y0, ch) as f32;
                let p01 = sample(x0 + 1, y0, ch) as f32;
                let p10 = sample(x0, y0 + 1, ch) as f32;
                let p11 = sample(x0 + 1, y0 + 1, ch) as f32;

                let top = p00 * (1.0 - dx) + p01 * dx;
                let bot = p10 * (1.0 - dx) + p11 * dx;
                let v = top * (1.0 - dy) + bot * dy;

                let o = (y * ARC_W + x) * 3 + ch;
                out[o] = v.clamp(0.0, 255.0) as u8;
            }
        }
    }
    Ok(out)
}

// ===== ArcFace embedding =====

fn preprocess_arcface(aligned_rgb: &[u8]) -> Array4<f32> {
    let mut x = Array::zeros((1, 3, ARC_H, ARC_W));
    for y in 0..ARC_H {
        for xpix in 0..ARC_W {
            let i = (y * ARC_W + xpix) * 3;
            let r = aligned_rgb[i] as f32;
            let g = aligned_rgb[i + 1] as f32;
            let b = aligned_rgb[i + 2] as f32;
            // ArcFaceONNX uses blobFromImages(..., swapRB=True, mean=127.5, std=127.5)
            // i.e. feed RGB channels, (x-127.5)/127.5
            x[[0, 0, y, xpix]] = (r - 127.5) / 127.5; // R
            x[[0, 1, y, xpix]] = (g - 127.5) / 127.5; // G
            x[[0, 2, y, xpix]] = (b - 127.5) / 127.5; // B
        }
    }
    x
}

// fn sigmoid(x: f32) -> f32 {
//     1.0 / (1.0 + (-x).exp())
// }

// pub fn l2_norm(mut v: Vec<f32>) -> Vec<f32> {
//     let n = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-10);
//     for x in &mut v {
//         *x /= n;
//     }
//     v
// }

// pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
//     a.iter().zip(b).map(|(x, y)| x * y).sum()
// }

// fn save_kps_txt(src_path: &str, landmarks: &[[f32; 2]; 5]) -> Result<()> {
//     let target_dir = std::path::Path::new("input/aligned");
//     std::fs::create_dir_all(target_dir)?;
//     let stem = std::path::Path::new(src_path)
//         .file_stem()
//         .and_then(|s| s.to_str())
//         .unwrap_or("aligned");
//     let out_path = target_dir.join(format!("{}_kps.txt", stem));
//     let mut s = String::new();
//     for i in 0..5 {
//         s.push_str(&format!("{:.6},{:.6}\n", landmarks[i][0], landmarks[i][1]));
//     }
//     std::fs::write(&out_path, s)?;
//     println!("Saved landmarks: {}", out_path.display());
//     Ok(())
// }

// fn save_aligned_plain(aligned_rgb: &[u8], src_path: &str) -> Result<()> {
//     let target_dir = std::path::Path::new("input/aligned");
//     std::fs::create_dir_all(target_dir)?;

//     let stem = std::path::Path::new(src_path)
//         .file_stem()
//         .and_then(|s| s.to_str())
//         .unwrap_or("aligned");
//     let out_path = target_dir.join(format!("{}_aligned_plain.png", stem));

//     let img_buf =
//         ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(ARC_W as u32, ARC_H as u32, aligned_rgb.to_vec())
//             // Failed to create 112x112 RGB buffer for saving plain aligned crop
//             .context("failed_to_create_112x112_rgb_buffer")?;

//     img_buf.save(&out_path)?;
//     println!("Saved aligned crop (plain): {}", out_path.display());
//     Ok(())
// }

// fn save_aligned_crop(aligned_rgb: &[u8], src_path: &str, landmarks: &[[f32; 2]; 5]) -> Result<()> {
//     // Ensure target directory exists
//     let target_dir = std::path::Path::new("input/aligned");
//     std::fs::create_dir_all(target_dir)?;

//     let stem = std::path::Path::new(src_path)
//         .file_stem()
//         .and_then(|s| s.to_str())
//         .unwrap_or("aligned");
//     let out_path = target_dir.join(format!("{}_aligned.png", stem));

//     // Create a mutable copy of the aligned image to draw landmarks on
//     let mut img_with_landmarks = aligned_rgb.to_vec();

//     // Transform landmarks from original coordinates to aligned 112x112 coordinates
//     // Compute the transformation matrix to see where the detected landmarks map to
//     let transform = umeyama_similarity(landmarks, &REF_5PTS);

//     let landmark_colors = [
//         [255, 0, 0],   // Left eye - Red
//         [0, 255, 0],   // Right eye - Green
//         [0, 0, 255],   // Nose - Blue
//         [255, 255, 0], // Left mouth - Yellow
//         [255, 0, 255], // Right mouth - Magenta
//     ];

//     // Apply transformation to each detected landmark to get its position in aligned space
//     for (i, &[src_x, src_y]) in landmarks.iter().enumerate() {
//         let transformed_x =
//             transform[(0, 0)] * src_x + transform[(0, 1)] * src_y + transform[(0, 2)];
//         let transformed_y =
//             transform[(1, 0)] * src_x + transform[(1, 1)] * src_y + transform[(1, 2)];

//         let cx = transformed_x.round() as i32;
//         let cy = transformed_y.round() as i32;
//         let color = landmark_colors[i];

//         // Draw a small circle (3x3 pixels) around each landmark
//         for dy in -1..=1 {
//             for dx in -1..=1 {
//                 let px = cx + dx;
//                 let py = cy + dy;

//                 // Check bounds
//                 if px >= 0 && py >= 0 && px < ARC_W as i32 && py < ARC_H as i32 {
//                     let idx = ((py as usize) * ARC_W + (px as usize)) * 3;
//                     if idx + 2 < img_with_landmarks.len() {
//                         img_with_landmarks[idx] = color[0]; // R
//                         img_with_landmarks[idx + 1] = color[1]; // G
//                         img_with_landmarks[idx + 2] = color[2]; // B
//                     }
//                 }
//             }
//         }
//     }

//     let img_buf =
//         ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(ARC_W as u32, ARC_H as u32, img_with_landmarks)
//             // Failed to create 112x112 RGB buffer for saving plain aligned crop
//             .context("failed_to_create_112x112_rgb_buffer")?;

//     img_buf.save(&out_path)?;
//     println!("Saved aligned crop with landmarks: {}", out_path.display());
//     Ok(())
// }
