---
name: memory-palace
description: "Usa esta skill para consultar, navegar ou atualizar o mapa cognitivo do sistema (Memory Palace), registrando decisões arquiteturais, limites de domínio e regras mnemônicas entre agentes."
---

# Skill: Memory Palace

Esta skill gerencia o mapa conceitual, arquitetural e as âncoras cognitivas do projeto, mantendo alinhamento entre todos os agentes.

## Procedimento de Operação

1. **Leitura e Consulta do Palácio:**
   - O arquivo mestre do Palácio está localizado em:
     [`docs/memory-palace/PALACE.md`](../../docs/memory-palace/PALACE.md)
   - Sempre que uma tarefa envolver decisões de arquitetura, limites de domínio ou integração entre múltiplas especialidades, leia o estado atual da câmara correspondente.

2. **Câmaras Existentes:**
   - **Câmara 0 (`cybersecurity`):** Defesas, credenciais, sanitização e OWASP.
   - **Câmara 1 (`planner`):** Visão estratégica, roadmaps e prompts de orquestração.
   - **Câmara 2 (`engineer-backend`):** APIs, dados, lógica de negócio e Clean Architecture.
   - **Câmara 3 (`engineer-frontend`):** Interface, UX, Tailwind/CSS e acessibilidade (a11y).
   - **Câmara 4 (`tester`):** Suíte de testes, cobertura e regressão (AAA).
   - **Câmara 5 (`gamer`):** Game loop, FPS, física e ciclo de vida de memória.

3. **Atualização do Palácio:**
   - Sempre que um agente introduzir um novo subsistema, mudar uma regra de arquitetura ou resolver um bug com impacto estrutural, adicione uma entrada na tabela de **Histórico de Decisões do Palácio** em [`docs/memory-palace/PALACE.md`](../../docs/memory-palace/PALACE.md).

