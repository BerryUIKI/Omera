# Instalación y primer inicio

Esta guía detalla los requisitos del sistema, las plataformas compatibles, los procedimientos de instalación y la configuración inicial a través del asistente de bienvenida para **Omera**.

---

## 1. Requisitos del sistema

Omera utiliza una arquitectura nativa ultraeficiente impulsada por **Tauri v2**, **Rust** y **SQLite WAL**. Funciona con fluidez en hardware modesto y aprovecha al máximo las estaciones de trabajo multinúcleo y el almacenamiento NVMe para bibliotecas masivas (de 50.000 a más de 500.000 archivos).

### Requisitos mínimos de hardware
- **CPU**: Procesador de doble núcleo x86_64 o ARM64 (Intel Core i3 / AMD Ryzen 3 / Apple M1 o superior).
- **RAM**: 4 GB de RAM (se recomiendan 8 GB o más para ejecutar modelos locales ONNX CLIP/WD14).
- **Almacenamiento**: ~150 MB para la instalación de la aplicación; espacio adicional para miniaturas (caché LRU predeterminada configurable de 2 GB) y archivos multimedia.
- **Resolución de pantalla**: Área de visualización mínima de 1280 × 800 (adaptable dinámicamente hasta 960 × 640).

### Sistemas operativos compatibles
| Sistema operativo | Versiones compatibles | Arquitectura | Tipos de paquete |
| :--- | :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+) y Windows 11 | `x86_64` (64 bits) | Instalador estándar (`.exe`), Portátil (`.zip`) |
| **macOS** | macOS 12 (Monterey) o posterior | `aarch64` (Apple Silicon M1/M2/M3/M4) y `x86_64` (Intel) | Imagen de disco (`.dmg`), Binario universal |
| **Linux** | Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux | `x86_64` | AppImage (`.AppImage`), Paquete Debian (`.deb`) |

---

## 2. Procedimientos de instalación

Descargue los paquetes oficiales de producción desde la [Página de lanzamientos de GitHub](https://github.com/BerryUIKI/Omera/releases) o el [Sitio web oficial](https://berryuiki.github.io/Omera/).

### Windows
La instalación requiere un entorno de ejecución del sistema Microsoft Visual C++
x64 compatible. Si se solicita, abra la [página oficial de Microsoft](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)
e instale o repare el redistribuible **x64** más reciente (puede requerir aprobación
del administrador). Vuelva al instalador EXE y pulse Siguiente; para MSI, vuelva a
ejecutar la instalación. El modo silencioso o pasivo se detiene si falta el entorno
de ejecución. Omera no incluye sus DLL ni instala el redistribuible automáticamente.

1. **Instalador estándar (`Omera_Windows_x64.exe`)**:
   - Haga doble clic en el archivo ejecutable del instalador.
   - Siga el asistente de instalación para elegir la ruta de instalación y crear accesos directos en el escritorio y el menú Inicio.
   - El instalador gestiona automáticamente los accesos directos y registra los controladores de protocolo del sistema.
2. **Archivo ZIP portátil (`Omera_Windows_x64.zip`)**:
   - Extraiga el archivo `.zip` en la unidad que prefiera (por ejemplo, una unidad SSD NVMe externa o un pendrive portátil).
   - Ejecute `omera.exe` directamente sin requerir privilegios de administrador.

### macOS
1. Descargue la imagen de disco correspondiente a su procesador:
   - Apple Silicon (M1/M2/M3/M4): `Omera_macOS_aarch64.dmg`
   - Intel Core: `Omera_macOS_x64.dmg`
2. Abra el archivo `.dmg` y arrastre **Omera** a su carpeta `/Applications`.
3. Los paquetes están firmados y certificados por Apple Gatekeeper. En el primer inicio, ejecútelo desde Aplicaciones o Spotlight.

### Linux
1. **AppImage (`Omera_Linux_x64.AppImage`)**:
   - Conceda permisos de ejecución al binario:
     ```bash
     chmod +x Omera_Linux_x64.AppImage
     ./Omera_Linux_x64.AppImage
     ```
2. **Debian / Ubuntu (`Omera_Linux_x64.deb`)**:
   - Instale mediante `dpkg` o `apt`:
     ```bash
     sudo dpkg -i Omera_Linux_x64.deb
     sudo apt-get install -f # Resuelve las dependencias webkit2gtk que falten
     ```

---

## 3. Primera configuración de Omera e importación desde Berry

Al iniciar por primera vez, elija el idioma y el directorio de la base de datos.
Esta configuración aparece aunque haya completado la de Berry. La base se guarda
por defecto en los datos de Omera. Otro directorio solo cambia su ubicación;
configuración, modelos, caché y medios originales conservan sus ubicaciones.

1. Revise las fuentes de Berry detectadas. El plan muestra origen, destino,
   espacio necesario, capacidad disponible y advertencias. Cierre la aplicación
   antigua. Si no se conoce la capacidad, resuelva el problema antes de importar.
2. Importe una instantánea verificada sin sobrescribir la biblioteca activa.
   Reinicie Omera para activarla. Se conservan la base original y los medios.
3. Tras verificar la activación, la limpieza opcional muestra los archivos exactos.
   Selecciónelos y confirme por separado. Los archivos modificados necesitan otra
   revisión. Medios, bibliotecas externas y carpetas compartidas quedan excluidos
   de la limpieza automática. Puede conservar todos los datos antiguos.
4. Continúe la detección opcional de salidas de IA locales y la configuración del
   flujo, o sáltela. Al terminar se guarda el directorio. La biblioteca SQLite se
   carga antes de la comprobación opcional del sistema de archivos.

Tras un fallo, revise de nuevo el plan antes de reintentar. Las bibliotecas
existentes no vacías se conservan; elija otro destino si el plan lo requiere.

También puede cambiar el directorio en los ajustes. Omera guarda la selección
tras verificar la copia; reinicie después. Los directorios siguientes siguen
alojando configuración y otros archivos aunque la base se encuentre en otro lugar.

---

## 4. Directorio de datos y almacenamiento de la aplicación

Omera almacena todos los índices de la biblioteca, cachés y archivos de configuración localmente en el perfil del usuario:

- **Windows**: `%APPDATA%\com.berryuiki.omera\` (p. ej., `C:\Users\<Usuario>\AppData\Roaming\com.berryuiki.omera\`)
- **macOS**: `~/Library/Application Support/com.berryuiki.omera/`
- **Linux**: `~/.config/com.berryuiki.omera/`

### Contenido del directorio:
- `omera.db`: Base de datos principal de SQLite que contiene todos los metadatos, puntuaciones, etiquetas, álbumes y relaciones de pilas.
- `omera.db-wal` y `omera.db-shm`: Archivos de diario WAL de SQLite.
- `config.json`: Ajustes de la aplicación (tema, modo de vista, resolución de miniaturas, URLs de interoperabilidad).
- `thumbnails/`: Caché de miniaturas WebP de alta eficiencia organizadas por `{file_id}_{mtime}_{edge}.webp`.
- `models/`: Pesos locales de IA en formato ONNX para CLIP, SigLIP y el autoetiquetador Danbooru WD14.

> [!TIP]
> Puede abrir estas ubicaciones al instante en cualquier momento desde **Preferencias > Almacenamiento e info** utilizando los botones específicos de «Abrir carpeta».
