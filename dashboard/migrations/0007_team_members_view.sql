-- The users the MCP server's read-only SQL may see: no password hashes. Raw `users` is blocked there (worker/mcp/sql.ts).
CREATE VIEW team_members AS SELECT id, username, role, is_active, created_at, updated_at FROM users;
