# Diretrizes Globais do Workspace (Constituição dos Agentes)

Este documento estabelece as regras universais que **todos os agentes, skills, personas e ferramentas** devem seguir rigorosamente ao operar neste projeto. Nenhuma instrução específica de agente pode violar as diretrizes deste arquivo.

---

## 1. Idioma e Comunicação
- **Respostas e Interações:** Comunique-se sempre em Português (Brasil), de forma clara, técnica e objetiva.
- **Código-fonte:** Comentários, nomes de variáveis, funções, classes, arquivos e mensagens de commit devem ser redigidos em **Inglês**.
- **Transparência:** Explique de forma breve o "porquê" de decisões não triviais antes ou durante a execução de alterações.

---

## 2. Qualidade e Engenharia de Software
- **Padrões de Código:** Siga boas práticas consolidadas de mercado: princípios SOLID, DRY (*Don't Repeat Yourself*) e KISS (*Keep It Simple, Stupid*).
- **Tipagem Estrita:** Utilize tipagem estática e explícita sempre que o ecossistema permitir (ex: TypeScript, Python type hints, etc.).
- **Modificações Mínimas e Cirúrgicas:** Não refatore código não relacionado à tarefa atual sem solicitação explícita. Preserve comentários e documentações existentes.

---

## 3. Segurança Inegociável (Security by Design)
- **Gestão de Segredos:** Jamais inclua tokens, chaves de API, senhas ou credenciais diretamente no código (`hardcoded`). Utilize variáveis de ambiente (`.env`) ou mecanismos de cofre.
- **Validação de Entrada:** Todo dado proveniente do usuário, de APIs externas ou de bancos de dados deve ser tratado como potencialmente hostil, sendo validado na entrada e sanitizado na saída.
- **Princípio do Menor Privilégio:** Permissões, acessos a bancos de dados e credenciais de infraestrutura devem ser os mais restritivos possíveis.
- **Confinamento Estrito ao Workspace:** É expressamente proibido executar comandos de terminal ou criar/modificar arquivos fora do diretório raiz do projeto (`/mnt/Dados/Projetos/run/`). Nenhuma operação deve interferir em pastas do sistema operacional ou no home do usuário (`~`).

---

## 4. Testes e Confiabilidade (Zero Regressão)
- **Cultura de Testes:** Nenhuma alteração significativa de lógica de negócio é considerada concluída sem que haja testes automatizados correspondentes (caminho feliz e casos extremos).
- **Correção de Bugs:** Toda correção de defeito deve ser acompanhada de um teste que reproduza a falha antes da correção (teste de regressão), garantindo que o problema nunca mais retorne.
- **Padrão AAA:** Estruture todos os testes segundo o modelo Arrange, Act, Assert.

---

## 5. Versionamento e Git
- **Conventional Commits:** Todas as mensagens de commit devem seguir o padrão:
  - `feat:` para novas funcionalidades
  - `fix:` para correções de bugs
  - `refactor:` para melhorias de código sem alteração de comportamento
  - `test:` para criação ou alteração de testes
  - `docs:` para alterações em documentação
  - `chore:` para tarefas operacionais, dependências ou configurações
- **Branches e Arquivos:** Não faça commits diretamente com arquivos temporários, logs, pastas `.env` ou artefatos de build.

---

## 6. Memory Palace (Mapa Cognitivo Compartilhado)
- **Acesso Universal:** O arquivo [`docs/memory-palace/PALACE.md`](docs/memory-palace/PALACE.md) é a fonte compartilhada de arquitetura, limites de domínio e contexto mental entre todos os agentes.
- **Consulta Obrigatória:** Antes de propor alterações arquiteturais ou integrações entre sistemas (frontend, backend, jogos, testes e segurança), consulte a câmara correspondente no Palácio.
- **Registro de Mudanças:** Alterações estruturais e novas decisões técnicas devem ser registradas na tabela de *Histórico de Decisões* do Memory Palace.

---

## 7. Comunicação entre Agentes e Autorização do Usuário (Human-in-the-Loop)
- **Comunicação Transparente:** Agentes podem colaborar, delegar tarefas e trocar mensagens entre si, desde que comuniquem previamente ao usuário o que pretendem solicitar e a qual agente.
- **Aprovação Obrigatória:** O agente líder/orquestrador (como o `planner`) pode propor e preparar o prompt ou plano para outro agente executar, mas **deve sempre pedir autorização explícita do usuário** antes de disparar a execução ou submeter comandos a outros agentes executores.
- **Visibilidade:** O usuário deve ter total clareza de quem está executando o quê, qual é o objetivo do prompt delegado e quais arquivos serão afetados.


