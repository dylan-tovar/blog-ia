# PRD 5.5: Moderación de Notas por Diccionario

## 1. Contexto y Objetivo
Actualmente, las notas (comentarios o respuestas cortas) se publican de inmediato sin ningún tipo de revisión. A diferencia de los artículos que pasan por una validación con IA (Gemini) según el `PRD-5.3-publish-moderation.md`, las notas quedaron explícitamente fuera de ese flujo (ADR 0009 establece que una nota siempre nace como `published`).

El objetivo es implementar un filtro léxico (basado en un diccionario determinista) rápido, eficiente y de baja fricción, que advierta a los usuarios sobre lenguaje malsonante antes de guardar la nota y bloquee categóricamente intentos de publicar discursos de odio o amenazas.

## 2. Alcance
* **En alcance:**
  * Escaneo determinista en el cliente (tiempo real mientras se escribe) y en el servidor (al recibir el POST).
  * Diccionario de palabras categorizado por severidad (`grave`, `leve`).
  * Interfaz de advertencia (2 pasos) para faltas leves, pidiendo confirmación al autor.
  * Bloqueo total para faltas graves (odio y amenazas).
* **Fuera de alcance:**
  * Moderación con IA generativa (Gemini) para notas (por costos y latencia).
  * Panel de administración de diccionarios (los diccionarios vivirán en código por el momento).

## 3. Criterios de Aceptación
1. **Diccionario Configurable:** Existe una lista estructurada de palabras con diferentes categorías (insulto, vulgaridad, odio, amenaza) y niveles de severidad (`grave`, `leve`).
2. **Validación en Cliente:** Al redactar una nota (en el `NoteComposer` o en los modales como `NoteDialog` y `EditNoteDialog`), el sistema debe escanear el texto y mostrar alertas tempranas si detecta coincidencias.
3. **Flujo de Aceptación de 2 Pasos:** Si hay faltas `leve` (vulgaridad, insulto común), el botón de publicar cambia a "Sí, publicar" y se requiere doble confirmación. Si hay faltas `grave`, el botón se bloquea.
4. **Validación en Servidor:** Las Server Actions (`createNote`, `updateNote`) deben ejecutar la misma validación de diccionario para rechazar el contenido si evade el cliente, garantizando la seguridad de la base de datos.
5. **Rendimiento:** El diccionario combinatorio (matrices cruzadas de identidades y ofensas) debe agruparse (chunking) para no sobrepasar los límites del motor Regex de los navegadores (V8).

## 4. Diseño Técnico
* **Diccionarios Dinámicos (`dictionary.ts`):** 
  Se emplean listas estáticas para insultos y vulgaridades. Para el discurso de odio, se cruzan arrays de identidades vulnerables (raza, condición, etc.) con adjetivos ofensivos explícitos, para evitar falsos positivos al nombrar una identidad aislada.
* **Escáner (`scan.ts`):** 
  El motor genera expresiones regulares en bloques (chunks de 100 términos) para evitar errores de `Invalid regular expression` (límites de grupos de captura nombrados). Extrae la posición (start, end) y el tipo de ofensa.
* **Integración UI:**
  El hook `useModerationScan` con *debounce* de 400ms evalúa el texto del form. Intercepta el evento `onSubmit` de React para imponer el *doble check* si es necesario.
* **Integración Backend (`actions.ts`):**
  Llama a `scanArticle` (que agrupa título y contenido o simplemente el contenido de la nota) y lanza error si hay severidad `grave`.
