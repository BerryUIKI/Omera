//! Exclusive publication of copies; never remove or overwrite another writer's file.
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub(crate) fn copy_new(source: &Path, destination: &Path) -> io::Result<()> {
    let mut input = fs::File::open(source)?;
    let permissions = input.metadata()?.permissions();
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        options.mode(permissions.mode());
    }
    let mut output = options.open(destination)?;
    let result = io::copy(&mut input, &mut output)
        .and_then(|_| output.flush())
        .and_then(|_| output.set_permissions(permissions));
    drop(output);
    if result.is_err() {
        let _ = fs::remove_file(destination);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn copied_private_files_keep_private_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("private");
        let target = temp.path().join("copy");
        fs::write(&source, b"private").unwrap();
        fs::set_permissions(&source, fs::Permissions::from_mode(0o600)).unwrap();
        copy_new(&source, &target).unwrap();
        assert_eq!(
            fs::metadata(target).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
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
