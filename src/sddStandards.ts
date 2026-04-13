/**
 * VisDev Architectural Standards for Specification-Driven Development (SDD)
 */

export const VISDEV_LAYER_ENUM = `
- **domain**: Core business logic or service modules (stored in specs/domain/).
- **ui**: Frontend components, pages, or visual elements (stored in specs/ui/).
- **external**: Third-party APIs, external systems, or integrations (stored in specs/external/).
- **data**: Persistent storage, databases, or static registries (stored in specs/data/).
- **infra**: Infrastructure components (gateways, load balancers, caching) (stored in specs/infra/).
- **worker**: Background processes, cron jobs, or message consumers (stored in specs/worker/).
`.trim();

export const VISDEV_SPEC_YAML_SCHEMA = `
### VisDev YAML Specification Reference (OpenAPI 3.1.x)
Every Spec file MUST strictly adhere to these top-level keys and the 'x-visdev-' extensions:

\`\`\`yaml
openapi: 3.1.0
info:
  title: [Human Readable Title]
  version: 1.0.0
  description: [Functional purpose of this node]
  x-visdev-layer: [domain | ui | external | data | infra | worker]
  x-visdev-position:
    x: [number]
    y: [number]
  x-visdev-color: [Optional hex code, e.g. "#2ecc71"]
  x-visdev-tests:
    - name: [Scenario Name]
      scenario: [Step-by-step description]
      expected: [Outcome or Assertion]

components:
  schemas:
    [EntityName]:
      type: object
      properties:
        [fieldName]:
          type: [type]
          x-link-target: "[relativePath]#[targetPath]" # RELATIONAL LINKING

paths:
  /[path]:
    [method]:
      summary: [Summary]
      responses:
        '200':
          description: OK
\`\`\`
`.trim();

export const SDD_TYPE_MANUAL = `
## VisDev Architectural Node Types (Reference Manual)
You MUST categorize every node into one of these types. Each type has specific technical requirements for its Spec pillars:

1. **api**: REST/GraphQL/gRPC endpoints.
   - *Structured*: Must define endpoints, methods, and paths.
   - *Constraints*: Must define Auth requirements and payload validation.

2. **uiComponent**: Frontend UI modules.
   - *Structured*: Must define props, emits, and consumed APIs.
   - *Constraints*: Must define UX state rules and visual constraints.

3. **dbModel**: Database entities/tables.
   - *Structured*: Must define fields and data types.
   - *Constraints*: Must define primary keys, unique constraints, and indices.

4. **event**: Asynchronous messages or triggers.
   - *Structured*: Must define eventName and payload schema.
   - *Interactions*: Must define producers and consumers.

5. **worker**: Background tasks, cron jobs, or queue processors.
   - *Structured*: Must define jobName and schedule (cron).
   - *Constraints*: Must define timeout limits and retry strategies.

6. **logic**: Pure business logic or service modules (headless).
   - *Structured*: Must define public methods.
   - *Constraints*: Must define input domain invariants.

7. **gateway**: Proxies, Load Balancers, or Auth Gateways.
   - *Structured*: Must define routing rules.
   - *Interactions**: Must define upstream vs downstream flows.

8. **cache**: Redis, Memcached, or local caching layers.
   - *Structured*: Must define engine and TTL policy.
   - *Constraints**: Must define eviction strategy (LRU, LFU).

9. **externalService**: Third-party APIs (Stripe, Twilio, etc.).
   - *Structured*: Must define serviceName and provider info.
   - *Constraints*: Must define API Key safety and Rate Limit handling.

10. **note**: Organizational notes or ADRs.
    - *Content*: Architectural reasoning or placeholders.

11. **boundary**: Visual grouping for subsystems.
    - *Purpose*: Grouping related nodes (e.g. "Payment Subsystem").
`.trim();

export const SDD_PILLAR_DEFINITIONS = {
    CONSTRAINTS: `
### Pillar 2: Constraints & Validation Rules
Define the "Rules of the Game". This field MUST include:
1. **Data Validation**: Field types, regex patterns, enum values.
2. **Business Invariants**: Rules that must ALWAYS be true.
3. **Security Constraints**: Access control rules.
`.trim(),

    INTERACTION_PATTERNS: `
### Pillar 3: Interaction Patterns
Define the "Sequence". This field MUST include:
1. **Sequences**: Logical flow (e.g., 1. Validate -> 2. Write).
2. **Fault Tolerance**: Retry logic and error handlers.
3. **Side Effects**: Secondary actions (emails, analytics).
`.trim(),

    METADATA: `
### Pillar 4: Metadata & Documentation
Define the "Context". This field MUST include:
1. **Functional Purpose**: Why does this node exist?
2. **Ownership**: Who maintains this spec?
3. **Classification Tags**: e.g., #MissionCritical, #Experimental.
`.trim(),

    VERIFICATION: `
### Pillar 5: Testing & Verification
Define the "Correctness". This field MUST include:
1. **Test Scenarios**: Step-by-step logical verification paths (stored in x-visdev-tests).
2. **Edge Cases**: Identification of failure modes and boundary conditions.
3. **Expected Outcomes**: Explicit assertions for system behavior.
`.trim()
};

export const VISDEV_ARCHITECTURAL_STANDARD_PROMPT = `
VISDEV ARCHITECTURAL STANDARD:
When creating or updating a Specification Node, you MUST follow this reference manual:

${SDD_TYPE_MANUAL}

---

VISDEV DATA ENUM LEVELS (x-visdev-layer):
${VISDEV_LAYER_ENUM}

---

TECHNICAL SCHEMA STANDARD:
${VISDEV_SPEC_YAML_SCHEMA}

---

CORE PILLAR REQUIREMENTS:
${SDD_PILLAR_DEFINITIONS.CONSTRAINTS}

${SDD_PILLAR_DEFINITIONS.INTERACTION_PATTERNS}

${SDD_PILLAR_DEFINITIONS.METADATA}

${SDD_PILLAR_DEFINITIONS.VERIFICATION}

---

FORMATTING STANDARD:
1. YOU MUST respond using GitHub Flavored Markdown.
2. Use technical tables for all specification summaries and comparisons.
3. Wrap all code, schemas, and interface definitions in fenced code blocks with appropriate language tags (e.g., \`typescript\`, \`json\`, \`markdown\`).
`;
