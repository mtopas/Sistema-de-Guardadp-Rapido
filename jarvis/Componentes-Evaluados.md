# Componentes Evaluados — Jarvis

---

## SECCIÓN 1 — Hallazgos que afectan decisiones de 0.1 ya tomadas

---

### 1. ChromaDB como índice de embeddings

**Qué decisión afecta:** ChromaDB + nomic-embed-text como capa de indexación semántica.

**Qué dice la investigación:** El informe de memoria es explícito: el vector store debe ser un índice derivado, nunca fuente de verdad. La recomendación para MVP es PostgreSQL + pgvector en lugar de un motor vectorial separado. ChromaDB no aparece mencionado positivamente; Qdrant tampoco se recomienda desde el día uno. Agregar ChromaDB como servicio independiente cuando pgvector puede cumplir la misma función incrementa la complejidad operacional y crea un segundo sistema que requiere sincronización con la fuente primaria.

**Recomendación:** Revisar antes de implementar. Si el backend de datos va a ser SQLite en 0.1, ChromaDB puede tolerable como índice auxiliar. Pero si hay cualquier chance de migrar a PostgreSQL en 0.2, es mejor empezar directamente con pgvector y eliminar una dependencia externa.

**Urgencia:** Antes de 0.1 — la elección de vector store determina el esquema del event store desde el día uno.

---

### 2. Taxonomía de memoria (RAW, SEMANTIC, DECISION, PROJECT) en Markdown vault + SQLite

**Qué decisión afecta:** Tipos de memoria y su almacenamiento en Markdown vault + SQLite.

**Qué dice la investigación:** El informe de memoria recomienda event sourcing como pilar: toda entrada entra como `Event` con `occurred_at`, `recorded_at`, `principal`, `trust`, `privacy_class`; las memorias derivadas (claims, episodios, procedimientos) son proyecciones. La taxonomía RAW/SEMANTIC/DECISION/PROJECT es conceptualmente compatible pero le falta la capa temporal: cada claim debe tener `valid_from`, `valid_to`, `confidence`, `authority` y `source_event_ids`. Sin eso, actualizar una preferencia implica sobreescribir, lo que destruye historia. El Markdown vault es transparente y versionable, pero no permite queries temporales ni provenance automático.

**Recomendación:** Mantener la decisión de tipos de memoria, pero incorporar los campos temporales mínimos desde 0.1 (`valid_from`, `recorded_at`, `source_id`, `confidence`). Sin ellos, el sistema degrada en un mapa clave-valor sin historia. El Markdown vault puede usarse para memoria procedimental/PROJECT, donde el versionado con Git es real valor; para claims SEMANTIC y DECISION conviene SQLite con esquema estructurado.

**Urgencia:** Antes de 0.1 — agregar campos temporales al esquema después es una migración dolorosa.

---

### 3. Privacy Gateway mínimo: flags local_only/confidential + regex para secretos

**Qué decisión afecta:** Estrategia de privacidad y seguridad del Memory Core.

**Qué dice la investigación:** El informe de seguridad es directo: la defensa basada en filtros de contenido (regex, keywords) no puede ser la frontera primaria. Los ataques modernos funcionan por ingeniería social sobre el agente, no por frases literales reconocibles. El patrón crítico es que el trust level de una fuente debe propagarse sin degradarse a través de resúmenes y derivados: contenido `web.untrusted` resumido diez veces sigue siendo `web.untrusted`. Además, "sensitive memory requires opt-in" implica que ciertos tipos de datos nunca deben almacenarse automáticamente solo porque aparecieron en una conversación.

**Recomendación:** Revisar antes de implementar. En 0.1, el Privacy Gateway debe incorporar al menos dos propiedades no negociables: (a) cada evento tiene un `trust_class` que persiste en todos sus derivados, y (b) existe una lista explícita de clases de datos que no se almacenan automáticamente (credenciales, tokens, datos financieros). La regex para secretos puede complementar esto pero no reemplazarlo.

**Urgencia:** Antes de 0.1 — sin `trust_class` en el esquema de eventos, no hay forma de implementar provenance de seguridad después.

---

### 4. Modelo de razonamiento: GPT-5.4 mini (acoplamiento directo)

**Qué decisión afecta:** Elección de GPT-5.4 mini como modelo de razonamiento externo.

**Qué dice la investigación:** El informe de componentes reutilizables recomienda LiteLLM como gateway de modelos desde temprano para evitar vendor lock-in arquitectónico. Acoplar la aplicación directamente a un SDK produce deuda técnica: si el modelo cambia (precio, API, deprecación), hay que refactorizar el código que lo llama. Con LiteLLM, el cambio de modelo es una variable de entorno.

**Recomendación:** Mantener GPT-5.4 mini como modelo elegido, pero pasar las llamadas por LiteLLM desde 0.1. El overhead es mínimo (wrapper HTTP) y preserva la capacidad de sustituir el modelo sin tocar el código del Memory Core.

**Urgencia:** Antes de 0.1 — es mucho más fácil agregarlo desde el inicio que inyectarlo después cuando el código ya tiene llamadas directas al SDK de OpenAI.

---

### 5. Worker de background con polling a SQLite

**Qué decisión afecta:** Arquitectura del procesamiento asíncrono de memorias.

**Qué dice la investigación:** El patrón polling sobre SQLite es válido para 0.1. El informe de memoria lo valida conceptualmente: la consolidación debe correr en background, no bloquear la conversación. Sin embargo, el informe advierte que PostgreSQL ofrece LISTEN/NOTIFY (reemplaza polling), JSONB, full-text search, transacciones, row-level security y pgvector, todo en un solo motor. Usar SQLite en 0.1 es razonable en escala, pero si la memoria crece hacia claims temporales y episodios, SQLite sin pgvector obliga a mantener ChromaDB como servicio separado.

**Recomendación:** Mantener la decisión para 0.1 si el scope está claro. Documentar explícitamente que la migración a PostgreSQL está prevista en 0.2 antes de agregar la capa de Graphiti o recuperación híbrida.

**Urgencia:** Puede esperar a 0.2 — con alcance de 0.1 bien delimitado, SQLite + ChromaDB es suficiente. El riesgo es que sin esa decisión documentada, 0.1 puede crecer informalmente hasta donde migrar se vuelve costoso.

---

### 6. Clasificación / extracción de entidades: llama3.2:3b local

**Qué decisión afecta:** Modelo de extracción y clasificación de entidades.

**Qué dice la investigación:** El informe de memoria señala que la extracción de entidades mediante LLM es una dependencia de Graphiti y tiene sus propias limitaciones (resolución de contradicciones no infalible). Para 0.1, llama3.2:3b es una elección razonable. Lo único que añade la investigación es que la confianza del resultado de extracción debe almacenarse como `extraction_confidence` separada de `source_authority`: que el modelo extrajera un claim con alta confianza no significa que la fuente de ese claim sea confiable.

**Recomendación:** Mantener la decisión. Agregar al esquema un campo `extraction_confidence` para distinguirla de la authority de la fuente.

**Urgencia:** Antes de 0.1 — sin ese campo, los claims extraídos son indistinguibles de los afirmados explícitamente por el usuario.

---

## SECCIÓN 2 — Componentes a evaluar o incorporar por fase

| Componente | Qué hace | Fase de Jarvis | Decisión | Razón |
|---|---|---|---|---|
| **LiteLLM** | Gateway unificado de proveedores de modelos; routing, fallbacks, presupuestos, observabilidad de coste | 0.1 | **INCORPORAR** | Desacopla el código de un SDK específico sin overhead real; cambiar modelo pasa a ser configuración |
| **Infisical Agent Vault** | Broker de credenciales: el agente nunca ve el secreto real; lo inyecta en tránsito | 0.2 (cuando haya tool system) | **INCORPORAR** | La investigación de seguridad lo considera la pieza de mayor prioridad antes de habilitar autonomía real; diseñar el esquema desde 0.1 aunque el vault físico llegue en 0.2 |
| **Langfuse** | Observabilidad de trazas LLM: latencia, coste, tool calls, evaluaciones | 0.1 | **INCORPORAR** | Necesario para depurar el Memory Core desde el primer día; costo operacional mínimo en self-hosted |
| **OpenTelemetry** | Trazas estándar de infraestructura, correlacionables con Langfuse | 0.1 | **INCORPORAR** | El security audit log debe ser independiente del sistema LLM; OTel es el estándar |
| **Graphiti** | Temporal knowledge graph: entidades, relaciones, validez temporal, episodios vinculados | 0.2 | **EVALUAR** | Apache-2.0, activo (v0.29.3 julio 2026); candidato más fuerte para memoria semántica temporal; no introducir hasta que PostgreSQL + pgvector muestren limitaciones en queries relacionales |
| **Mem0** | Extracción de memorias desde conversaciones, búsqueda híbrida, self-hosted | 0.1-0.2 | **EVALUAR** | Puede reducir ingeniería en el Memory Processor; evaluarlo en bake-off contra implementación propia antes de adoptar; Apache-2.0 |
| **Hermes Agent** | Núcleo de agente con memoria persistente, skills, subagentes, cron, MCP, múltiples canales | post-0.1 | **EVALUAR** | Candidato principal para el núcleo de Jarvis cuando se agregue tool system y agentes; bake-off con OpenClaw es el siguiente paso relevante |
| **OpenClaw** | Asistente personal always-on con gateway central, múltiples canales, voz, extensiones | post-0.1 | **EVALUAR** | Rival directo de Hermes como base arquitectónica; bake-off recomendado antes de construir infraestructura propia |
| **Cedar** | Motor de autorización con modelo principal/action/resource/context; RBAC/ABAC externo al LLM | 0.2 | **EVALUAR** | El informe de seguridad lo prefiere sobre OPA para el patrón ABAC de Jarvis; introducir cuando se agregue el Action Broker |
| **OPA** | Policy engine general, alternativa/complemento a Cedar | 0.2 | **EVALUAR** | Más genérico que Cedar; evaluar si Cedar no cubre algún caso de Jarvis |
| **Playwright MCP** | Control web mediante DOM/accessibility tree; más robusto que visión + coordenadas | post-0.1 | **DIFERIR** | No hay tool system en 0.1; candidato prioritario cuando llegue la capa de navegación |
| **Browser Use** | Framework para control autónomo de navegador web | post-0.1 | **DIFERIR** | Alternativa a Playwright MCP; evaluar en conjunto cuando llegue la capa web |
| **ActivityWatch** | Historial local de apps, ventanas, URLs; contexto real de actividad del usuario | 0.2 | **DIFERIR** | Valiosa como fuente de contexto episódico; no urgente en 0.1 cuyo foco es captura explícita |
| **Pydantic AI** | Framework de workflows de agentes: estado, herramientas, HITL, recuperación | post-0.1 | **DIFERIR** | Evaluar junto a LangGraph cuando se construya el agente; si Hermes/OpenClaw ganan el bake-off, puede no ser necesario |
| **LangGraph / LangMem** | Primitivas de memoria y workflows de agentes; separación hot-path/background | post-0.1 | **DIFERIR** | LangMem tiene ideas de diseño valiosas (consolidación background, separación episódica/semántica/procedimental); adoptar conceptos aunque no se use LangGraph como framework |
| **MemOS** | "Memory OS": memoria multimodal, procedimental, skill evolution, multi-agente | post-0.1 | **DIFERIR** | Muy alineado con Jarvis a largo plazo; demasiado amplio para 0.1; pilotar en paralelo a Mem0 en fase de evaluación de memoria |
| **E2B** | Sandboxes efímeros para ejecución de código por agentes | post-0.1 | **DIFERIR** | Necesario cuando Jarvis ejecute código arbitrario; no relevante en 0.1 |
| **Temporal** | Durable execution para tareas largas, retries, compensaciones, HITL | post-0.1 | **DIFERIR** | Introducir cuando Jarvis tenga workflows que puedan durar horas; innecesario en 0.1 |
| **IBM ContextForge** | Gateway de herramientas MCP/REST/gRPC; RBAC, rate limiting, auditoría, plugins OPA/Cedar | 0.2 | **DIFERIR** | Evaluar seriamente como Tool Plane cuando llegue el tool system; puede evitar construir auth + gateway + schemas desde cero |
| **Snyk Agent Scan** | Scanning de MCP/skills; detecta tool poisoning, prompt injection en descripciones | post-0.1 | **DIFERIR** | Incorporar al pipeline de admisión de MCPs cuando exista tool system |
| **sherpa-onnx** | Suite local: STT, TTS, VAD, keyword spotting, speaker ID, diarization; multiplataforma | post-0.1 | **DIFERIR** | Voz no está en 0.1; candidato prioritario cuando llegue la capa de voz por ser un único motor que reemplaza múltiples proyectos |
| **LiveKit Agents** | Voz y video realtime: WebRTC, STT/LLM/TTS intercambiables, SDKs multiplataforma | post-0.1 | **DIFERIR** | Voz no está en 0.1; candidato para la capa conversacional realtime cuando se requiera multi-dispositivo |
| **Pipecat** | Framework Python para agentes de voz conversacionales; pipelines, streaming, interrupciones | post-0.1 | **DIFERIR** | Alternativa a LiveKit; evaluar junto cuando llegue voz |
| **openWakeWord** | Detección de wake word local, entrenamiento de nuevos modelos | post-0.1 | **DIFERIR** | No relevante hasta tener voz |
| **faster-whisper** | STT local Python con CTranslate2; mejor velocidad/memoria que Whisper original | post-0.1 | **DIFERIR** | No relevante hasta tener voz; candidato para nodos Python |
| **Home Assistant** | Hub de domótica; Jarvis habla con HA, HA habla con dispositivos | post-0.1 | **DIFERIR** | Integración correcta cuando Jarvis tenga tool system y world model |
| **n8n** | Workflows visuales para automatizaciones deterministas; webhooks, miles de integraciones | post-0.1 | **DIFERIR** | Útil para tareas repetibles y predecibles; Sustainable Use License requiere revisión si Jarvis se distribuye |
| **NATS / MQTT** | Bus de eventos para comunicación desacoplada entre servicios y dispositivos | post-0.1 | **DIFERIR** | Relevante cuando haya múltiples nodos; SQLite polling es suficiente en 0.1 |
| **Tailscale** | Red privada WireGuard para conectar nodos distribuidos sin exponer a Internet | post-0.1 | **DIFERIR** | Relevante cuando Jarvis esté distribuido en homelab + notebook + móvil |
| **Qdrant** | Vector database dedicado; recuperación semántica y filtros avanzados | post-0.1 | **DIFERIR** | pgvector cubre el MVP; Qdrant solo si escala justifica un motor separado |
| **Frigate** | Detección local de objetos sobre cámaras IP; produce eventos semánticos, no video continuo | post-0.1 | **DIFERIR** | Relevante cuando Jarvis tenga world model físico |
| **ESPHome** | Firmware para sensores ESP32 integrable con Home Assistant | post-0.1 | **DIFERIR** | Capa física; no relevante hasta tener integración con HA |
| **OpenRecall** | Captura periódica de pantalla consultable semánticamente | post-0.1 | **DESCARTAR** | ActivityWatch cubre contexto con menor riesgo de privacidad; OpenRecall solo como opt-in muy tardío |
| **Letta / MemGPT** | Runtime de agentes persistentes con memory blocks compartibles entre agentes | post-0.1 | **DESCARTAR** | Adoptar su runtime implica adoptar su arquitectura operacional completa; extraer el patrón de memory blocks sin la dependencia |
| **Zep (plataforma)** | Plataforma gestionada de memoria con Graphiti integrado | — | **DESCARTAR** | Managed lock-in; Graphiti open-source cubre lo necesario sin el servicio |

---

## SECCIÓN 3 — Insights arquitectónicos a incorporar en la especificación

---

**Event sourcing como fundamento, no como optimización.** La memoria de Jarvis no debe mutar estado; debe acumular eventos. Preferencias, decisiones y hechos son proyecciones derivadas de un log append-only. Esto permite reconstruir cualquier proyección (embeddings, grafo temporal, perfil actual) si el algoritmo de procesamiento cambia mañana. La consecuencia concreta: el esquema de 0.1 necesita una tabla `events` como objeto primario, y las tablas `claims` y `episodes` como derivadas con referencia a `source_event_ids`. Afecta: **Modelo de datos**.

**Temporalidad bitemposal mínima en todo claim.** No basta `created_at`. Cada claim semántico requiere al menos `valid_from` y `recorded_at` para distinguir cuándo era cierto en el mundo de cuándo lo aprendió Jarvis. Sin esto, una preferencia actualizada destruye el historial. El ejemplo concreto: "vive en Madrid" (válido hasta enero) y "vive en Salta" (válido desde enero) deben coexistir. Afecta: **Modelo de datos**.

**Trust propagation sin degradación.** El nivel de confianza de una fuente (`web.untrusted`, `user.authenticated`, `email.external`) debe propagarse a todos sus derivados sin excepción. Resumir un documento no confiable diez veces no lo convierte en conocimiento de usuario. Esto debe implementarse como campo `origin_trust` que viaja con cada claim y episodio, y nunca puede aumentar mediante consolidación. Afecta: **Seguridad / Modelo de datos**.

**Memoria ≠ Permiso: separación física entre memory store y policy store.** Un recuerdo que diga "el usuario autorizó transferir hasta $500" no tiene poder de autorización. Los permisos viven en un policy store separado que el LLM no puede escribir directamente. Esta separación debe ser estructural desde 0.1 aunque el policy store de 0.1 sea mínimo: importa que las dos capas sean objetos distintos en el código. Afecta: **Seguridad / Arquitectura**.

**Task Manifest: autoridad definida antes de exponerse al contenido no confiable.** Antes de que Jarvis procese cualquier contenido externo (email, web, documento), un componente confiable traduce la intención auténtica del usuario en un conjunto cerrado de capacidades. Contenido encontrado durante la tarea no puede ampliar ese conjunto. En 0.1, esto puede ser tan simple como un objeto Python que define qué operaciones puede hacer el worker de background antes de empezar a procesar. Afecta: **Arquitectura / Seguridad**.

**Blast radius como métrica de diseño.** La pregunta correcta de seguridad no es "¿qué porcentaje de inyecciones detecta el modelo?" sino "si el planner está completamente comprometido, ¿qué daño máximo puede causar con los permisos que tiene en este momento?". En 0.1, ese blast radius debe ser explícito y pequeño: el worker de background puede leer conversaciones y escribir en el memory store, no hacer requests externos, no leer credenciales, no modificar el sistema de archivos del host. Afecta: **Seguridad / Principios**.

**Planos independientes y reemplazables.** La arquitectura debe separar responsabilidades en planos que puedan evolucionar sin afectarse: Conversation Plane, Intelligence Plane, Tool Plane, Security Plane, Memory Plane, Observability Plane. En 0.1 estos planos son simples, pero nombrarlos explícitamente en la especificación evita que crezcan acoplados. La consecuencia práctica: el Memory Service expone una API abstracta (`record_event`, `query_memory`, `correct_memory`, `forget_memory`); ningún componente llama directamente a ChromaDB, SQLite o pgvector. Afecta: **Arquitectura**.

**Recuperación jerárquica: topic → episodio → hecho.** RAG simple contra todos los embeddings introduce ruido y falla en relaciones temporales y causales a largo plazo (LoCoMo, LongMemEval). La recuperación debe ser coarse-to-fine: primero identificar el tema o proyecto relevante, luego los episodios, finalmente los claims específicos. En 0.1 esto puede ser simple (topic = campo en el claim), pero el retriever debe estar diseñado para esa pipeline desde el inicio. Afecta: **Arquitectura / Modelo de datos**.

**Provenance en cada objeto derivado.** Todo claim, episodio y procedimiento debe poder responder "¿por qué Jarvis cree esto?" con una cadena `claim → source_event → message/document original`. Esto es requisito para: corregir errores, detectar memory poisoning, resolver contradicciones, auditar acciones y ejecutar borrado real en cascada. Sin provenance desde 0.1, implementar "olvida esto" requiere una migración de datos. Afecta: **Modelo de datos / Seguridad**.

**Multiuser isolation a nivel de storage, no de prompt.** Si Jarvis va a vivir en un hogar con más de una persona, la separación entre memorias de distintos usuarios no puede depender de un filtro en el system prompt. Requiere namespaces físicos en la base de datos (`user/alice/*`, `household/shared/*`) y ACL reales. Diseñar el esquema multiusuario desde 0.1 aunque en la práctica haya un solo usuario es mucho más barato que agregarlo después. Afecta: **Modelo de datos / Seguridad**.

**Background consolidation separada de la conversación.** El procesamiento de eventos (extracción de claims, detección de episodios, deduplicación, consolidación de narrativas) nunca debe bloquear la respuesta al usuario. El worker de background de 0.1 ya implementa esto correctamente. El insight adicional de la investigación: la consolidación debe correr también en idle time periódico (daily/weekly) para actualizar episodios, detectar stale facts y actualizar el perfil actual. Esos jobs deben ser parte del diseño desde el inicio, aunque en 0.1 sean simples. Afecta: **Arquitectura**.
