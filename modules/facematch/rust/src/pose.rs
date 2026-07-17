#[derive(Clone, Copy, Debug)]
pub struct PoseFeatures {
    pub yaw: f32,      // [-1, 1]
    pub roll_deg: f32, // degrees
    pub pitch: f32,    // unitless
}

fn dist(a: (f32, f32), b: (f32, f32)) -> f32 {
    let dx = a.0 - b.0;
    let dy = a.1 - b.1;
    (dx * dx + dy * dy).sqrt()
}

// kps: [left_eye, right_eye, nose, mouth_left, mouth_right]
pub fn pose_from_5pts(kps: [[f32; 2]; 5]) -> PoseFeatures {
    let l = (kps[0][0], kps[0][1]);
    let r = (kps[1][0], kps[1][1]);
    let n = (kps[2][0], kps[2][1]);
    let ml = (kps[3][0], kps[3][1]);
    let mr = (kps[4][0], kps[4][1]);

    let io = dist(l, r).max(1e-6);
    let roll_deg = (r.1 - l.1).atan2(r.0 - l.0).to_degrees();

    let d_nr = dist(n, r);
    let d_nl = dist(n, l);
    let yaw = (d_nr - d_nl) / (d_nr + d_nl + 1e-6);

    let m_eye = ((l.0 + r.0) * 0.5, (l.1 + r.1) * 0.5);
    let m_mouth = ((ml.0 + mr.0) * 0.5, (ml.1 + mr.1) * 0.5);
    let pitch = ((m_eye.1 - n.1) / io) - ((n.1 - m_mouth.1) / io);

    PoseFeatures {
        yaw,
        roll_deg,
        pitch,
    }
}
