/**
 * src/skill/index.ts
 *
 * Public entry point for the skill surface. Re-exports the thin dispatcher so
 * a bring-your-own-model host can `import { runSkillAction } from "rhwp-mcp-server/skill"`
 * (or the built path) and drive the same core handlers the MCP server uses,
 * without going through the MCP protocol or requiring a separate subscription.
 */

export {
  SKILL_ACTIONS,
  listSkillActions,
  isSkillAction,
  runSkillAction,
  warmSkillEngine,
  UnknownSkillActionError,
  type SkillActionName,
  type SkillActionInput,
  type SkillActionResult,
} from "./dispatcher.js";
