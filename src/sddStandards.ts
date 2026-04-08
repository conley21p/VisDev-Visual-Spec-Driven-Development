/**
 * VisDev Architectural Standards for Specification-Driven Development (SDD)
 */

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
`.trim()
};

export const VISDEV_ARCHITECTURAL_STANDARD_PROMPT = `
VISDEV ARCHITECTURAL STANDARD:
When creating or updating a Specification Node, you MUST follow this reference manual:

${SDD_TYPE_MANUAL}

---

CORE PILLAR REQUIREMENTS:
${SDD_PILLAR_DEFINITIONS.CONSTRAINTS}

${SDD_PILLAR_DEFINITIONS.INTERACTION_PATTERNS}

${SDD_PILLAR_DEFINITIONS.METADATA}
`;
