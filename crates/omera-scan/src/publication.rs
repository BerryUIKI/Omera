//! Exclusive publication of copies; never remove or overwrite another writer's file.
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub(crate) fn copy_new(source: &Path, destination: &Path) -> io::Result<()> {
    let mut input = fs::File::open(source)?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let result = io::copy(&mut input, &mut output).and_then(|_| output.flush());
    drop(output);
    if result.is_err() {
        let _ = fs::remove_file(destination);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exclusive_copy_preserves_existing_destination_and_source() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let target = temp.path().join("target");
        fs::write(&source, b"new").unwrap();
        copy_new(&source, &target).unwrap();
        fs::write(&target, b"existing").unwrap();
        assert_eq!(
            copy_new(&source, &target).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(target).unwrap(), b"existing");
        assert_eq!(fs::read(source).unwrap(), b"new");
    }
}
