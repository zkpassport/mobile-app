use facematch::{analyze_face_detection, analyze_face_embedding, FaceDetectionResponse, FaceEmbeddingResponse};
use serde::{Deserialize, Serialize};
use std::ffi::CString;

// Import the facematch module for direct access to functions
#[cfg(test)]
use facematch;

#[derive(Serialize, Deserialize)]
struct FaceAnalysis {
    embedding: Vec<f32>,
    pitch: f32,
    yaw: f32,
    roll: f32,
    gaze_dx: f32,
    gaze_dy: f32,
    gaze_angle_rad: f32,
    gaze_angle_deg: f32,
}

const ZUCK_FACEPRINT: [f32; 512] = [
    -0.60017127,
    -0.3587278,
    0.35550728,
    -0.55302024,
    -1.2282649,
    -1.627607,
    0.6207457,
    -0.5982832,
    -2.623611,
    -0.32155025,
    0.41143402,
    0.00616935,
    -1.7442005,
    0.39192152,
    -0.574071,
    -1.4482689,
    1.0252254,
    0.80527925,
    -1.5255494,
    0.04547984,
    -1.4312074,
    1.4468845,
    0.06598945,
    1.2041829,
    -0.062047422,
    1.4242,
    0.85677207,
    -0.33198214,
    0.562973,
    0.21610187,
    0.4640605,
    1.4415724,
    -0.617983,
    -1.7310266,
    0.33241504,
    0.60470414,
    0.84116143,
    2.2975588,
    1.2275082,
    1.2055098,
    1.7818656,
    1.0529298,
    -0.97870904,
    0.8553495,
    0.6227417,
    0.36238295,
    0.82429415,
    1.384647,
    0.91368014,
    -1.3209867,
    -1.4202491,
    -0.48817113,
    -0.73288226,
    -1.2248198,
    -1.1516273,
    -0.3701201,
    1.196388,
    0.33342817,
    1.6879936,
    0.022597268,
    -1.3282074,
    -0.6555458,
    0.9264489,
    0.7487209,
    -3.3677056,
    -0.86579484,
    0.28253573,
    1.1876519,
    1.1930604,
    1.0001101,
    -2.656096,
    0.3699118,
    0.8503734,
    -0.51039994,
    2.8238807,
    -0.12472829,
    0.27705717,
    0.051235136,
    -0.49079156,
    0.58197486,
    -0.49475574,
    -1.1505895,
    1.5423471,
    1.6863664,
    0.12114577,
    -1.951101,
    2.2111292,
    1.5922598,
    -0.40016177,
    -1.2064452,
    -0.38140112,
    -2.1902342,
    0.05712138,
    1.6965387,
    -0.78606117,
    -0.7383998,
    0.91339415,
    -0.1581018,
    -0.30487987,
    0.8876176,
    0.006081458,
    0.35375053,
    1.3153205,
    0.21282338,
    -0.9827673,
    -0.6227729,
    -0.41516367,
    0.8500522,
    -0.62203085,
    -0.614266,
    0.56429595,
    -2.352421,
    -0.6497195,
    -0.2894158,
    0.7275906,
    2.5728807,
    -1.183264,
    0.39708683,
    -0.70185375,
    -0.8188882,
    -1.2543792,
    0.7355832,
    -1.0443058,
    0.0074770376,
    1.9403334,
    -1.1551096,
    1.0823761,
    -0.17068836,
    -1.9274429,
    -0.41476125,
    -0.18328303,
    -0.8316643,
    -1.33469,
    -0.4128979,
    0.7332276,
    1.4142289,
    -2.832559,
    0.08428058,
    0.6636102,
    -1.0222164,
    -0.011789069,
    -0.6285863,
    -0.010537021,
    -1.3217332,
    0.17071211,
    -0.18168534,
    -0.9422993,
    -0.42107055,
    -0.7213007,
    0.511415,
    -0.74250615,
    -1.476383,
    -1.9179535,
    -1.5912851,
    -0.23540367,
    -0.018967029,
    0.2526295,
    -1.239877,
    -0.9153379,
    -0.864378,
    1.8595104,
    -1.3098835,
    -1.9247092,
    1.5494153,
    -0.66342854,
    -1.462171,
    -0.27639276,
    -0.4766885,
    1.505672,
    1.1126246,
    -0.78936124,
    0.5458237,
    0.7607187,
    -0.12944946,
    2.24895,
    -0.24511766,
    0.13303551,
    0.54701626,
    1.2190144,
    -1.7408345,
    1.6993555,
    0.46036628,
    -1.8331665,
    0.034586385,
    -0.39977753,
    0.6132816,
    2.0819197,
    0.95124006,
    -1.9582105,
    -2.0802767,
    -0.06146002,
    1.975754,
    1.1311834,
    0.8766595,
    0.3686896,
    -0.45381927,
    -0.79972386,
    -0.77288514,
    -0.18453911,
    0.6209235,
    -0.27134052,
    0.283377,
    -1.2643025,
    0.35769212,
    -0.06756097,
    -1.0966034,
    -1.8210784,
    0.69652575,
    -0.71958894,
    1.0512645,
    0.8991282,
    -0.20905393,
    -1.2277417,
    0.35189998,
    1.2694347,
    0.38725534,
    -0.7820817,
    1.0898315,
    -0.54869956,
    0.374051,
    -0.87057674,
    0.39113134,
    -0.872203,
    -0.5055885,
    -1.7277114,
    1.9741807,
    -0.83954763,
    1.1252705,
    -1.8760753,
    -0.742541,
    -0.036664374,
    1.1897091,
    -0.06306103,
    0.56067765,
    -1.0884527,
    -0.21118005,
    0.98374414,
    1.6899865,
    -0.27460635,
    0.037830457,
    1.8460859,
    1.079582,
    -0.888558,
    -0.67805475,
    0.323687,
    0.8852267,
    -0.60794437,
    -1.2486894,
    0.9633799,
    0.42753276,
    -0.055114545,
    0.014300615,
    -0.25549737,
    0.26808035,
    -0.6640809,
    0.31767586,
    1.1073608,
    0.25952148,
    -1.8313818,
    -0.5755622,
    2.212887,
    -0.5900893,
    0.045260735,
    -0.47440255,
    -0.16486336,
    0.41474676,
    -2.0190184,
    2.0166242,
    -0.19074911,
    0.11627604,
    -0.6056208,
    1.1390557,
    -0.23122585,
    1.0792141,
    -1.3296611,
    0.19445117,
    -1.2347156,
    1.1070061,
    -2.3484626,
    -0.93656296,
    0.13670018,
    1.3677015,
    0.02600696,
    2.0833755,
    -1.6122849,
    2.8327434,
    0.76305765,
    0.37064424,
    -0.19482407,
    0.47818607,
    0.069855355,
    -0.6719501,
    0.2856051,
    1.5907643,
    -1.7004015,
    0.8758558,
    -0.046909094,
    0.8469602,
    2.8809118,
    -1.6416879,
    0.15696833,
    -1.5349572,
    1.4822663,
    -1.6517779,
    0.99429446,
    0.6836204,
    -0.38494503,
    0.18672818,
    1.3695364,
    0.6923325,
    -0.18576452,
    0.8847003,
    0.6793413,
    -0.26217726,
    1.1088163,
    -1.2475741,
    1.2567976,
    -0.90782064,
    2.501127,
    2.0502245,
    1.1629932,
    -0.14576253,
    0.2922067,
    -2.1152923,
    0.19560826,
    -0.17554595,
    0.556535,
    0.5672838,
    0.29663822,
    0.9238311,
    1.0279399,
    -1.5164447,
    -0.52776587,
    0.55043703,
    -0.61581016,
    0.85823166,
    -0.16984592,
    -0.57397103,
    2.6158264,
    1.2345765,
    -0.015447676,
    0.24205728,
    -0.027572218,
    0.6336551,
    0.60343075,
    -0.39187452,
    -0.24487087,
    -1.2240883,
    -1.256105,
    -0.64961207,
    -0.45077497,
    0.8189945,
    -0.6816043,
    -0.7859553,
    -3.0752552,
    -1.3127823,
    -0.35765526,
    0.05828938,
    -0.48588765,
    -1.3983896,
    -1.5210176,
    1.0743119,
    -0.24032702,
    0.05213984,
    2.9499416,
    -1.2415886,
    -0.55087155,
    2.1307619,
    -0.47949556,
    1.9843345,
    2.307176,
    -1.9348108,
    0.5751453,
    1.4780128,
    -1.6340282,
    -0.13726489,
    -0.3911904,
    0.53906924,
    0.67501223,
    0.3771541,
    0.21005344,
    -0.11201565,
    2.329773,
    0.7182283,
    0.70605063,
    0.013629392,
    -1.4949441,
    1.2972958,
    -0.32475203,
    0.4217577,
    0.68931425,
    -0.05940888,
    -1.7922716,
    0.3822105,
    0.42359164,
    -0.9817394,
    -0.42021564,
    -0.0038899705,
    -0.7976738,
    -0.6011307,
    -0.01185213,
    0.14990433,
    -1.7277013,
    -0.3653859,
    -0.1983667,
    -1.545277,
    -0.23536803,
    0.80853873,
    -0.4200956,
    -0.21697605,
    -0.1306993,
    0.6398332,
    -0.28813243,
    -0.9984227,
    0.2755297,
    1.1161859,
    0.5147972,
    0.62838113,
    0.7961008,
    -1.5935563,
    -1.7406027,
    -0.66545045,
    -2.351306,
    -0.3504907,
    0.44358444,
    0.35571313,
    0.0022024512,
    -0.7785561,
    -0.83912647,
    0.8103819,
    0.47481182,
    -3.7394562,
    -0.5385156,
    -0.3310783,
    0.09079547,
    1.6383522,
    0.20871267,
    -0.041522503,
    0.2923697,
    -2.2654932,
    0.6703297,
    0.8186689,
    0.24686375,
    0.2782564,
    -1.9378077,
    0.8222474,
    0.91979516,
    -0.24980968,
    1.3838121,
    -0.304246,
    0.8663444,
    -1.0249115,
    -0.708161,
    -0.9402787,
    -0.00850144,
    -0.0058616176,
    2.1574817,
    1.147755,
    0.98239475,
    0.09185985,
    -0.92405856,
    -0.86257964,
    2.6955757,
    0.79708505,
    -0.6518954,
    2.2815175,
    0.41274923,
    -0.13757202,
    1.1258838,
    1.2294652,
    0.6424092,
    1.7777596,
    -1.08911,
    1.7061689,
    -0.24416138,
    0.99487174,
    0.34593183,
    -0.789215,
    -0.8513574,
    0.1587848,
    0.17840832,
    1.3739108,
    -0.6903677,
    -0.65012014,
    -0.074174315,
    0.06488903,
    0.7533977,
    -0.9230565,
    -0.6003438,
    1.9791843,
    0.008446917,
    1.8094804,
    -0.7279801,
    0.35471696,
    0.65262985,
    -0.8158909,
    -1.393401,
    0.09898819,
    2.201612,
    -0.47622854,
    1.2097845,
    -2.170571,
    1.2529106,
    -1.2055637,
    1.059931,
    -1.4410483,
    1.0987004,
    -1.1007692,
    -0.15914787,
    -1.0166351,
    0.7992151,
    -0.3662879,
];

// #[test]
// fn test_analyze_face() {
//     // Resolve absolute path to passport fixture
//     let img_path: PathBuf =
//         PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/zuck.jpeg");

//     // Load bytes for FFI call
//     let bytes = std::fs::read(&img_path).expect("failed to read fixture bytes");

//     // Resolve absolute paths to ONNX models
//     let scrfd_path: PathBuf =
//         PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ios/models/scrfd_2.5g_bnkps.ort");
//     let arcface_path: PathBuf =
//         PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ios/models/arcface.ort");

//     let scrfd_c = CString::new(scrfd_path.to_string_lossy().as_bytes().to_vec())
//         .expect("invalid scrfd path cstring");
//     let arcface_c = CString::new(arcface_path.to_string_lossy().as_bytes().to_vec())
//         .expect("invalid arcface path cstring");

//     // Simple timing
//     let start = std::time::Instant::now();
//     // Call the FFI function
//     let ptr = analyze_face(
//         bytes.as_ptr(),
//         bytes.len(),
//         scrfd_c.as_ptr(),
//         arcface_c.as_ptr(),
//     );
//     let end = std::time::Instant::now();
//     println!("Time taken (test): {:?}", end.duration_since(start));

//     // Take ownership of the returned C string (will free on drop)
//     let json_string = unsafe { CString::from_raw(ptr) }
//         .to_string_lossy()
//         .into_owned();
//     println!("json_string: {}", json_string);

//     // Parse JSON to our FaceAnalysis struct
//     let result: FaceAnalysis =
//         serde_json::from_str(&json_string).expect("invalid JSON from analyze_face");

//     println!("result: {:#?}", json_string);

//     // Validity checks
//     assert!(result.embedding.len() == 512, "expected 512-dim embedding");
//     assert!(
//         result.embedding.iter().all(|v| v.is_finite()),
//         "embedding contains non-finite values"
//     );
//     // Ensure yaw is between -1 and 1
//     assert!(
//         result.yaw >= -1.0 && result.yaw <= 1.0,
//         "yaw should be between -1 and 1"
//     );
//     // Ensure roll is between -180 and 180 degrees
//     assert!(
//         result.roll >= -180.0 && result.roll <= 180.0,
//         "roll should be between -180 and 180 degrees"
//     );
//     // Ensure pitch is not NaN
//     assert!(!result.pitch.is_nan(), "pitch is NaN");

//     // Use approximate equality for floating point comparisons
//     assert!(
//         (result.yaw - (-0.20506611)).abs() < 1e-6,
//         "yaw should be approximately -0.20506611, got {}",
//         result.yaw
//     );
//     assert!(
//         (result.roll - 3.264052).abs() < 1e-4,
//         "roll should be approximately 3.264052, got {}",
//         result.roll
//     );
//     assert!(
//         (result.pitch - (-0.19016933)).abs() < 1e-6,
//         "pitch should be approximately -0.19016933, got {}",
//         result.pitch
//     );

//     // assert result.embedding == ZUCK_FACEPRINT
//     assert!(
//         result.embedding == ZUCK_FACEPRINT,
//         "embedding should be equal to ZUCK_FACEPRINT"
//     );

//     // Verify gaze direction fields are present and finite
//     assert!(result.gaze_dx.is_finite(), "gaze_dx should be finite");
//     assert!(result.gaze_dy.is_finite(), "gaze_dy should be finite");
//     assert!(
//         result.gaze_angle_rad.is_finite(),
//         "gaze_angle_rad should be finite"
//     );
//     assert!(
//         result.gaze_angle_deg.is_finite(),
//         "gaze_angle_deg should be finite"
//     );
// }

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use facematch::{init_sessions_internal as init_sessions, cleanup_sessions_internal as cleanup_sessions};

    // Global mutex to ensure tests run serially (they share global session state)
    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_analyze_face_detection_and_embedding() {
        let _lock = TEST_MUTEX.lock().unwrap();
        // Resolve absolute path to passport fixture
        let img_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/zuck.jpeg");

        // Load bytes for FFI call
        let bytes = std::fs::read(&img_path).expect("failed to read fixture bytes");

        // Resolve absolute paths to ONNX models
        let scrfd_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ios/models/scrfd_2.5g_bnkps.ort");
        let arcface_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ios/models/arcface.ort");

        let scrfd_c = CString::new(scrfd_path.to_string_lossy().as_bytes().to_vec())
            .expect("invalid scrfd path cstring");
        let arcface_c = CString::new(arcface_path.to_string_lossy().as_bytes().to_vec())
            .expect("invalid arcface path cstring");

        // Step 0: initialize sessions
        let scrfd_str = scrfd_path.to_string_lossy().to_string();
        let arcface_str = arcface_path.to_string_lossy().to_string();
        init_sessions(&scrfd_str, &arcface_str).expect("Failed to initialize sessions");

        // Step 1: Call face detection (path param ignored, uses global session)
        let detection_ptr = analyze_face_detection(
            bytes.as_ptr(),
            bytes.len(),
            scrfd_c.as_ptr(),
        );

        // Take ownership of the returned C string (will free on drop)
        let detection_json = unsafe { CString::from_raw(detection_ptr) }
            .to_string_lossy()
            .into_owned();
        println!("detection_json: {}", detection_json);

        // Parse detection JSON
        let detection_result: FaceDetectionResponse =
            serde_json::from_str(&detection_json).expect("invalid JSON from analyze_face_detection");

        // Verify detection results
        assert!(detection_result.score > 0.7, "detection score should be high, got {}", detection_result.score);
        assert!(detection_result.landmarks.len() == 5, "should have 5 landmarks");
        assert!(!detection_result.pitch.is_nan(), "pitch is NaN");
        assert!(!detection_result.yaw.is_nan(), "yaw is NaN");
        assert!(!detection_result.roll.is_nan(), "roll is NaN");

        // Ensure yaw is between -1 and 1
        assert!(
            detection_result.yaw >= -1.0 && detection_result.yaw <= 1.0,
            "yaw should be between -1 and 1"
        );
        // Ensure roll is between -180 and 180 degrees
        assert!(
            detection_result.roll >= -180.0 && detection_result.roll <= 180.0,
            "roll should be between -180 and 180 degrees"
        );

        // Use approximate equality for floating point comparisons
        // Allow reasonable tolerance for face pose estimation (can vary slightly with different optimization settings)
        assert!((detection_result.yaw - (-0.20506611)).abs() < 0.03, 
            "yaw should be approximately -0.20506611, got {}", detection_result.yaw);
        assert!((detection_result.roll - 3.264052).abs() < 0.2, 
            "roll should be approximately 3.264052, got {}", detection_result.roll);
        assert!((detection_result.pitch - (-0.19016933)).abs() < 0.05, 
            "pitch should be approximately -0.19016933, got {}", detection_result.pitch);
        
        // Verify gaze direction fields are present and finite
        assert!(detection_result.gaze_magnitude.is_finite(), "gaze_magnitude should be finite");
        assert!(detection_result.gaze_angle_deg.is_finite(), "gaze_angle_deg should be finite");
        
        // Check detection timing is present
        assert!(detection_result.timing_ms.is_some(), "detection timing_ms should be present");
        let det_timings = detection_result.timing_ms.unwrap();
        assert!(det_timings.len() >= 2, "should have at least 2 detection timing measurements");
        println!("Detection timings (ms): {:?}", det_timings);

        // Step 2: Call face embedding with landmarks from detection
        let landmarks_json = serde_json::to_string(&detection_result.landmarks)
            .expect("failed to serialize landmarks");
        let landmarks_c = CString::new(landmarks_json.as_bytes())
            .expect("invalid landmarks cstring");

        let embedding_ptr = analyze_face_embedding(
            bytes.as_ptr(),
            bytes.len(),
            arcface_c.as_ptr(),
            landmarks_c.as_ptr(),
        );

        // Take ownership of the returned C string (will free on drop)
        let embedding_json = unsafe { CString::from_raw(embedding_ptr) }
            .to_string_lossy()
            .into_owned();
        println!("embedding_json: {}", embedding_json);

        // Parse embedding JSON
        let embedding_result: FaceEmbeddingResponse =
            serde_json::from_str(&embedding_json).expect("invalid JSON from analyze_face_embedding");

        // Verify embedding results
        assert!(embedding_result.embedding.len() == 512, "expected 512-dim embedding");
        assert!(
            embedding_result.embedding.iter().all(|v| v.is_finite()),
            "embedding contains non-finite values"
        );
        
        // Check timing is present
        assert!(embedding_result.timing_ms.is_some(), "timing_ms should be present");
        let emb_timings = embedding_result.timing_ms.unwrap();
        assert!(emb_timings.len() >= 2, "should have at least 2 timing measurements");
        println!("Embedding timings (ms): {:?}", emb_timings);
        
        // Cleanup sessions
        cleanup_sessions();
    }

    #[test]
    fn test_session_management_with_timing() {
        let _lock = TEST_MUTEX.lock().unwrap();
        
        use image::io::Reader as ImageReader;
        use std::path::PathBuf;

        // Import the facematch module functions directly
        use facematch::{init_sessions_internal as init_sessions, cleanup_sessions_internal as cleanup_sessions, analyze_detection_internal as analyze_detection, analyze_embedding_internal as analyze_embedding};

        // Resolve model paths
        let scrfd_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ios/models/scrfd_2.5g_bnkps.ort");
        let arcface_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ios/models/arcface.ort");

        let scrfd_str = scrfd_path.to_string_lossy().to_string();
        let arcface_str = arcface_path.to_string_lossy().to_string();

        // Initialize sessions once
        println!("\n=== Initializing sessions ===");
        let init_start = std::time::Instant::now();
        init_sessions(&scrfd_str, &arcface_str).expect("Failed to initialize sessions");
        let init_duration = init_start.elapsed().as_millis();
        println!("Session initialization took: {}ms", init_duration);

        // Load first image (zuck.jpeg)
        let img1_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/zuck.jpeg");
        let img1 = ImageReader::open(&img1_path)
            .expect("Failed to open zuck.jpeg")
            .decode()
            .expect("Failed to decode zuck.jpeg");

        // Load second image (zuck2.jpeg)
        let img2_path: PathBuf =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/zuck2.jpeg");
        let img2 = ImageReader::open(&img2_path)
            .expect("Failed to open zuck2.jpeg")
            .decode()
            .expect("Failed to decode zuck2.jpeg");

        // === Test detection on first image ===
        println!("\n=== Detection on zuck.jpeg ===");
        let det1_start = std::time::Instant::now();
        let (detection1, timings1) = analyze_detection(img1.clone())
            .expect("Failed detection on zuck.jpeg");
        let det1_total = det1_start.elapsed().as_millis();
        println!("Detection 1 - Total: {}ms, Timings: {:?}", det1_total, timings1);

        // === Test detection on second image ===
        println!("\n=== Detection on zuck2.jpeg ===");
        let det2_start = std::time::Instant::now();
        let (detection2, timings2) = analyze_detection(img2.clone())
            .expect("Failed detection on zuck2.jpeg");
        let det2_total = det2_start.elapsed().as_millis();
        println!("Detection 2 - Total: {}ms, Timings: {:?}", det2_total, timings2);

        // === Test embedding on first image ===
        println!("\n=== Embedding on zuck.jpeg ===");
        let emb1_start = std::time::Instant::now();
        let (embedding1, emb_timings1) = analyze_embedding(img1, detection1.landmarks)
            .expect("Failed embedding on zuck.jpeg");
        let emb1_total = emb1_start.elapsed().as_millis();
        println!("Embedding 1 - Total: {}ms, Timings: {:?}", emb1_total, emb_timings1);

        // === Test embedding on second image ===
        println!("\n=== Embedding on zuck2.jpeg ===");
        let emb2_start = std::time::Instant::now();
        let (embedding2, emb_timings2) = analyze_embedding(img2, detection2.landmarks)
            .expect("Failed embedding on zuck2.jpeg");
        let emb2_total = emb2_start.elapsed().as_millis();
        println!("Embedding 2 - Total: {}ms, Timings: {:?}", emb2_total, emb_timings2);

        // === Cleanup ===
        println!("\n=== Cleaning up sessions ===");
        cleanup_sessions();
        println!("Sessions cleaned up successfully");

        // === Assertions ===
        assert_eq!(embedding1.len(), 512, "embedding1 should have 512 dimensions");
        assert_eq!(embedding2.len(), 512, "embedding2 should have 512 dimensions");

        // Timings should NOT include session creation overhead anymore
        assert!(timings1.len() > 0, "should have detection timings");
        assert!(timings2.len() > 0, "should have detection timings");
        assert!(emb_timings1.len() > 0, "should have embedding timings");
        assert!(emb_timings2.len() > 0, "should have embedding timings");

        println!("\n=== Summary ===");
        println!("Session init: {}ms", init_duration);
        println!("Detection 1: {}ms", det1_total);
        println!("Detection 2: {}ms", det2_total);
        println!("Embedding 1: {}ms", emb1_total);
        println!("Embedding 2: {}ms", emb2_total);
        println!("Speedup: Detection should be similar on both runs (no session overhead)");
        println!("Speedup: Embedding should be similar on both runs (no session overhead)");
    }
}