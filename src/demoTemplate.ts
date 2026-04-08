export const DEMO_NODES = [
    {
        id: "auth-login",
        type: "feature",
        label: "Authentication Login Endpoint",
        spec_interface: "### The Contract\n- **Endpoint**: `POST /api/v1/auth/login`\n- **Request Schema**:\n  - `email` (string, required, valid email format)\n  - `password` (string, required)\n- **Response Schema**:\n  - `200 OK`: `{ token: string, user: { id: string, name: string } }`\n  - `401 Unauthorized`: `{ error: string }`",
        spec_constraints: "### Validation Rules & Guardrails\n- **Password Security**: Must use `bcryptjs` for hash comparison.\n- **Rate Limiting**: IP-based rate limiting required (max 5 attempts per 15 minutes).\n- **Database Dependency**: Must interact with the `auth_users` DB Model via Prisma.",
        spec_interactions: "### System Patterns\n1. Validate payload against Zod schema.\n2. Query database for user by email.\n3. Compare hashes.\n4. If successful, generate secure JWT and return 200 payload.\n5. If unsuccessful, log failure anonymously and return 401.",
        spec_metadata: "### Documentation\n- **Owner**: Backend Auth Team\n- **Security**: Public route\n- **Performance**: Latency < 150ms",
        position: { x: 250, y: 150 }
    },
    {
        id: "user-profile",
        type: "feature",
        label: "User Profile Dashboard",
        spec_interface: "### The Contract\n- **Endpoint**: `GET /api/v1/users/profile`\n- **Request Schema**:\n  - Header: `Authorization: Bearer <JWT>`\n- **Response Schema**:\n  - `200 OK`: `{ id: 'uuid', name: 'string', email: 'string', preferences: 'object' }`\n  - `401 Unauthorized`: `{ error: string }`",
        spec_constraints: "### Validation Rules & Guardrails\n- **Auth Enforcement**: Request MUST contain a valid JWT assigned by `auth-login`.\n- **PII Guardrail**: Never expose hashed passwords or reset tokens in this API.",
        spec_interactions: "### System Patterns\n1. Intercept via Auth Middleware.\n2. Decode JWT to extract UUID.\n3. Poll `users_db` for active matching user.\n4. Format safely, omitting private database fields.",
        spec_metadata: "### Documentation\n- **Owner**: Frontend & Core Team\n- **Security**: Protected route\n- **Dependencies**: Depends entirely on valid Auth state.",
        position: { x: 250, y: 350 }
    },
    {
        id: "users-db",
        type: "dbModel",
        label: "Users Database Table",
        spec_interface: "### The Contract\n- **Table Name**: `auth_users`\n- **Columns**:\n  - `id` (UUID, Primary Key)\n  - `email` (VARCHAR, Unique, Not Null)\n  - `password_hash` (VARCHAR, Not Null)\n  - `preferences` (JSONB, Default: '{}')",
        spec_constraints: "### Validation Rules & Guardrails\n- **Indexing**: Must index by `email` for rapid O(1) auth lookup.\n- **Immutability**: `id` cannot be altered post-creation.",
        spec_interactions: "### System Patterns\n1. Created via Signup pipeline.\n2. Queried heavily by `auth-login` for read-only hash checking.\n3. Referenced by `user-profile`.",
        spec_metadata: "### Documentation\n- **Owner**: Database Admin\n- **Storage**: PostgreSQL 16+\n- **Scale**: Estimated 1M rows/year",
        position: { x: 600, y: 250 }
    }
];
