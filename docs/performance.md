# Rendimiento del mundo abierto

Estado actual: el juego vuelve a cargar el carro, su suspensión y su física a 120 Hz. Se mantienen el renderizado por sectores, los niveles de detalle del bosque, el descarte por cámara y la resolución adaptativa. Las secciones sobre Sonic documentan pruebas anteriores; el personaje no se carga en producción.

El terreno conserva todos sus triángulos y la misma colisión. Su malla visual se divide en sectores de 400 m para descartar lo que queda fuera del campo de visión. Los 1.800 árboles se agrupan en sectores de 160 m: detalle cercano, siluetas a partir de 300 m del centro del sector y descarte a 1.400 m. Cada lote de instancias tiene un límite espacial explícito; Three.js 0.128 desactiva por defecto el descarte de InstancedMesh.

Los objetos estáticos conservan sus matrices. El coche, la cámara, el cielo y las luces móviles siguen actualizándose. Las sombras solares usan un mapa de 768 px. La resolución comienza en 1 píxel por píxel CSS, se ajusta lentamente entre 0,7 y un máximo de 1,25 según el dispositivo y la carga. El contador junto al velocímetro muestra FPS reales de los fotogramas activos.

La física mantiene 120 Hz. Se limita a ocho pasos de recuperación por fotograma para evitar que una caída de FPS acumule más trabajo indefinidamente. En un bloqueo prolongado, la simulación puede perder tiempo real antes de recuperarse.

## Optimización del coche y del recorrido

El máximo de ambos coches parte de 100 km/h y sube gradualmente hasta 120 km/h con un único reloj de persecución; se eliminan los 47 power-ups, su animación, búsqueda de recogidas y marcadores del minimapa. Las llamas son ráfagas breves al acelerar fuerte, con cuatro planos y sin nuevas luces o cuerpos físicos.

Las 260 piezas opacas compatibles del coche se agrupan en 45 mallas por material, conservando todos sus triángulos y transformaciones. Los cristales, las instancias de detalle y las ruedas móviles se conservan por separado. El modelo pasa de 278 a 63 mallas renderizables: un 77 % menos de envíos de geometría por pasada, sin reducir detalle. Esto es un recuento de mallas; no equivale a un aumento medido de FPS.

El escenario calcula sus matrices de mundo una sola vez. Cada fotograma solo actualiza el coche, el cielo y las luces móviles. Se precalientan los materiales durante la carga para reducir compilaciones al ver por primera vez otros sectores o el efecto de escape. Se conservan el LOD, el descarte por cámara y la resolución adaptativa.

Las superficies físicas usan la corrección de aristas internas de Rapier y el CCD admite cuatro subpasos cuando se produce un impacto. Las pruebas recorren los seis accesos en ambos sentidos a 80 y 100 km/h, comprueban el asfalto con rayos y mantienen las colisiones de túneles y perímetro. La mejora de FPS debe verificarse en el equipo del usuario; no se dispone de una nueva medición gráfica para esta revisión.

## Persecución policial

La patrulla comparte la geometría del coche optimizado; su pintura, faros y animación de ruedas son independientes. La barra roja y azul usa materiales luminosos, sin luces físicas ni mapas de sombra adicionales. El clon se mantiene en la lista de raíces móviles para conservar la congelación del escenario.

La IA sigue muestras del camino real del jugador separadas 1,5 m y elimina las muestras ya consumidas por bloques. No calcula rutas sobre toda la malla de terreno. Usa un solo cuerpo cinemático y dos sensores con el tamaño del chasis y cabina; el contacto con los colliders del jugador decide la derrota. Cámara y suspensión excluyen sensores para evitar falsos obstáculos. Una función compartida calcula el límite de velocidad de ambos coches: 100, 105, 110, 115 y 120 km/h a los 0, 30, 60, 90 y 120 segundos, con interpolación continua. La patrulla acelera de 2 a 3 m/s², más suavemente que el jugador, conserva los tres segundos de ventaja inicial y no tiene aumentos de velocidad por distancia. El reloj de intensidad avanza con los pasos activos, se detiene al pausar o perder y se reinicia con una nueva ronda. El tiempo de preparación inicial no consume la ventaja.

Las pruebas comprueban progresión, curvas, pendientes, captura sin empujones, separación vertical, reinicio y conservación de la ventaja durante seis minutos con el coche real acelerando a los límites compartidos de 100 a 120 km/h. El modelo comparte geometrías y mantiene materiales y ruedas independientes. No hay una nueva medición gráfica de FPS de esta revisión.

## Menú y cámaras exteriores

El menú inicial mantiene el mundo y el reloj de persecución detenidos. Solo actualiza la vista previa a un máximo de 30 FPS; el jugador comienza mediante el botón. El selector de cámara está en la barra superior durante la partida, junto al control de luces. La fase única de sesión impide que teclas de conducción, pausa o reinicio activen la física desde el menú. Hay retorno al menú desde juego, pausa y derrota.

Las cuatro vistas exteriores usan la misma cámara y una única pasada de renderizado. La vista táctica encuadra al jugador y la patrulla cercana, adapta la distancia a la relación de aspecto y limita el alejamiento si la patrulla queda muy lejos. Todas conservan las restricciones de paredes, túneles y terreno. La indicación de dirección policial y el minimapa no requieren otro render WebGL. La cámara de habitáculo se retira.

Las pruebas verifican distancias exteriores, encuadre de ambos vehículos en horizontal y vertical, dirección policial y congelación de movimiento/reloj en menú, pausa y derrota.

## Comprobación local

En la zona inicial, con faros encendidos, la vista previa integrada registró aproximadamente 29 FPS y 1.498.429 triángulos por fotograma antes del cambio; después registró 56 FPS y 552.874 triángulos, con resolución adaptativa de 0,9. Son muestras de esa zona, no un benchmark a cámara idéntica ni una garantía para otros equipos. El terreno y el coche se conservaron; se redujo el trabajo gráfico y la resolución se ajustó a la carga.

Las pruebas de visibilidad verifican que cada triángulo y sus atributos se conservan, que un sector detrás de la cámara se descarta, que los límites incluyen las instancias y que los niveles de detalle y la resolución se activan a las distancias y cargas previstas. Las pruebas de física y perímetro comprueban los límites de 100 a 120 km/h y las colisiones.

## Personaje de mayor detalle

La revisión de Sonic aumenta la malla de 28.718 a 268.908 triángulos renderizables, principalmente en cabeza, púas, ojos, manos y calzado. Se conservan el descarte del mundo por cámara y la resolución adaptativa. Los detalles pequeños de ojos y dedos no proyectan sombras por separado. Esta revisión no cuenta con una nueva medición de FPS en el navegador; el resultado debe comprobarse en el equipo del usuario.

## Modelo poligonal actual

Las nuevas referencias sustituyen la revisión densa por una malla de 2.436 triángulos, incluidos los efectos de impulso: aproximadamente un 99,1 % menos que los 268.908 anteriores. El estilo usa caras planas y volúmenes angulares, con especial atención a los ojos blancos, pupilas negras y frente azul en V. Se conserva el controlador del personaje y su animación. La inspección frontal y lateral se realizó con un render por software de la geometría real; la revisión interactiva en el navegador corresponde al usuario.
