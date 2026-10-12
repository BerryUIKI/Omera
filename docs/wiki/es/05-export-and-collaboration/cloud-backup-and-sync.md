# Copia de instantáneas en la nube y reflejo de medios

Omera incorpora un motor de sincronización delta y copias de respaldo en la nube (`src-tauri/src/cloud_backup.rs` y `src-tauri/src/cloud_sync.rs`) que posibilita copias automatizadas de la base de datos y reflejo incremental de archivos multimedia remotos sin depender de herramientas de terceros.

---

## 1. Proveedores de almacenamiento compatibles

Configure los puntos de enlace remotos en **Preferencias > Copia en la nube**:

| Proveedor | Protocolos y puntos de enlace compatibles | Notas |
| :--- | :--- | :--- |
| **AWS S3 / Compatible** | AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi | Autenticación pura en Rust mediante AWS Signature Version 4 (SigV4) con firmado HMAC-SHA256. |
| **WebDAV** | Nextcloud, ownCloud, Synology DiskStation, NAS QNAP | Autenticación básica HTTP estándar sobre HTTPS. |
| **Directorio local o de red** | Disco local, SSD USB externo, recursos compartidos SMB / NFS | Entrada/salida de archivos directa a alta velocidad sin sobrecarga de protocolos de red. |

---

## 2. Instantáneas de la base de datos

Las instantáneas contienen `omera.db` y `manifest.json`, con registros, etiquetas y valoraciones. Excluyen medios, ajustes y credenciales. Configura el destino en **Ajustes > Nube y copias** y elige **Crear instantánea ahora**. Los nombres son únicos; la publicación local es atómica. Las copias existentes no se borran automáticamente.

### Copias automáticas

Por defecto están **desactivadas**, con intervalo de **siete días**. Actívalas, elige **1–365 días** y **Guarda las preferencias**. Cancelar o un fallo al guardar conserva la programación guardada. Omera comprueba cada 30 segundos mientras está abierto; el primer intento comienza en la siguiente comprobación. El siguiente intervalo empieza tras una copia correcta. Cerrar Omera detiene la programación. Desactivar detiene futuros intentos; el actual puede terminar.

**Programación guardada** muestra, separada de los cambios pendientes, el estado, último éxito/intento, próxima fecha, archivo y error. Un fallo o interrupción espera **una hora** antes de reintentar, incluso tras reiniciar. Otro destino inicia una nueva programación; cambiar solo las credenciales conserva sus tiempos. Un estado dañado se conserva y pausa la programación hasta repararlo y reiniciar.

### Restauración

La restauración valida la instantánea y la prepara para el siguiente inicio. Cierra y reinicia Omera; recargar la ventana no basta. La base actual se conserva como `omera.pre-restore-<UUID>.db` antes de la activación transaccional. No se restauran medios ni credenciales perdidos.

---

## 3. Reflejo incremental de medios y sincronización delta (`cloud_sync.rs`)

Mientras que las instantáneas aseguran la base de datos, la **Sincronización delta** proporciona una duplicación unidireccional de subida incremental de archivos físicos de imagen y vídeo desde su biblioteca local hacia almacenamiento remoto o en red.

### Capacidades de sincronización (Implementadas):
- **Estrategias de detección de cambios**:
  - *Huella rápida*: Compara el tamaño del archivo local con el tamaño remoto mediante metadatos HTTP HEAD (la más veloz, perfecta para enlaces lentos).
  - *Suma de comprobación estricta*: Calcula hashes SHA-256 locales para contrastar con cabeceras remotas (`x-amz-meta-sha256` en S3), asegurando correspondencia byte a byte.
- **Limitador de ancho de banda (Token-Bucket)**: Configure un límite de velocidad de subida (KB/s) para que la sincronización en segundo plano no sature el ancho de banda del estudio.
- **Hilos de transferencia concurrentes**: Ajuste el número de subprocesos paralelos (de 1 a 16 hilos, 4 por defecto).
- **Modo de simulación de prueba (Dry-run)**: Analiza el proceso y reporta qué archivos se subirían u omitirían sin modificar el almacenamiento remoto.
- **Reporte de progreso en tiempo real**: Emite eventos periódicos con los bytes transferidos, velocidad de transmisión, porcentaje completado y tiempo estimado (ETA), con cancelación atómica cooperativa.

### Limitaciones actuales y capacidades planificadas:
- **Solo subida unidireccional**: La ruta de sincronización actual envía los archivos indexados locales al destino remoto. La descarga o reconciliación de remoto a local no está implementada.
- **Sin sincronización de eliminaciones remotas**: Eliminar un archivo local no borra el objeto remoto; los archivos remotos se conservan.
- **Sin validación delta por ETag**: La detección de cambios emplea tamaño de archivo y SHA-256; las cabeceras HTTP ETag no se emplean para invalidación de caché.
- **Sincronización bidireccional planificada**: Una reconciliación bidireccional completa con detección de cambios remotos, descargas pull y resolución de conflictos está planificada para futuras versiones.
