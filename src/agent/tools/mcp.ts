import { OpenAI, } from 'openai'
import { AutoParseableTool, makeParseableTool } from "openai/lib/parser"
import { Agentic } from "../types"
import { helperTools } from './helper'
import { Client } from "@modelcontextprotocol/sdk/client/index.js"

export async function mcpTools(agent: Agentic, clients: Client[]): Promise<AutoParseableTool<any, true>[]> {
    if (clients.length === 0) {
        return []
    }
    let tools: AutoParseableTool<any, true>[] = []
    const run = clients.map(async (client, i, a) => {
        return (await client.listTools()).tools.map((tool) => {
            let toolsFunc = async (args: any) => {
                try {
                    return await client.callTool({ name: tool.name, arguments: args })
                } catch (error) {
                    return `${error}`
                }
            }
            Object.defineProperty(toolsFunc, "name", { value: tool.name })
            return makeParseableTool<any>({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                }
            }, { callback: toolsFunc, parser: JSON.parse }) as AutoParseableTool<any, true>
        })
    })
    tools = tools.concat(...(await Promise.all(run)))
    return tools
}