# Evaluacion de limites AMBA y actualizacion de Excel

## Fuentes territoriales evaluadas

El IGN publica capas vectoriales y WFS oficiales en WGS 84/POSGAR 07. Para este proyecto las capas candidatas son:

- `ign:lineas_de_transporte_ferroviario_AN010`: traza ferroviaria. Sirve para tomar el Ferrocarril San Martin como limite operativo Norte/Oeste y evitar dibujarlo a mano.
- `ign:localidad_bahra`: localidades BAHRA con partido/departamento. Sirve para validar nombres y evitar partir localidades sin querer.
- `ign:areas_de_asentamientos_y_edificios_020105`: plantas urbanas IGN/INDEC. Sirve para detectar si una mancha urbana queda partida por un limite comercial.
- `ign:departamento` y `ign:provincia`: limites administrativos. Sirven como mascara de partidos/provincias y para contener Interior.

Recomendacion: mantener CABA como ya esta, con fuente oficial GCBA. Para AMBA, pasar a un generador reproducible:

1. Descargar del IGN la traza ferroviaria San Martin dentro del bbox AMBA.
2. Filtrar por `fna`/`nam` que contenga `General San Martin`.
3. Construir una linea de corte operacional hasta Retiro, empalmada con la division CABA Norte/Sur.
4. Cruzar contra localidades/planta urbana para listar localidades partidas.
5. Resolver excepciones comerciales en un JSON chico, no editando vertices a mano.

No conviene reemplazar todo por partidos completos: es simple, pero deja demasiado gruesas zonas como La Matanza, Lomas, San Martin, Pilar o Lujan. Tampoco conviene usar solo planta urbana: es mas precisa para localidades, pero no define por si sola una zona comercial completa.

## Corredores

Los Excel actuales traen jefes como codigos (`D02`, `D03`, `D07`). Para que el tablero sea legible, el generador agrega una capa semantica:

- `D02`: Gustavo, AMBA Sur
- `D03`: Jose, Interior
- `D07`: Pablo, AMBA Oeste / Norte

Cuando llegue la segregacion nueva, el lugar correcto para incorporar a Hernan es este mapeo del generador, idealmente alimentado por una tabla fuente.

## Actualizacion de Excel sin Codex

Objetivo: que Ignacio o el equipo suba Exceles y el sitio reprocesa datos sin pedir una sesion Codex.

Ruta recomendada para Sites:

1. Agregar un panel interno `/admin` con login del workspace y lista de archivos esperados.
2. Subir Exceles al propio Site.
3. Guardar originales en storage privado del Site.
4. Parsear con el mismo contrato actual y generar JSON normalizado.
5. Guardar version, fecha, usuario, validaciones y errores.
6. El mapa consume siempre la ultima version validada.

Ventaja: no depende de Codex ni de deploy por cada Excel. El sitio queda como aplicacion interna.

Alternativa GitHub: guardar Exceles en un repo privado y correr GitHub Actions para regenerar `public/dashboard-data.js`. Es prolijo para auditoria, pero si el despliegue a Sites sigue dependiendo del conector, no elimina del todo a Codex.

Alternativa SharePoint/OneDrive: es ideal para usuarios de negocio, pero requiere una integracion Graph/OAuth propia para que el Site lea archivos privados. La dejaria para una segunda etapa.

Decision sugerida: primero construir admin upload en Sites con versionado privado. Luego, si el flujo madura, sumar espejo en GitHub o SharePoint como fuente documental.
