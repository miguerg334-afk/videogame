# APEX: Night Pursuit

### A 3D police chase game built for the browser

[**▶ Play now**](https://apex-night-drive.pages.dev/)

Escape relentless police patrols and a searchlight helicopter across an open mountain landscape. Drive through the night, take dirt-road shortcuts, and survive an escalating pursuit with physics-based handling.

Built with **TypeScript, Three.js, and Rapier 3D**. Play free in your browser — no downloads required.

**[Play the game](https://apex-night-drive.pages.dev/)** · [English overview](#english-overview) · [Información en español](#cómo-se-juega) · [Screenshots / Capturas](#capturas)

---

## English overview

### Gameplay

**Survive for as long as you can.** Explore mountain roads and dirt shortcuts while the police try to intercept you. Collisions are part of the chase: a patrol must maintain **5 seconds of continuous contact** to catch you. Breaking contact resets that timer.

The helicopter has a separate capture timer. Stay inside its white searchlight circle for **5 continuous seconds** and the chase ends; leaving the circle resets the aerial timer.

| Chase time                        | What changes                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Start                             | One patrol. Your speed limit starts at 100 km/h; the patrol starts at 106 km/h.                        |
| Every 45 seconds, up to 3 minutes | Intensity increases as both vehicles' speed limits rise gradually.                                     |
| 3 minutes · Level 5/5             | Maximum alert: flashing red intensity bar. Your limit reaches 130 km/h; the patrol can reach 200 km/h. |
| 4 minutes · Level 6/6             | A second patrol joins with the same physics and 200 km/h speed limit.                                  |
| 5 minutes · Level 7/7             | The H-01 helicopter joins at up to 230 km/h, tracking you with a 20 m-wide searchlight.                |

These are speed limits, not guaranteed speeds: slopes, traction, steering and collisions affect the cars' actual movement. Pausing freezes the chase clock.

### Guided missiles

At level 7, the helicopter also fires guided missiles. A **1.8-second warning** precedes each launch; attacks are spaced by at least 7 seconds plus the warning. Missiles turn at a limited rate and stop guiding within 18 m of the car, so sharp changes of direction can make them miss. Keep moving and turn across their approach instead of driving straight.

Ground impacts create explosions with a 9 m blast radius. Nearby blasts push the car without causing instant defeat; patrol contact and searchlight capture rules still apply. Effects use bounded reusable pools and instanced particles, without extra dynamic lights or physical debris.

### How it was made

- **TypeScript and JavaScript** power the gameplay, pursuit AI, navigation and procedural world generation.
- **Three.js / WebGL** render the vehicles, mountain landscape, materials, cameras and lighting. Cars and the helicopter are modeled through code, including animated rotors.
- **Rapier 3D / WebAssembly** handles rigid bodies, collisions and wheel suspension at a fixed 60 Hz. The player and both patrols share the same driving physics, with different speed limits.
- **GLSL and Canvas 2D** provide terrain and searchlight effects, procedural textures and the minimap.
- **HTML, CSS and GSAP** provide the interface and its entrance animations.
- **Vite and Node.js** support development, production builds and automated tests. **GitHub and Cloudflare Pages** handle source control and automatic deployment.

Performance work includes sector-based visibility, distance-based detail, shared and instanced geometry, nearby tree colliders, adaptive resolution and a simplified road mesh. The helicopter's searchlight uses a visual effect without adding a dynamic light or shadow pass.

### Controls

| Action                                     | Key            |
| ------------------------------------------ | -------------- |
| Accelerate / brake and reverse             | ↑ / ↓ or W / S |
| Steer                                      | ← / → or A / D |
| Handbrake                                  | Space          |
| Toggle headlights                          | L              |
| Switch exterior camera                     | C or 1–4       |
| Look behind                                | Hold B         |
| Right your car without resetting the chase | F              |
| Pause                                      | P or Esc       |
| Restart the chase                          | R              |

Camera and paint options are also available in the on-screen controls. The game pauses when its window loses focus.

---

## Cómo se juega

El objetivo es **resistir el mayor tiempo posible**. Un choque no termina la partida: una patrulla tiene que mantener **5 segundos de contacto continuo** para capturarte. Separarte reinicia esa cuenta.

El helicóptero utiliza una captura independiente: debes salir de su círculo blanco antes de pasar **5 segundos seguidos bajo el foco**. Salir de la luz reinicia su cuenta.

| Tiempo de persecución      | Intensidad y refuerzos                                              | Velocidades máximas                                        |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Inicio                     | Nivel 1/5 · Una patrulla                                            | Jugador: 100 km/h · Patrulla: 106 km/h                     |
| Cada 45 s, hasta los 3 min | Aumenta la intensidad; los límites de velocidad crecen gradualmente | Jugador: hasta 130 km/h · Patrulla: se aproxima a 150 km/h |
| 3 min                      | Nivel 5/5 · Alerta máxima y barra roja intermitente                 | Jugador: 130 km/h · Patrulla: 200 km/h                     |
| 4 min                      | Nivel 6/6 · Llega una segunda patrulla                              | Ambas patrullas: 200 km/h                                  |
| 5 min                      | Nivel 7/7 · Se suma el helicóptero H-01                             | Helicóptero: 230 km/h · Foco de 20 m de diámetro           |

Son límites de velocidad: las pendientes, el agarre, los giros y los golpes afectan la velocidad real de los coches. La pausa detiene el tiempo de persecución.

- **Mundo explorable:** unos 5,2 km de carretera, pendientes de hasta el 27 %, tres atajos y un terreno de 3,8 × 2,9 km.
- **Conducción física:** suspensión por rueda, frenadas, derrapes, saltos y vuelcos. Puedes enderezar tu coche sin reiniciar la dificultad; las patrullas también se recuperan.
- **Persecución dinámica:** la policía anticipa tu movimiento, busca rutas y maniobra para salir de los obstáculos. El helicóptero persigue desde el aire con aceleración e inercia.
- **Ambiente nocturno:** montañas, luna, bosque, faros con encendido manual y luces policiales animadas.
- **Cámaras exteriores:** seguimiento, amplia, táctica y retrovisor; pintura configurable, minimapa y controles táctiles.

### Misiles y explosiones

En el nivel 7, el helicóptero también dispara misiles teledirigidos. Hay un **aviso de 1,8 segundos** antes de cada lanzamiento y al menos 7 segundos más el aviso entre disparos. Los misiles tienen giro limitado y dejan de corregir su trayectoria a menos de 18 m del coche: cambia bruscamente de dirección para esquivarlos.

Los impactos en el suelo generan explosiones con un radio de 9 m. Si estás cerca, la onda empuja el coche, pero no pierdes de inmediato: siguen vigentes las capturas por contacto y por el foco. Los efectos reutilizan objetos y partículas instanciadas, sin luces dinámicas adicionales ni escombros físicos.

## Capturas

![Conducción nocturna por la sierra con el coche, los faros y el minimapa](docs/images/sierra-nocturna.jpg)

_Carretera y terreno explorable durante una partida._

![Helicóptero policial H-01 con su cono de luz y el círculo blanco de captura](docs/images/apoyo-aereo.jpg)

_Prueba visual aislada del apoyo aéreo con los componentes reales del juego; la interfaz de esta captura es de verificación._

## Lenguajes y tecnologías

| Tecnología                       | Uso en el proyecto                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| **TypeScript 5.9**               | Lógica del juego, controles, IA, navegación, captura y coordinación de la simulación.            |
| **JavaScript · ES modules**      | Modelado procedural de vehículos, helicóptero y elementos del escenario.                         |
| **HTML y CSS**                   | Menú, ayuda, controles, paneles de persecución e interfaz adaptable.                             |
| **GLSL**                         | Shaders del terreno y del efecto circular del foco aéreo.                                        |
| **Three.js 0.128**               | Renderizado WebGL, geometrías, materiales, luces, cámaras y animación de hélices.                |
| **Rapier 3D 0.17 · WebAssembly** | Motor de física: cuerpos rígidos, colisiones y controlador de ruedas.                            |
| **GSAP 3.15**                    | Animaciones de entrada de la interfaz.                                                           |
| **Canvas 2D**                    | Texturas generadas por código y dibujo del minimapa.                                             |
| **Vite 8.1**                     | Servidor de desarrollo y empaquetado de la aplicación para producción.                           |
| **Node.js, tsx y Prettier**      | Herramientas de desarrollo: pruebas automatizadas, ejecución de TypeScript y formato del código. |
| **GitHub y Cloudflare Pages**    | Repositorio, historial de cambios y publicación automática del juego.                            |

El juego se ejecuta en el navegador. Node.js se utiliza para desarrollar, comprobar y compilar el proyecto; no es necesario un servidor de juego para ejecutar la partida.

## Cómo se construyó

### Modelos y escenario procedurales

El deportivo se construye por código a partir de geometrías 3D: carrocería, cabina, ruedas, faros y bajos cerrados. Las patrullas reutilizan ese diseño con pintura, rótulos y luces propios. El H-01 tiene un modelo independiente con rotor principal y rotor de cola animados.

El terreno, la carretera, los caminos y el bosque también se generan mediante código. Las texturas procedurales aportan detalle al asfalto y a la vegetación. La escena combina estos elementos con materiales e iluminación nocturna de Three.js.

### Física e inteligencia policial

Rapier simula el mundo a **60 pasos por segundo**. El jugador y las dos patrullas comparten el modelo de conducción: motor, frenos, suspensión, agarre y colisiones. Cada coche tiene su límite de velocidad según la intensidad; todos se procesan en un único paso compartido del mundo físico.

La IA estima hacia dónde se mueve el jugador y busca rutas por la carretera y los atajos. Produce órdenes de dirección, acelerador y freno; el motor físico resuelve el desplazamiento. Si una patrulla se atasca, hace una maniobra breve de recuperación; si vuelca, puede enderezarse automáticamente.

El helicóptero usa un controlador cinemático aéreo independiente, con aceleración, inercia y seguimiento del terreno. Su foco combina un cono translúcido y un círculo adaptado al suelo, sin añadir una luz dinámica ni una pasada de sombras al renderizado.

### Trabajo de optimización

- Carretera simplificada: aproximadamente **80 % menos triángulos** respecto al diseño anterior, conservando el muestreo físico más detallado.
- Terreno y objetos divididos en sectores, descarte fuera de cámara y niveles de detalle según la distancia.
- Geometrías compartidas, objetos estáticos agrupados e instancias para reducir llamadas de dibujo.
- Colisiones de árboles activadas cerca del jugador y de las patrullas, en lugar de simular todo el bosque a la vez.
- Resolución adaptativa, sombras dinámicas desactivadas y efectos de contacto ligeros.
- Minimapa con fondo almacenado e interfaz actualizada con menor frecuencia que la escena 3D.

El rendimiento final depende del dispositivo y del navegador; estas medidas reducen el trabajo gráfico y físico sin eliminar la exploración libre.

### Organización del código

| Carpeta                 | Responsabilidad                                                       |
| ----------------------- | --------------------------------------------------------------------- |
| `src/app`               | Partida, menú, entrada del jugador y coordinación del juego.          |
| `src/vehicle`           | Modelo del coche y física de conducción.                              |
| `src/police`            | Patrullas, navegación, refuerzos, helicóptero y captura aérea.        |
| `src/world`             | Terreno, carretera, vegetación, materiales y visibilidad.             |
| `src/engine`            | Configuración y reglas compartidas, como los límites de velocidad.    |
| `src/ui` y `src/styles` | Minimapa y presentación de la interfaz.                               |
| `tests`                 | Pruebas de conducción, persecución, captura y otras reglas del juego. |

El proyecto utiliza comprobación de tipos con TypeScript, pruebas con el ejecutor nativo de Node.js y verificación de formato con Prettier. Vite genera la versión de producción; Cloudflare Pages la publica automáticamente desde la rama `main` de GitHub.

## Controles

| Acción                                          | Control        |
| ----------------------------------------------- | -------------- |
| Acelerar / frenar y reversa                     | ↑ / ↓ o W / S  |
| Girar                                           | ← / → o A / D  |
| Freno de mano                                   | Espacio        |
| Encender o apagar faros                         | L              |
| Cambiar cámara                                  | C o teclas 1–4 |
| Mirar atrás                                     | Mantener B     |
| Enderezar el coche sin reiniciar la persecución | F              |
| Pausar                                          | P o Esc        |
| Reiniciar la persecución                        | R              |

Las cámaras y la pintura también se eligen desde la barra de controles. La partida se pausa al perder el foco de la ventana.

**[Entra a jugar y comprueba cuánto puedes resistir →](https://apex-night-drive.pages.dev/)**
