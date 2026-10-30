# Actualizar Omera

Omera puede buscar versiones y descargar un instalador verificado. La instalación requiere tu intervención; los pasos dependen del sistema operativo.

## Buscar actualizaciones

Selecciona **Ayuda > Buscar actualizaciones**. La comprobación al iniciar se activa o desactiva en **Preferencias > General**. Lee las notas de la versión antes de instalar.

## Descargar e instalar

1. En Windows, selecciona **Actualizar ahora** para descargar e instalar la actualización con un clic. Puedes elegir la instalación silenciosa antes de empezar. En macOS/Linux, selecciona primero **Descargar actualización**.
2. Omera verifica el paquete descargado y comprueba de nuevo su firma antes de iniciar el instalador. Si falla la verificación, no se instala. Si falla el inicio del instalador, puedes reintentarlo con el paquete descargado.
3. Windows actualiza la aplicación existente sin un paso de desinstalación separado y vuelve a abrir Omera al completarse. En macOS, usa la acción de instalación para abrir el DMG verificado, completa la instalación y vuelve a abrir Omera. En Linux, la acción de instalación inicia un AppImage; los paquetes DEB/RPM requieren el gestor de paquetes. El reinicio automático no está garantizado en macOS/Linux.

Si falta la configuración de confianza o la firma, o falla la verificación, utiliza **Descargar en el navegador** o **GitHub Releases** para abrir la [página oficial de versiones](https://github.com/BerryUIKI/Omera/releases). Elige el paquete para tu sistema y arquitectura y sigue sus instrucciones de instalación manual. No desactives la verificación ni uses un servidor espejo no fiable. Las versiones antiguas sin confianza de actualización requieren primero una actualización manual a una compilación de confianza.

## Conservar la biblioteca

Los archivos del programa y los datos personales se almacenan por separado. Mantén una copia reciente de la base de datos antes de actualizar, además de los medios originales y los ajustes. Las migraciones de esquema al iniciar se añaden sin modificar las ya aplicadas. Antes de la versión 1.0 se mantienen la detección y la importación de datos antiguos. No elimines datos de la aplicación ni fuentes antiguas durante la actualización.
