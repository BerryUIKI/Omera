//! CPU inference fixture for qualifying older Windows runtimes without app data.
use ort::{session::Session, value::Tensor};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Synthetic float32[1] Identity graph, ONNX IR 10 / opset 18.
    let model = [
        8, 10, 58, 67, 10, 16, 10, 1, 120, 18, 1, 121, 34, 8, 73, 100, 101, 110, 116, 105, 116,
        121, 18, 13, 114, 117, 110, 116, 105, 109, 101, 45, 115, 109, 111, 107, 101, 90, 15, 10, 1,
        120, 18, 10, 10, 8, 8, 1, 18, 4, 10, 2, 8, 1, 98, 15, 10, 1, 121, 18, 10, 10, 8, 8, 1, 18,
        4, 10, 2, 8, 1, 66, 2, 16, 18,
    ];
    let mut session = Session::builder()?
        .with_intra_threads(4)?
        .commit_from_memory(&model)?;
    let input = Tensor::from_array((vec![1_i64], vec![2.5_f32].into_boxed_slice()))?;
    let outputs = session.run(ort::inputs![input])?;
    let (_, values) = outputs[0].try_extract_tensor::<f32>()?;
    assert_eq!(values, &[2.5]);
    println!("ONNX Runtime CPU identity inference passed.");
    #[cfg(windows)]
    report_runtime_modules();
    Ok(())
}

#[cfg(windows)]
fn report_runtime_modules() {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut std::ffi::c_void;
        fn GetModuleFileNameW(module: *mut std::ffi::c_void, path: *mut u16, size: u32) -> u32;
    }
    for name in [
        "msvcp140.dll",
        "msvcp140_1.dll",
        "vcruntime140.dll",
        "vcruntime140_1.dll",
    ] {
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let mut path = [0_u16; 1024];
        // Read the paths of modules already loaded by this isolated test process.
        unsafe {
            let module = GetModuleHandleW(wide.as_ptr());
            assert!(!module.is_null(), "Expected loaded runtime module: {name}");
            let length = GetModuleFileNameW(module, path.as_mut_ptr(), path.len() as u32);
            assert_ne!(length, 0);
            println!(
                "{name}: {}",
                String::from_utf16_lossy(&path[..length as usize])
            );
        }
    }
}
