import summarizeTool from './tools/summarize.js';
import newsTool from './tools/news.js';

class MCPClient {
  constructor() {
    this.tools = new Map();
    this.register(summarizeTool);
    this.register(newsTool);
  }

  register(tool) {
    if (!tool.name || !tool.handler) {
      throw new Error(`Invalid tool registration. Tool must have 'name' and 'handler'.`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[MCP Server] Registered tool: ${tool.name}`);
  }

  async call(toolName, args = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    try {
      console.log(`[MCP Client] Invoking tool "${toolName}" with arguments:`, args);
      return await tool.handler(args);
    } catch (error) {
      console.error(`[MCP Client] Error executing tool "${toolName}":`, error);
      return {
        error: error.message || "An error occurred while executing the tool."
      };
    }
  }

  getTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
  }
}

export const mcpClient = new MCPClient();
export default mcpClient;
