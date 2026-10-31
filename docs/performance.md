# Rendimiento del mundo abierto

Estado actual: carretera de montaña a cielo abierto. Se han eliminado los túneles completos: geometría, portales, refuerzos, letreros, luces, iluminación fija y colliders de techo y paredes. La cámara ya no calcula entradas ni aplica límites interiores. El coche, su suspensión y su física se mantienen a 120 Hz. Se mantienen el renderizado por sectores, los niveles de detalle del bosque, el descarte por cámara y la resolución adaptativa. Las secciones sobre Sonic documentan pruebas anteriores; el personaje no se carga en producción.

El terreno físico conserva todos sus triángulos y la misma colisión. Su malla visual se divide en sectores de 400 m; a más de 500 m del centro del sector usa una rejilla visual simplificada. Cada vértice del borde se conserva para evitar grietas entre niveles. La física mantiene la malla completa. Los 800 árboles se agrupan en sectores de 240 m: detalle cercano, siluetas desde 190 m del centro del sector y descarte a 850 m. Las copas pasan de 16 a 9 piezas por árbol y usan sombreado Lambert. Los límites espaciales incluyen todas las instancias.

La física de los árboles se activa a 110 m de cualquiera de los dos coches y se descarga cuando queda a más de 140 m de ambos, con actualización al recorrer 25 m. El margen mínimo de 85 m supera ampliamente el movimiento por paso a 135 km/h. Los teletransportes actualizan la región al primer paso y regresar restaura los troncos. El suelo, carretera y muro siguen teniendo colisión en todo el mapa. La selección no depende de hacia dónde mire la cámara.

La escena WebGL usa un máximo de 960 × 600 píxeles de presupuesto, ajustado a la relación de aspecto; la interfaz HTML mantiene su resolución nativa. Ante 12–14 FPS, reduce rápido el ratio hasta el 60 % del máximo calculado; la recuperación es lenta y el redimensionado recalcula el presupuesto. Se desactiva MSAA y las dos pasadas de sombras dinámicas; dos planos suaves bajo los coches dan sombras de contacto. Los faros y las luces policiales se conservan. Se eliminan los filtros de desenfoque de los controles durante la conducción.

La física mantiene 120 Hz, con un máximo de ocho pasos de recuperación por fotograma. Se evaluaron 60 Hz, pero reducir la física de árboles lejanos eliminó el coste que justificaba cambiar la frecuencia. El escenario conserva sus matrices; solo coche, patrulla, cielo y luces móviles se actualizan. Los tirones de 250 ms a un segundo también activan la reducción de resolución; las pausas largas al cambiar de pestaña se descartan.

## Medición anterior a la retirada de túneles (histórica)

En la revisión anterior se retiraron las cuatro luces puntuales de los túneles y su búsqueda por distancia en cada fotograma. El techo y las paredes interiores llevan colores de iluminación precalculados; dos franjas con textura aditiva aportan luz cálida al asfalto. Las lámparas siguen visibles y se agrupan por material en dos mallas por túnel. La carrocería mantiene sus dos faros visibles, iluminados por un único foco ancho; se conserva la luz trasera. El presupuesto de luces locales pasa de cinco puntuales y dos focos a una puntual y un foco, sin variar al entrar en un túnel. La luz ambiental y la luna se conservan.

Mismo mundo, dos modelos de coche, cámara Amplia y posiciones fijas, comparados mediante frustum y LOD en Node. No se ejecuta WebGL; son recuentos de carga y no mediciones de FPS.

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Árboles | 1.800 | 800 |
| Triángulos detallados del bosque completo | 810.240 | 222.126 |
| Luces locales dinámicas | 7 | 2 |
| Mallas visibles estimadas, zona inicial | 282 | 215 |
| Triángulos visibles estimados, zona inicial | 520.008 | 379.642 |
| Mallas visibles estimadas, primer túnel | 238 | 209 |
| Triángulos visibles estimados, primer túnel | 519.662 | 375.464 |
| Mallas visibles estimadas, segundo túnel | 262 | 216 |
| Triángulos visibles estimados, segundo túnel | 403.301 | 332.799 |

Las búsquedas de navegación en esas muestras promedian aproximadamente 0,5–0,9 ms. No explican por sí solas el bajón gráfico del túnel. Estas cifras corresponden a la revisión previa, que todavía incluía las galerías. La versión actual elimina también esas mallas y la iluminación fija. Las pruebas actuales comprueban rayos libres por los antiguos techos y paredes, encuadres de cámara sin compresión y tránsito de ambos coches por los tramos abiertos.

## Medición anterior: física y modelo (histórica)

Misma posición inicial y cámara Amplia en Node; promedio de 300 pasos tras 60 de calentamiento, con el mundo real de Rapier y un coche. El conteo visual simula frustum y LOD; no ejecuta WebGL y no es una medición de FPS.

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Troncos con colisión en la muestra inicial | 1.800 | 12 |
| Paso físico a 120 Hz, media | 3,53 ms | 0,16 ms |
| Paso físico a 120 Hz, percentil 95 | 3,69 ms | 0,24 ms |
| Triángulos del modelo de un coche | 165.225 | 69.013 |
| Mallas visibles estimadas de la muestra | 326 | 269 |
| Triángulos visibles estimados de la muestra | 628.919 | 510.108 |

La cantidad de troncos activos depende de la zona. El coste físico medio de la muestra baja aproximadamente un 95 %. Estas cifras no garantizan una mejora concreta de FPS en la GPU del usuario.

## Recuperación en el lugar

F o el botón Enderezar conservan X/Z y el rumbo horizontal. Un rayo busca la superficie física de apoyo, respetando el suelo y las pendientes; hay respaldo analítico para posiciones enterradas. El coche se alinea con la pendiente, se coloca por encima y se anulan velocidad y giro. No se reinician el reloj policial, la ronda ni el límite progresivo. Las pruebas cubren suelo, pendientes del 27 % y recuperación en los tramos abiertos.

## Optimización del coche y del recorrido

El máximo del jugador pasa de 100 a 120 km/h y el de la patrulla de 106 a 135 km/h con un único reloj de persecución; se eliminan los 47 power-ups, su animación, búsqueda de recogidas y marcadores del minimapa. Las llamas son ráfagas breves al acelerar fuerte, con cuatro planos y sin nuevas luces o cuerpos físicos.

Las 260 piezas opacas compatibles del coche se agrupan en 45 mallas por material, conservando todos sus triángulos y transformaciones. Los cristales, las instancias de detalle y las ruedas móviles se conservan por separado. El agrupado mantiene 63 mallas renderizables frente a 278 piezas originales. En esta revisión se reducen los segmentos de carrocería, tubos, biseles y ruedas: el modelo pasa de 165.225 a 69.013 triángulos. No cambia la colisión del coche ni su diseño general. Esto es un recuento de mallas; no equivale a un aumento medido de FPS.

El escenario calcula sus matrices de mundo una sola vez. Cada fotograma solo actualiza el coche, el cielo y las luces móviles. Se precalientan los materiales durante la carga para reducir compilaciones al ver por primera vez otros sectores o el efecto de escape. Se conservan el LOD, el descarte por cámara y la resolución adaptativa.

Las superficies físicas usan la corrección de aristas internas de Rapier y el CCD admite cuatro subpasos cuando se produce un impacto. Las pruebas recorren los seis accesos en ambos sentidos a 80 y 100 km/h, comprueban el asfalto con rayos y mantienen las colisiones del terreno y perímetro. La mejora de FPS debe verificarse en el equipo del usuario; no se dispone de una nueva medición gráfica para esta revisión.

## Persecución policial

La patrulla comparte la geometría del coche optimizado; su pintura, faros y animación de ruedas son independientes. La barra roja y azul usa materiales luminosos, sin luces físicas ni mapas de sombra adicionales. El clon se mantiene en la lista de raíces móviles para conservar la congelación del escenario.

La IA deja de guardar el recorrido histórico del jugador. Predice su posición hasta 0,9 segundos por delante y vuelve a calcular una ruta cada 0,75 segundos o tras 12 m de desplazamiento del objetivo. Los recálculos no reinician el tiempo ni la dificultad. Si el trayecto directo es transitable, lo usa; en caso contrario, busca el camino más corto sobre un grafo de carretera y atajos, con conexiones en ambos sentidos. Los muestreos de altura, pendiente y tres rayos a lo ancho del coche evitan atajos a través de terreno abrupto y paredes. Las consultas de navegación se limitan a los recálculos, sin ejecutarlas a 120 Hz. Si queda atascada intenta retroceder y volver a arrancar. Si permanece volcada y casi detenida durante 2,5 segundos, con suelo físico a menos de 2 m, usa la misma recuperación que F: conserva X/Z, rumbo, ruta, tiempo e intensidad. El temporizador se cancela si vuelve a moverse o queda en el aire. No se teletransporta para alcanzar al jugador.

Ambos coches usan `createDrivingPhysics`: cuerpo dinámico de igual masa y colliders sólidos, cuatro ruedas, suspensión, motor, frenado, agarre en asfalto y campo, resistencia aerodinámica y CCD. Los choques de la patrulla son físicos y el contacto entre los chasis alimenta la captura. Se necesitan 5 segundos de contacto efectivo; una separación de 0,2 segundos borra el progreso y los huecos menores no añaden tiempo. Pausa, menú y derrota congelan el contador, y una nueva ronda lo limpia. Un choque breve conserva la conducción y el impulso físico. El indicador de captura se actualiza con el HUD existente, sin nuevas pasadas de renderizado. Las consultas de cámara y suspensión excluyen cuerpos dinámicos. Las ruedas y la sombra de contacto de la patrulla usan el estado de su suspensión real.

Cada paso de 120 Hz prepara las fuerzas de ambos coches, integra el mundo una sola vez y finaliza ambos controladores. Añadir el segundo coche no duplica los pasos del escenario. La activación local de troncos incluye ambos vehículos, incluso cuando están separados. Esto conserva las optimizaciones de terreno, bosque, sombras y resolución; requiere comprobar los FPS en el equipo del usuario.

El jugador conserva su progresión de 100 a 120 km/h. La patrulla usa el mismo limitador físico con una ventaja progresiva: de 106 a 135 km/h en dos minutos, frente a los 100 a 120 del jugador. La intensidad aumenta el acelerador de la IA del 72 al 100 % y su velocidad objetivo en curvas; no cambia masa, fuerzas del motor, suspensión o agarre. Conserva tres segundos de margen inicial. La velocidad objetivo tiene en cuenta el movimiento del jugador para no frenar con demasiada antelación ante un objetivo que sigue acelerando.

Las pruebas comprueban que ignora vueltas antiguas cuando el jugador está cerca, anticipa objetivos móviles, limita los recálculos y evita paredes y superficies apiladas. También verifican la velocidad física adicional, tracción en pendientes del 27 %, tránsito por los tramos abiertos del norte y sur, recuperación tras vuelcos y captura tras cinco segundos de contacto. No hay una nueva medición gráfica de FPS de esta revisión.

## Menú y cámaras exteriores

El menú inicial mantiene el mundo y el reloj de persecución detenidos. Solo actualiza la vista previa a un máximo de 30 FPS; el jugador comienza mediante el botón. El selector de cámara está en la barra superior durante la partida, junto al control de luces. La fase única de sesión impide que teclas de conducción, pausa o reinicio activen la física desde el menú. Hay retorno al menú desde juego, pausa y derrota.

Las cuatro vistas exteriores usan la misma cámara y una única pasada de renderizado. La vista táctica encuadra al jugador y la patrulla cercana, adapta la distancia a la relación de aspecto y limita el alejamiento si la patrulla queda muy lejos. Todas conservan las restricciones de paredes y terreno. La indicación de dirección policial y el minimapa no requieren otro render WebGL. La cámara de habitáculo se retira.

Las pruebas verifican distancias exteriores, encuadre de ambos vehículos en horizontal y vertical, dirección policial y congelación de movimiento/reloj en menú, pausa y derrota.

## Comprobación visual anterior (histórica)

En la zona inicial, con faros encendidos, la vista previa integrada registró aproximadamente 29 FPS y 1.498.429 triángulos por fotograma antes del cambio; después registró 56 FPS y 552.874 triángulos, con resolución adaptativa de 0,9. Son muestras de esa zona, no un benchmark a cámara idéntica ni una garantía para otros equipos. El terreno y el coche se conservaron; se redujo el trabajo gráfico y la resolución se ajustó a la carga.

Las pruebas de visibilidad verifican que cada triángulo y sus atributos se conservan, que un sector detrás de la cámara se descarta, que los límites incluyen las instancias y que los niveles de detalle y la resolución se activan a las distancias y cargas previstas. Las pruebas de física y perímetro comprueban los límites de 100 a 120 km/h y las colisiones.

## Archivo: experimento con Sonic de mayor detalle

La revisión de Sonic aumenta la malla de 28.718 a 268.908 triángulos renderizables, principalmente en cabeza, púas, ojos, manos y calzado. Se conservan el descarte del mundo por cámara y la resolución adaptativa. Los detalles pequeños de ojos y dedos no proyectan sombras por separado. Esta revisión no cuenta con una nueva medición de FPS en el navegador; el resultado debe comprobarse en el equipo del usuario.

## Archivo: experimento con Sonic poligonal

Las nuevas referencias sustituyen la revisión densa por una malla de 2.436 triángulos, incluidos los efectos de impulso: aproximadamente un 99,1 % menos que los 268.908 anteriores. El estilo usa caras planas y volúmenes angulares, con especial atención a los ojos blancos, pupilas negras y frente azul en V. Se conserva el controlador del personaje y su animación. La inspección frontal y lateral se realizó con un render por software de la geometría real; la revisión interactiva en el navegador corresponde al usuario.
