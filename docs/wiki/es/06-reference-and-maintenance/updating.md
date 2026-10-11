# Actualizar Omera

Omera puede buscar versiones y descargar un instalador verificado. La instalación requiere tu intervención; los pasos dependen del sistema operativo.

## Buscar actualizaciones

Selecciona **Ayuda > Buscar actualizaciones**. La comprobación al iniciar se activa o desactiva en **Preferencias > General**. Lee las notas de la versión antes de instalar.

## Descargar e instalar

1. Selecciona la descarga automática para obtener el paquete de la publicación oficial en GitHub.
2. Omera verifica su firma antes de ofrecer la instalación y de nuevo antes de iniciar el instalador. Un error no autoriza la instalación.
3. En Windows, el instalador EXE puede usar la opción de instalación silenciosa elegida. En macOS, Omera abre el DMG verificado; completa la instalación y vuelve a abrir Omera. En Linux se inicia un AppImage; los paquetes DEB/RPM requieren el gestor de paquetes. El reinicio automático no está garantizado en todas las plataformas.

Si falta la configuración de confianza o la firma, o falla la verificación, utiliza **Descargar en el navegador** o **GitHub Releases** para abrir la [página oficial de versiones](https://github.com/BerryUIKI/Omera/releases). Elige el paquete para tu sistema y arquitectura y sigue sus instrucciones de instalación manual. No desactives la verificación ni uses un servidor espejo no fiable. Las versiones antiguas sin confianza de actualización requieren primero una actualización manual a una compilación de confianza.

## Conservar la biblioteca

Los archivos del programa y los datos personales se almacenan por separado. Mantén una copia reciente de la base de datos antes de actualizar, además de los medios originales y los ajustes. Las migraciones de esquema al iniciar se añaden sin modificar las ya aplicadas. Antes de la versión 1.0 se mantienen la detección y la importación de datos antiguos. No elimines datos de la aplicación ni fuentes antiguas durante la actualización.
