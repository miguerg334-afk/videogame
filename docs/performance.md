# Rendimiento del mundo abierto

Estado actual: el juego vuelve a cargar el carro, su suspensión y su física a 120 Hz. Se mantienen el renderizado por sectores, los niveles de detalle del bosque, el descarte por cámara y la resolución adaptativa. Las secciones sobre Sonic documentan pruebas anteriores; el personaje no se carga en producción.

El terreno conserva todos sus triángulos y la misma colisión. Su malla visual se divide en sectores de 400 m para descartar lo que queda fuera del campo de visión. Los 1.800 árboles se agrupan en sectores de 160 m: detalle cercano, siluetas a partir de 300 m del centro del sector y descarte a 1.400 m. Cada lote de instancias tiene un límite espacial explícito; Three.js 0.128 desactiva por defecto el descarte de InstancedMesh.

Los objetos estáticos conservan sus matrices. El coche, la cámara, el cielo y las luces móviles siguen actualizándose. Las sombras solares usan un mapa de 768 px. La resolución comienza en 1 píxel por píxel CSS, se ajusta lentamente entre 0,7 y un máximo de 1,25 según el dispositivo y la carga. El contador junto al velocímetro muestra FPS reales de los fotogramas activos.

La física mantiene 120 Hz. Se limita a ocho pasos de recuperación por fotograma para evitar que una caída de FPS acumule más trabajo indefinidamente. En un bloqueo prolongado, la simulación puede perder tiempo real antes de recuperarse.

## Comprobación local

En la zona inicial, con faros encendidos, la vista previa integrada registró aproximadamente 29 FPS y 1.498.429 triángulos por fotograma antes del cambio; después registró 56 FPS y 552.874 triángulos, con resolución adaptativa de 0,9. Son muestras de esa zona, no un benchmark a cámara idéntica ni una garantía para otros equipos. El terreno y el coche se conservaron; se redujo el trabajo gráfico y la resolución se ajustó a la carga.

Las pruebas de visibilidad verifican que cada triángulo y sus atributos se conservan, que un sector detrás de la cámara se descarta, que los límites incluyen las instancias y que los niveles de detalle y la resolución se activan a las distancias y cargas previstas. Las pruebas de física y perímetro comprueban el límite de 200 km/h y las colisiones.

## Personaje de mayor detalle

La revisión de Sonic aumenta la malla de 28.718 a 268.908 triángulos renderizables, principalmente en cabeza, púas, ojos, manos y calzado. Se conservan el descarte del mundo por cámara y la resolución adaptativa. Los detalles pequeños de ojos y dedos no proyectan sombras por separado. Esta revisión no cuenta con una nueva medición de FPS en el navegador; el resultado debe comprobarse en el equipo del usuario.

## Modelo poligonal actual

Las nuevas referencias sustituyen la revisión densa por una malla de 2.436 triángulos, incluidos los efectos de impulso: aproximadamente un 99,1 % menos que los 268.908 anteriores. El estilo usa caras planas y volúmenes angulares, con especial atención a los ojos blancos, pupilas negras y frente azul en V. Se conserva el controlador del personaje y su animación. La inspección frontal y lateral se realizó con un render por software de la geometría real; la revisión interactiva en el navegador corresponde al usuario.
