---
trigger: always_on
---

# Reglas de Ejecución y Control de Presupuesto

- `disabled_agents`: ["oracle", "sisyphus-orchestration"]
- No ejecutes herramientas ni comandos de terminal en bucle de manera autónoma.
- Queda terminantemente prohibido crear subagentes o delegar tareas sin confirmación explícita del usuario.
- Realiza una sola iteración por mensaje y detén el flujo esperando feedback del usuario.
