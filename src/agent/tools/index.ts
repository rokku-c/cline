import { OpenAI, } from 'openai'
import { AutoParseableTool, makeParseableTool } from "openai/lib/parser"

export async function callTool(tool_call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall, availableTools: AutoParseableTool<any, true>[]): Promise<any> {
    const tools = availableTools.filter((x) => (x.function.name === tool_call.function.name))
    if (tools.length === 0) {
        return `Tools Not Found.`
    }
    const tool = tools[0]
    if (tool.$callback !== undefined) {
        let argsCall = tool_call.function.arguments
        if (tool.$parseRaw !== undefined) {
            argsCall = tool.$parseRaw(argsCall)
        }
        return await tool.$callback(argsCall)
    } else {
        return `Tools Internal Error`
    }
}
