# Handoff para migracion a Rocky

## Objetivo

Migrar el proyecto `Reportes Embolsado` desde Sites/prototipo hacia una aplicacion operativa en el servidor Rocky, manteniendo el mapa comercial, los tableros y el flujo futuro de actualizacion de Exceles sin depender de Codex.

## Proyecto actual

- Carpeta local: `/Users/marcos/Documents/Codex/Estrategia Comercial/Reportes Embolsado`
- Repo GitHub: `marcosp-git/Reportes-Embolsado`
- Branch activa: `main`
- Commit actual de referencia: `38ceade24f0dc290cb1c038bf474d3d0fc5a55f7`
- Sites URL: `https://reportes-embolsado.lagomarsino-0450.chatgpt-team.site`
- Sites project id: `appgprj_6a346f10af508191bebbb6dfb01c6a05`
- Version Sites actual al momento del handoff: V24

## Que contiene hoy

- Frontend Leaflet con mapa comercial.
- Zonas AMBA, CABA Norte/Sur e Interior.
- Importacion de capas uMap / espacios blancos.
- Clientes y volumen desde Exceles actuales.
- Dashboard comercial con resumen por jefe, corredores, clientes y volumen.
- Build Sites en `dist/server/index.js`.
- Generadores principales:
  - `scripts/build_dashboard_data.py`
  - `scripts/build_commercial_data.py`
  - `scripts/import-umap.mjs`
  - `scripts/build-amba-caba-boundaries.mjs`
  - `scripts/build-caba-zones.mjs`
  - `scripts/build.mjs`

## Fuentes de datos actuales

- `Archivos de Trabajo/Informes Iñaqui`
- `Archivos de Trabajo/VENDEDORES PARTICULARES`
- `outputs/commercial-audit`
- `public/dashboard-data.js` se genera localmente y esta ignorado por Git.
- `dist/server/index.js` contiene el build publicable embebido.

## Consideraciones comerciales importantes

- El canal es Embolsado de Lagomarsino S.A.
- Jefes:
  - Hernan: AMBA Norte + CABA Norte, pendiente segregacion nueva en Excel.
  - Pablo: AMBA Oeste + CABA Sur.
  - Gustavo: AMBA Sur.
  - Jose: Interior.
- Los Excel actuales todavia usan codigos:
  - `D02`: Gustavo / AMBA Sur.
  - `D03`: Jose / Interior.
  - `D07`: Pablo / AMBA Oeste-Norte agregado.
- No inventar KPI separado de Hernan hasta que llegue fuente Excel nueva.
- El corte AMBA Norte/Oeste debe seguir el Ferrocarril San Martin y empalmar con CABA Norte/Sur.
- Open Door y Lujan quedan en AMBA Oeste.

## Evaluacion territorial pendiente

Usar fuentes reales antes de redibujar AMBA:

- IGN WFS `ign:lineas_de_transporte_ferroviario_AN010` para ferrocarril.
- IGN WFS `ign:localidad_bahra` para localidades.
- IGN WFS `ign:areas_de_asentamientos_y_edificios_020105` para planta urbana.
- IGN WFS `ign:departamento` y `ign:provincia` para limites administrativos.

La recomendacion es generar limites reproducibles con esas capas y excepciones comerciales en JSON, no mover vertices manualmente.

## Sites

Sites sigue siendo la version productiva actual. Para publicar desde este proyecto:

1. Regenerar datos si corresponde.
2. Ejecutar `npm run build`.
3. Commit y push a GitHub.
4. Recordar que Sites valida contra su repositorio fuente interno, no solo contra `origin`.
5. Si Sites dice que el commit no es HEAD, crear credencial temporal de source repository desde el conector Sites y pushear ese mismo commit al remoto temporal.
6. Crear tar con estructura desde raiz:
   - `.openai/hosting.json`
   - `dist/server/index.js`
7. Guardar version Sites con `project_id` y `commit_sha`.
8. Deployar version guardada.

No guardar tokens ni credenciales temporales.

## Migracion recomendada a Rocky

Fase 1: servir frontend actual en Rocky.

- Clonar `marcosp-git/Reportes-Embolsado` en el servidor.
- Instalar dependencias Node/Python necesarias.
- Ejecutar build.
- Servir frontend con Nginx.
- Mantener Sites como fallback hasta validar Rocky.

Fase 2: backend de datos.

- Crear API interna:
  - `/api/dashboard`
  - `/api/clientes`
  - `/api/zonas`
  - `/api/importaciones`
- Guardar ultima version valida.
- Registrar fecha, usuario/fuente, errores y checks de cada importacion.

Fase 3: SharePoint/Excel.

- Usar Microsoft Graph/OAuth o una cuenta de servicio.
- Tomar Exceles desde carpeta SharePoint acordada.
- Validar hojas/columnas/totales antes de publicar datos.
- Si falla la importacion, mantener la ultima version valida.

Fase 4: seguridad.

- No exponer sin autenticacion.
- Usar el esquema ya aplicado en Rocky para otros proyectos: Nginx + servicio backend + control de acceso definido por Marcos.
- Mantener repo privado y datos comerciales fuera de rutas publicas.

## Primer prompt sugerido para el chat Rocky

Estamos en el proyecto Codex `Rocky`, path local `/Users/marcos/Documents/Matriz Mac`. Quiero migrar el proyecto `Reportes Embolsado` al servidor Rocky donde ya tenemos otros sitios/proyectos.

Necesito que primero releas este handoff del repo `Reportes-Embolsado`: `docs/rocky-migration-handoff.md`.

Objetivo inmediato:

1. Verificar acceso al repo GitHub `marcosp-git/Reportes-Embolsado`.
2. Verificar acceso SSH al Rocky y como estan desplegados los otros sitios.
3. Proponer estructura de deploy para Embolsado en Rocky: carpeta, servicio, Nginx, variables, datos, backups y logs.
4. No tocar produccion ni mover Sites todavia.
5. Entregar plan de migracion y, si esta todo claro, preparar primer deploy paralelo en Rocky.

Contexto critico:

- Sites actual sigue funcionando en `https://reportes-embolsado.lagomarsino-0450.chatgpt-team.site`.
- Sites project id: `appgprj_6a346f10af508191bebbb6dfb01c6a05`.
- El ultimo commit usado como referencia es `38ceade24f0dc290cb1c038bf474d3d0fc5a55f7`.
- La migracion busca que los Exceles se actualicen sin depender de Codex, idealmente leyendo SharePoint y conservando ultima version valida.
